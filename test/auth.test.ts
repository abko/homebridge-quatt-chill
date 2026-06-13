import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LevelLogger, LogLevel } from '../src/lib/levelLogger.js';
import { QuattAuth } from '../src/quatt/auth.js';

const silentLog = new LevelLogger(
  { info: () => {}, warn: () => {}, error: () => {} },
  LogLevel.Off,
);

let dir: string;
let tokenFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quatt-test-'));
  tokenFile = join(dir, 'tokens.json');
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('QuattAuth.request', () => {
  it('refreshes a missing idToken, sends a Bearer header, and persists new tokens', async () => {
    writeFileSync(tokenFile, JSON.stringify({ fid: 'fid-1', refreshToken: 'refresh-old' }));

    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('securetoken')) {
        return new Response(
          JSON.stringify({
            id_token: 'idtoken-new',
            refresh_token: 'refresh-new',
            expires_in: '3600',
          }),
          { status: 200 },
        );
      }
      // The actual API call.
      expect(url).toBe('https://mobile-api.quatt.io/api/v1/me');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer idtoken-new');
      return new Response(JSON.stringify({ result: { cicIds: [] } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const auth = new QuattAuth(tokenFile, silentLog);
    await auth.load();
    expect(auth.isAuthenticated).toBe(true);

    const result = await auth.request<{ result: { cicIds: string[] } }>('/me');
    expect(result.result.cicIds).toEqual([]);

    // Refresh happened then the API call: two fetches.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // New tokens were persisted to disk.
    const persisted = JSON.parse(readFileSync(tokenFile, 'utf8'));
    expect(persisted.idToken).toBe('idtoken-new');
    expect(persisted.refreshToken).toBe('refresh-new');
    expect(persisted.idTokenExpiresAt).toBeGreaterThan(Date.now());
  });

  it('refreshes and retries once on a 401', async () => {
    writeFileSync(
      tokenFile,
      JSON.stringify({
        fid: 'fid-1',
        refreshToken: 'refresh-old',
        idToken: 'idtoken-stale',
        idTokenExpiresAt: Date.now() + 60 * 60 * 1000,
      }),
    );

    let apiCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('securetoken')) {
        return new Response(
          JSON.stringify({
            id_token: 'idtoken-fresh',
            refresh_token: 'refresh-new',
            expires_in: '3600',
          }),
          { status: 200 },
        );
      }
      apiCalls++;
      if (apiCalls === 1) {
        return new Response('unauthorized', { status: 401 });
      }
      return new Response(JSON.stringify({ result: {} }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const auth = new QuattAuth(tokenFile, silentLog);
    await auth.load();
    await auth.request('/me');

    // first /me (401), securetoken refresh, retry /me => 3 calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(apiCalls).toBe(2);
  });
});
