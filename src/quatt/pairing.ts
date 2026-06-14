import type { LevelLogger } from '../lib/levelLogger.js';
import type { QuattAuth } from './auth.js';
import { PAIRING_TIMEOUT_SECONDS } from './constants.js';
import { InstallationsResponseSchema, MeResponseSchema } from './types.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface PairResult {
  installationId: string;
}

/** Ensure an anonymous identity exists, then ask the CIC to start pairing. */
export async function requestPair(
  auth: QuattAuth,
  cicId: string,
  log: LevelLogger,
): Promise<void> {
  if (!auth.isAuthenticated) {
    log.info('creating anonymous Quatt identity...');
    await auth.signUp();
  }
  log.info('requesting pairing with CIC "%s"...', cicId);
  await auth.request(`/me/cic/${cicId}/requestPair`, { method: 'POST', body: {} });
}

/**
 * Return the installation id if the CIC is now paired to this identity, else null.
 * Match case-insensitively — the CIC hostname can differ in case across sources.
 */
export async function checkPaired(auth: QuattAuth, cicId: string): Promise<string | null> {
  const me = MeResponseSchema.parse(await auth.request('/me'));
  const wanted = cicId.toLowerCase();
  if (!(me.result.cicIds ?? []).some((id) => id.toLowerCase() === wanted)) {
    return null;
  }
  const installations = InstallationsResponseSchema.parse(await auth.request('/me/installations'));
  const installationId = installations.result[0]?.externalId;
  if (!installationId) {
    throw new Error('paired, but no installation was returned for this account');
  }
  return installationId;
}

/**
 * Full interactive pairing: request pairing, then wait for the user to press the
 * physical button on the CIC. Used by the log-based boot flow and the CLI.
 */
export async function pairCic(
  auth: QuattAuth,
  cicId: string,
  log: LevelLogger,
  timeoutSeconds: number = PAIRING_TIMEOUT_SECONDS,
): Promise<PairResult> {
  await requestPair(auth, cicId, log);
  log.info('>>> Press the button on your Quatt CIC now (within %d seconds) <<<', timeoutSeconds);

  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const installationId = await checkPaired(auth, cicId);
    if (installationId) {
      log.info('CIC paired (installation %s).', installationId);
      return { installationId };
    }
    await sleep(2000);
  }
  throw new Error(
    `pairing timed out after ${timeoutSeconds}s — was the button on CIC "${cicId}" pressed in time?`,
  );
}

/**
 * Resolve the installation id for boot: if already paired, resolve without a button
 * press; otherwise run the interactive pairing (which waits for the button).
 */
export async function ensureInstallation(
  auth: QuattAuth,
  cicId: string,
  log: LevelLogger,
): Promise<string> {
  if (auth.isAuthenticated) {
    const installationId = await checkPaired(auth, cicId);
    if (installationId) {
      return installationId;
    }
  }
  const { installationId } = await pairCic(auth, cicId, log);
  return installationId;
}
