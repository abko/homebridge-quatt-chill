import type { LevelLogger } from '../lib/levelLogger.js';
import type { QuattAuth } from './auth.js';
import { PAIRING_TIMEOUT_SECONDS } from './constants.js';
import { InstallationsResponseSchema, MeResponseSchema } from './types.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface PairResult {
  installationId: string;
}

/**
 * One-time pairing: ensure an anonymous identity exists, ask the CIC to pair,
 * then wait for the user to press the physical button on the CIC. Resolves with
 * the installation id needed for all subsequent Chill calls.
 */
export async function pairCic(
  auth: QuattAuth,
  cicId: string,
  log: LevelLogger,
  timeoutSeconds: number = PAIRING_TIMEOUT_SECONDS,
): Promise<PairResult> {
  if (!auth.isAuthenticated) {
    log.info('creating anonymous Quatt identity...');
    await auth.signUp();
  }

  log.info('requesting pairing with CIC "%s"...', cicId);
  await auth.request(`/me/cic/${cicId}/requestPair`, { method: 'POST', body: {} });

  log.info('>>> Press the button on your Quatt CIC now (within %d seconds) <<<', timeoutSeconds);

  const wanted = cicId.toLowerCase();
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const me = MeResponseSchema.parse(await auth.request('/me'));
    const paired = me.result.cicIds ?? [];
    log.vdebug('paired cicIds: %s', JSON.stringify(paired));
    if (paired.some((id) => id.toLowerCase() === wanted)) {
      log.info('CIC paired. Fetching installation...');
      const installations = InstallationsResponseSchema.parse(
        await auth.request('/me/installations'),
      );
      const installation = installations.result[0];
      if (!installation) {
        throw new Error('paired, but no installation was returned for this account');
      }
      return { installationId: installation.externalId };
    }
    await sleep(2000);
  }

  throw new Error(
    `pairing timed out after ${timeoutSeconds}s — was the button on CIC "${cicId}" pressed in time?`,
  );
}
