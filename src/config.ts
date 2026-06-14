import { z } from 'zod';
import { LogLevel } from './lib/levelLogger.js';
import { DEFAULT_HEARTRATE_SECONDS, MIN_HEARTRATE_SECONDS } from './settings.js';

/** Validated plugin configuration (subset of the raw PlatformConfig we care about). */
export const ConfigSchema = z.object({
  name: z.string().default('Quatt Chill'),
  /** CIC hostname, e.g. "cic-abc123". Required for pairing. */
  cicId: z.string().optional(),
  /** Absolute path to the persisted token file. Defaults into the HB storage path. */
  tokenFile: z.string().optional(),
  /** Poll cadence in seconds. */
  heartrateSeconds: z
    .number()
    .min(MIN_HEARTRATE_SECONDS)
    .default(DEFAULT_HEARTRATE_SECONDS),
  logLevel: z
    .nativeEnum(LogLevel)
    .default(LogLevel.Info),
});

export type QuattChillConfig = z.infer<typeof ConfigSchema>;
