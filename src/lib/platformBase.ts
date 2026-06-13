import type {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';
import { LevelLogger, LogLevel } from './levelLogger.js';

/**
 * Minimal typed base for a dynamic platform, modelled on ebaauw's homebridge-lib:
 * a self-correcting 1-second heartbeat with an integer `beat` counter, plus
 * cached-accessory bookkeeping. Subclasses run discovery off `didFinishLaunching`
 * and rate-limit polling with `beat % heartrate === 0`.
 */
export abstract class PlatformBase implements DynamicPlatformPlugin {
  /** Cached accessories restored by Homebridge, keyed by UUID. */
  readonly cachedAccessories = new Map<string, PlatformAccessory>();
  readonly log: LevelLogger;

  protected beat = -1;
  private heartbeatTimer?: ReturnType<typeof setTimeout>;
  private readonly heartbeatHandlers: Array<(beat: number) => void> = [];

  constructor(
    rawLog: Logging,
    readonly config: PlatformConfig,
    readonly api: API,
    level: LogLevel = LogLevel.Info,
  ) {
    this.log = new LevelLogger(rawLog, level);

    this.api.on('didFinishLaunching', () => {
      Promise.resolve(this.discoverDevices())
        .then(() => this.startHeartbeat())
        .catch((error) => this.log.error('startup failed: %s', formatError(error)));
    });
    this.api.on('shutdown', () => this.stopHeartbeat());
  }

  /** Called by Homebridge for each accessory restored from disk cache. */
  configureAccessory(accessory: PlatformAccessory): void {
    this.cachedAccessories.set(accessory.UUID, accessory);
    this.log.debug('restored cached accessory: %s', accessory.displayName);
  }

  /** Subscribe to the 1-second heartbeat. */
  onHeartbeat(handler: (beat: number) => void): void {
    this.heartbeatHandlers.push(handler);
  }

  protected registerAccessory(accessory: PlatformAccessory): void {
    this.api.registerPlatformAccessories(this.pluginName, this.platformName, [accessory]);
  }

  protected unregisterAccessory(accessory: PlatformAccessory): void {
    this.api.unregisterPlatformAccessories(this.pluginName, this.platformName, [accessory]);
    this.cachedAccessories.delete(accessory.UUID);
  }

  private startHeartbeat(): void {
    this.scheduleBeat(Date.now() + 1000);
  }

  private scheduleBeat(nextAt: number): void {
    const delay = Math.max(1, nextAt - Date.now());
    this.heartbeatTimer = setTimeout(() => {
      this.beat += 1;
      for (const handler of this.heartbeatHandlers) {
        try {
          handler(this.beat);
        } catch (error) {
          this.log.error('heartbeat handler error: %s', formatError(error));
        }
      }
      this.scheduleBeat(nextAt + 1000);
    }, delay);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  protected abstract get pluginName(): string;
  protected abstract get platformName(): string;
  protected abstract discoverDevices(): Promise<void> | void;
}

/** Normalise unknown thrown values to a readable string. */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
