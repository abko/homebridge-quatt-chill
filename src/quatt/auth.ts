import { readFile, writeFile } from 'node:fs/promises';
import type { LevelLogger } from '../lib/levelLogger.js';
import {
  FIREBASE_INSTALLATIONS_URL,
  FIREBASE_REMOTE_CONFIG_URL,
  GOOGLE_ANDROID_CERT,
  GOOGLE_ANDROID_PACKAGE,
  GOOGLE_API_KEY,
  GOOGLE_APP_ID,
  GOOGLE_APP_INSTANCE_ID,
  GOOGLE_CLIENT_VERSION,
  GOOGLE_FIREBASE_CLIENT,
  IDENTITY_LOOKUP_URL,
  IDENTITY_SIGNUP_URL,
  QUATT_API_BASE_URL,
  QUATT_APP_BUILD,
  QUATT_APP_VERSION,
  SECURETOKEN_URL,
} from './constants.js';
import { StoredTokensSchema, type StoredTokens } from './types.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** Refresh the idToken when it has under this many ms of life left. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export interface AuthRequestOptions {
  method?: string;
  body?: unknown;
  /** When false, a 401 will NOT trigger a refresh+retry (used internally). */
  retryOnUnauthorized?: boolean;
}

/**
 * Owns the Firebase anonymous identity used to talk to the Quatt mobile API:
 * one-time signup, token persistence, refresh-on-expiry, and authenticated
 * requests against https://mobile-api.quatt.io/api/v1.
 */
export class QuattAuth {
  private tokens?: StoredTokens;

  constructor(
    private readonly tokenFile: string,
    private readonly log: LevelLogger,
  ) {}

  /** True once we hold a refresh token (i.e. signup has completed at least once). */
  get isAuthenticated(): boolean {
    return this.tokens?.refreshToken != null;
  }

  /** Load persisted tokens from disk, if present. Safe to call repeatedly. */
  async load(): Promise<boolean> {
    try {
      const raw = await readFile(this.tokenFile, 'utf8');
      this.tokens = StoredTokensSchema.parse(JSON.parse(raw));
      this.log.debug('loaded persisted Quatt tokens from %s', this.tokenFile);
      return true;
    } catch {
      this.log.debug('no usable token file at %s', this.tokenFile);
      return false;
    }
  }

  private async persist(): Promise<void> {
    if (!this.tokens) {
      return;
    }
    await writeFile(this.tokenFile, JSON.stringify(this.tokens, null, 2), { mode: 0o600 });
  }

