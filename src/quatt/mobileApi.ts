import type { LevelLogger } from '../lib/levelLogger.js';
import type { QuattAuth } from './auth.js';
import { ChillsResponseSchema, type Chill, type ChillAction } from './types.js';

/** Typed wrappers over the Quatt mobile API endpoints we use at runtime. */
export class QuattMobileClient {
  constructor(
    private readonly auth: QuattAuth,
    private readonly log: LevelLogger,
  ) {}

  /** Fetch all Chill devices for an installation. */
  async getChills(installationId: string): Promise<Chill[]> {
    const data = await this.auth.request(
      `/me/installation/${installationId}/devices/chills`,
    );
    const parsed = ChillsResponseSchema.parse(data);
    this.log.vdebug('fetched %d chill(s)', parsed.result.chills.length);
    return parsed.result.chills;
  }

  /** POST a control action to a single Chill. */
  async sendChillAction(
    installationId: string,
    chillUuid: string,
    action: ChillAction,
  ): Promise<void> {
    this.log.debug('chill %s action %s', chillUuid, JSON.stringify(action));
    await this.auth.request(
      `/me/installation/${installationId}/devices/chills/${chillUuid}/actions`,
      { method: 'POST', body: action },
    );
  }
}
