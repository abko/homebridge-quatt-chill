import { describe, expect, it, vi } from 'vitest';
import { LevelLogger, LogLevel } from '../src/lib/levelLogger.js';
import { checkPaired, ensureInstallation, pairCic } from '../src/quatt/pairing.js';
import type { QuattAuth } from '../src/quatt/auth.js';

const silentLog = new LevelLogger({ info() {}, warn() {}, error() {} }, LogLevel.Off);

/** A fake QuattAuth: optionally becomes paired the moment requestPair is called. */
function fakeAuth(opts: {
  authenticated: boolean;
  installationId: string;
  pairsOnRequest?: boolean;
  initialCicIds?: string[];
}) {
  let cicIds = opts.initialCicIds ?? [];
  const auth = {
    isAuthenticated: opts.authenticated,
    signUp: vi.fn(async () => {
      auth.isAuthenticated = true;
    }),
    request: vi.fn(async (path: string) => {
      if (path === '/me') {
        return { result: { cicIds } };
      }
      if (path === '/me/installations') {
        return { result: [{ externalId: opts.installationId }] };
      }
      if (path.endsWith('/requestPair')) {
        if (opts.pairsOnRequest) {
          cicIds = ['cic-abc'];
        }
        return undefined;
      }
      throw new Error(`unexpected path ${path}`);
    }),
  };
  return auth as unknown as QuattAuth & { signUp: ReturnType<typeof vi.fn>; request: ReturnType<typeof vi.fn> };
}

describe('checkPaired', () => {
  it('returns the installation id when the CIC is paired (case-insensitive)', async () => {
    const auth = fakeAuth({ authenticated: true, installationId: 'INS-1', initialCicIds: ['CIC-ABC'] });
    expect(await checkPaired(auth, 'cic-abc')).toBe('INS-1');
  });

  it('returns null when the CIC is not paired', async () => {
    const auth = fakeAuth({ authenticated: true, installationId: 'INS-1', initialCicIds: [] });
    expect(await checkPaired(auth, 'cic-abc')).toBeNull();
  });
});

describe('ensureInstallation', () => {
  it('resolves without pairing when already paired (no signup, no requestPair)', async () => {
    const auth = fakeAuth({ authenticated: true, installationId: 'INS-9', initialCicIds: ['cic-abc'] });
    expect(await ensureInstallation(auth, 'cic-abc', silentLog)).toBe('INS-9');
    expect(auth.signUp).not.toHaveBeenCalled();
    const requestedPair = auth.request.mock.calls.some((c) => String(c[0]).endsWith('/requestPair'));
    expect(requestedPair).toBe(false);
  });

  it('pairs (requestPair + poll) when not yet paired', async () => {
    const auth = fakeAuth({ authenticated: true, installationId: 'INS-7', pairsOnRequest: true });
    expect(await ensureInstallation(auth, 'cic-abc', silentLog)).toBe('INS-7');
    const requestedPair = auth.request.mock.calls.some((c) => String(c[0]).endsWith('/requestPair'));
    expect(requestedPair).toBe(true);
  });

  it('signs up first when there is no identity yet', async () => {
    const auth = fakeAuth({ authenticated: false, installationId: 'INS-3', pairsOnRequest: true });
    expect(await ensureInstallation(auth, 'cic-abc', silentLog)).toBe('INS-3');
    expect(auth.signUp).toHaveBeenCalledOnce();
  });
});

describe('pairCic', () => {
  it('times out if the button is never pressed', async () => {
    const auth = fakeAuth({ authenticated: true, installationId: 'INS-1', pairsOnRequest: false });
    await expect(pairCic(auth, 'cic-abc', silentLog, 0)).rejects.toThrow(/timed out/);
  });
});
