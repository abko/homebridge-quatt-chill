import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import { join } from 'node:path';
import { QuattAuth } from '../dist/quatt/auth.js';
import { checkPaired, requestPair } from '../dist/quatt/pairing.js';
import { LevelLogger, LogLevel } from '../dist/lib/levelLogger.js';
import { DEFAULT_TOKEN_FILENAME } from '../dist/settings.js';

const message = (error) => (error instanceof Error ? error.message : String(error));

/** Minimal printf for the %s/%d our pairing code logs with. */
function format(template, args) {
  let i = 0;
  return String(template).replace(/%[sd]/g, () => (i < args.length ? String(args[i++]) : ''));
}

/**
 * Settings-page server for the "Pair with Quatt" button. Pairing is two-step so we
 * never hold a request open for the full 60s button-press window:
 *   1. /start-pair  -> sign up (if needed) + requestPair, keep the identity in memory
 *   2. /poll-pair   -> poll until the CIC reports paired, then return the installation
 */
class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.session = null;
    this.onRequest('/start-pair', (payload) => this.startPair(payload));
    this.onRequest('/poll-pair', () => this.pollPair());
    this.ready();
  }

  makeSession(payload) {
    const cicId = (payload?.cicId || '').trim();
    if (!cicId) {
      throw new RequestError('Set the CIC hostname (cicId) first.', { status: 400 });
    }
    const tokenFile =
      (payload?.tokenFile || '').trim() ||
      join(this.homebridgeStoragePath, DEFAULT_TOKEN_FILENAME);
    const sink = {
      info: (m, ...a) => this.pushEvent('pair-log', { message: format(m, a) }),
      warn: (m, ...a) => this.pushEvent('pair-log', { message: format(m, a) }),
      error: (m, ...a) => this.pushEvent('pair-log', { message: format(m, a) }),
    };
    const log = new LevelLogger(sink, LogLevel.Info);
    return { cicId, tokenFile, log, auth: new QuattAuth(tokenFile, log) };
  }

  async startPair(payload) {
    const session = this.makeSession(payload);
    await session.auth.load();
    try {
      await requestPair(session.auth, session.cicId, session.log);
    } catch (error) {
      throw new RequestError(message(error), { status: 500 });
    }
    this.session = session;
    return { ok: true };
  }

  async pollPair() {
    if (!this.session) {
      throw new RequestError('No pairing in progress — click Pair first.', { status: 400 });
    }
    try {
      const installationId = await checkPaired(this.session.auth, this.session.cicId);
      return { paired: Boolean(installationId), installationId: installationId || null };
    } catch (error) {
      throw new RequestError(message(error), { status: 500 });
    }
  }
}

void new PluginUiServer();
