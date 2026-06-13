import { join } from 'node:path';
import type { API, Logging, PlatformConfig } from 'homebridge';
import { ChillAccessory } from './chillAccessory.js';
import { ConfigSchema, type QuattChillConfig } from './config.js';
import { PlatformBase, formatError } from './lib/platformBase.js';
import { QuattAuth } from './quatt/auth.js';
import { QuattMobileClient } from './quatt/mobileApi.js';
import type { Chill } from './quatt/types.js';
import { DEFAULT_TOKEN_FILENAME, PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

/** Delay after a control action before re-polling, to let the cloud settle. */
const POST_ACTION_REFRESH_MS = 3000;

/** Consecutive polls a Chill must be absent before we remove its accessory. */
const MISSING_POLLS_BEFORE_REMOVE = 5;

export class QuattChillPlatform extends PlatformBase {
  readonly settings: QuattChillConfig;
  readonly client: QuattMobileClient;
  private readonly auth: QuattAuth;
  private readonly accessoriesByChill = new Map<string, ChillAccessory>();
  private readonly missCounts = new Map<string, number>();
  private readonly heartrateBeats: number;
  private refreshing = false;
  private postActionTimer?: ReturnType<typeof setTimeout>;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    const settings = ConfigSchema.parse(config);
    super(log, config, api, settings.logLevel);
    this.settings = settings;
    this.heartrateBeats = Math.round(settings.heartrateSeconds);

    const tokenFile = settings.tokenFile ?? join(api.user.storagePath(), DEFAULT_TOKEN_FILENAME);
    this.auth = new QuattAuth(tokenFile, this.log);
    this.client = new QuattMobileClient(this.auth, this.log);
    this.log.debug('using token file %s', tokenFile);
  }

  protected get pluginName(): string {
    return PLUGIN_NAME;
  }
  protected get platformName(): string {
    return PLATFORM_NAME;
  }

  /** The installation id, or throw a clear error if pairing hasn't been done. */
  requireInstallationId(): string {
    if (!this.settings.installationId) {
      throw new Error('installationId is not configured — run pairing first');
    }
    return this.settings.installationId;
  }

  protected async discoverDevices(): Promise<void> {
    if (!this.settings.installationId) {
      this.log.warn(
        'Not paired yet: set "cicId" and run `quatt-chill-pair --cic %s`, then put the ' +
          'returned installationId in the config. Skipping for now.',
        this.settings.cicId ?? '<cic-hostname>',
      );
      return;
    }

    await this.auth.load();
    if (!this.auth.isAuthenticated) {
      this.log.warn(
        'No Quatt tokens found. Run `quatt-chill-pair --cic %s` and restart Homebridge.',
        this.settings.cicId ?? '<cic-hostname>',
      );
      return;
    }

    await this.refresh();

    // Poll at the configured cadence.
    this.onHeartbeat((beat) => {
      if (beat > 0 && beat % this.heartrateBeats === 0) {
        this.refresh().catch((error) => this.log.error('poll failed: %s', formatError(error)));
      }
    });
  }

  /** Fetch current Chill state and reconcile accessories. */
  private async refresh(): Promise<void> {
    if (this.refreshing) {
      return;
    }
    this.refreshing = true;
    try {
      const chills = await this.client.getChills(this.requireInstallationId());
      this.reconcile(chills);
    } catch (error) {
      this.log.error('failed to fetch chills: %s', formatError(error));
    } finally {
      this.refreshing = false;
    }
  }

  /** Create/update accessories for current chills and prune ones that vanished. */
  private reconcile(chills: Chill[]): void {
    const seen = new Set<string>();
    for (const chill of chills) {
      seen.add(chill.uuid);
      this.missCounts.delete(chill.uuid);
      const existing = this.accessoriesByChill.get(chill.uuid);
      if (existing) {
        existing.update(chill);
        continue;
      }
      this.addAccessory(chill);
    }

    // A Chill can drop out of the list briefly when it loses its link to the CIC.
    // Only remove its accessory after it has been absent for several polls.
    for (const uuid of this.accessoriesByChill.keys()) {
      if (seen.has(uuid)) {
        continue;
      }
      const misses = (this.missCounts.get(uuid) ?? 0) + 1;
      this.missCounts.set(uuid, misses);
      if (misses < MISSING_POLLS_BEFORE_REMOVE) {
        this.log.debug('chill %s missing (%d/%d)', uuid, misses, MISSING_POLLS_BEFORE_REMOVE);
        continue;
      }
      this.log.info('chill %s gone for %d polls, removing', uuid, misses);
      const cached = this.cachedAccessories.get(this.api.hap.uuid.generate(uuid));
      if (cached) {
        this.unregisterAccessory(cached);
      }
      this.accessoriesByChill.delete(uuid);
      this.missCounts.delete(uuid);
    }
  }

  private addAccessory(chill: Chill): void {
    const hapUuid = this.api.hap.uuid.generate(chill.uuid);
    let accessory = this.cachedAccessories.get(hapUuid);
    if (accessory) {
      this.log.debug('reusing cached accessory for chill %s', chill.uuid);
    } else {
      accessory = new this.api.platformAccessory(chill.name ?? 'Quatt Chill', hapUuid);
      this.registerAccessory(accessory);
      this.cachedAccessories.set(hapUuid, accessory);
      this.log.info('added chill "%s" (%s)', chill.name ?? 'Quatt Chill', chill.uuid);
    }
    this.accessoriesByChill.set(chill.uuid, new ChillAccessory(this, accessory, chill));
  }

  /** Re-poll shortly after a control action so HomeKit reflects the change. */
  scheduleRefreshSoon(): void {
    if (this.postActionTimer) {
      clearTimeout(this.postActionTimer);
    }
    this.postActionTimer = setTimeout(() => {
      this.refresh().catch((error) =>
        this.log.error('post-action poll failed: %s', formatError(error)),
      );
    }, POST_ACTION_REFRESH_MS);
  }
}
