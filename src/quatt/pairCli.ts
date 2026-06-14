#!/usr/bin/env node
/**
 * Standalone one-time pairing helper for headless installs.
 *
 * Usage:
 *   quatt-chill-pair --cic <cic-hostname> [--token-file <path>]
 *
 * Prompts you to press the button on the CIC, then prints the installationId to
 * put in your Homebridge config. Tokens are written to the token file.
 */
import { resolve } from 'node:path';
import { LevelLogger, LogLevel, type LogSink } from '../lib/levelLogger.js';
import { DEFAULT_TOKEN_FILENAME } from '../settings.js';
import { QuattAuth } from './auth.js';
import { pairCic } from './pairing.js';

const consoleSink: LogSink = {
  info: (m, ...a) => console.log(m, ...a),
  warn: (m, ...a) => console.warn(m, ...a),
  error: (m, ...a) => console.error(m, ...a),
};

function parseArgs(argv: string[]): { cic?: string; tokenFile: string; verbose: boolean } {
  let cic: string | undefined;
  let tokenFile = resolve(process.cwd(), DEFAULT_TOKEN_FILENAME);
  let verbose = false;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--cic':
        cic = argv[++i];
        break;
      case '--token-file':
        tokenFile = resolve(argv[++i]);
        break;
      case '-v':
      case '--verbose':
        verbose = true;
        break;
    }
  }
  return { cic, tokenFile, verbose };
}

async function main(): Promise<void> {
  const { cic, tokenFile, verbose } = parseArgs(process.argv.slice(2));
  if (!cic) {
    console.error('error: --cic <cic-hostname> is required (e.g. cic-abc123)');
    process.exit(2);
  }

  const log = new LevelLogger(consoleSink, verbose ? LogLevel.Verbose : LogLevel.Info);
  const auth = new QuattAuth(tokenFile, log);
  await auth.load();

  const { installationId } = await pairCic(auth, cic, log);

  console.log('\n✅ Pairing complete.');
  console.log(`   token file:     ${tokenFile}`);
  console.log(`   installationId: ${installationId} (resolved automatically; no need to configure)`);
  console.log('\nIn your Homebridge config (platform "QuattChill") you only need:');
  console.log(JSON.stringify({ platform: 'QuattChill', cicId: cic }, null, 2));
  console.log('\nThen restart Homebridge.');
}

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