  /**
   * Run the full anonymous signup flow and persist the resulting refresh token.
   * Call this once during pairing; afterwards `load()` + refresh is enough.
   */
  async signUp(): Promise<void> {
    // 1. Firebase installation + 2. remote-config handshake. These are pure SDK
    // telemetry that the Quatt API never checks, and Google gates them behind
    // device attestation (they return 403 off-device). Best effort only — the
    // identity below is what actually matters.
    const { fid, firebaseAuthToken } = await this.tryFirebaseInstallation();

    // 3. Anonymous signup -> id + refresh token.
    const signup = await fetchJson<{
      idToken: string;
      refreshToken: string;
      expiresIn: string;
    }>(`${IDENTITY_SIGNUP_URL}?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        ...JSON_HEADERS,
        'X-Android-Cert': GOOGLE_ANDROID_CERT,
        'X-Android-Package': GOOGLE_ANDROID_PACKAGE,
        'X-Client-Version': GOOGLE_CLIENT_VERSION,
        'X-Firebase-GMPID': GOOGLE_APP_ID,
        'X-Firebase-Client': GOOGLE_FIREBASE_CLIENT,
      },
      body: JSON.stringify({ clientType: 'CLIENT_TYPE_ANDROID' }),
    });

    this.tokens = {
      fid,
      firebaseAuthToken,
      refreshToken: signup.refreshToken,
      idToken: signup.idToken,
      idTokenExpiresAt: Date.now() + Number(signup.expiresIn) * 1000,
    };

    // 4. Validate the new identity.
    await fetchJson(`${IDENTITY_LOOKUP_URL}?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ idToken: signup.idToken }),
    });

    // 5. Initialise the Quatt profile (required before the account is usable).
    await this.request('/me', {
      method: 'PUT',
      body: { firstName: 'Homebridge', lastName: 'Quatt Chill' },
      retryOnUnauthorized: false,
    });

    await this.persist();
    this.log.info('Quatt anonymous identity created and persisted.');
  }

  /**
   * Best-effort Firebase installation + remote-config handshake. Mirrors what the
   * official app does, but Google gates these behind device attestation, so off a
   * real device they 403. The Quatt API never inspects the results, so failure is
   * fine — we just won't have an `fid` to persist.
   */
  private async tryFirebaseInstallation(): Promise<{ fid?: string; firebaseAuthToken?: string }> {
    try {
      const installation = await fetchJson<{ fid: string; authToken: { token: string } }>(
        FIREBASE_INSTALLATIONS_URL,
        {
          method: 'POST',
          headers: {
            ...JSON_HEADERS,
            'X-Android-Cert': GOOGLE_ANDROID_CERT,
            'X-Android-Package': GOOGLE_ANDROID_PACKAGE,
            'x-firebase-client': GOOGLE_FIREBASE_CLIENT,
            'x-goog-api-key': GOOGLE_API_KEY,
          },
          body: JSON.stringify({
            fid: GOOGLE_APP_INSTANCE_ID,
            appId: GOOGLE_APP_ID,
            authVersion: 'FIS_v2',
            sdkVersion: 'a:19.0.1',
          }),
        },
      );
      const firebaseAuthToken = installation.authToken.token;

      await fetchJson(FIREBASE_REMOTE_CONFIG_URL, {
        method: 'POST',
        headers: {
          ...JSON_HEADERS,
          'X-Android-Cert': GOOGLE_ANDROID_CERT,
          'X-Android-Package': GOOGLE_ANDROID_PACKAGE,
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Google-GFE-Can-Retry': 'yes',
          'X-Goog-Firebase-Installations-Auth': firebaseAuthToken,
          'X-Firebase-RC-Fetch-Type': 'BASE/1',
        },
        body: JSON.stringify({
          appVersion: QUATT_APP_VERSION,
          appInstanceIdToken: firebaseAuthToken,
          languageCode: 'en-US',
          appBuild: QUATT_APP_BUILD,
          appInstanceId: GOOGLE_APP_INSTANCE_ID,
          countryCode: 'US',
          analyticsUserProperties: {},
          appId: GOOGLE_APP_ID,
          platformVersion: '33',
          sdkVersion: '23.0.1',
          packageName: GOOGLE_ANDROID_PACKAGE,
        }),
      });
      return { fid: installation.fid, firebaseAuthToken };
    } catch (error) {
      this.log.debug('Firebase installation handshake skipped (non-fatal): %s', String(error));
      return {};
    }
  }

  /** Exchange the refresh token for a fresh idToken. */
  private async refresh(): Promise<void> {
    if (!this.tokens?.refreshToken) {
      throw new Error('cannot refresh: not authenticated (run pairing first)');
    }
    const refreshed = await fetchJson<{
      id_token: string;
      refresh_token: string;
      expires_in: string;
    }>(`${SECURETOKEN_URL}?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ grantType: 'refresh_token', refreshToken: this.tokens.refreshToken }),
    });

    this.tokens = {
      ...this.tokens,
      idToken: refreshed.id_token,
      refreshToken: refreshed.refresh_token,
      idTokenExpiresAt: Date.now() + Number(refreshed.expires_in) * 1000,
    };
    await this.persist();
    this.log.debug('refreshed Quatt idToken');
  }

  /** Return a valid idToken, refreshing first if missing or near expiry. */
  private async ensureIdToken(): Promise<string> {
    if (!this.tokens) {
      throw new Error('not authenticated: no token file loaded (run pairing first)');
    }
    const expiresAt = this.tokens.idTokenExpiresAt ?? 0;
    if (!this.tokens.idToken || expiresAt - Date.now() < REFRESH_SKEW_MS) {
      await this.refresh();
    }
    return this.tokens.idToken!;
  }

  /**
   * Authenticated request against the Quatt mobile API. Relative paths are
   * resolved against QUATT_API_BASE_URL; absolute URLs are used as-is.
   * Refreshes the idToken and retries once on a 401.
   */
  async request<T = unknown>(path: string, options: AuthRequestOptions = {}): Promise<T> {
    const { method = 'GET', body, retryOnUnauthorized = true } = options;
    const url = path.startsWith('http') ? path : `${QUATT_API_BASE_URL}${path}`;
    const idToken = await this.ensureIdToken();

    this.log.vdebug('%s %s', method, url);
    const response = await fetch(url, {
      method,
      headers: {
        ...JSON_HEADERS,
        Authorization: `Bearer ${idToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 401 && retryOnUnauthorized) {
      this.log.debug('got 401, refreshing token and retrying %s %s', method, path);
      await this.refresh();
      return this.request<T>(path, { ...options, retryOnUnauthorized: false });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Quatt API ${method} ${path} failed: ${response.status} ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}

/** POST/GET helper that throws on non-2xx and parses JSON. */
async function fetchJson<T = unknown>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`request to ${url} failed: ${response.status} ${text}`);
  }
  return (await response.json()) as T;
}
