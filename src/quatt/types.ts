import { z } from 'zod';

/** Persisted auth state, written to the token file in the Homebridge storage path. */
export const StoredTokensSchema = z.object({
  fid: z.string().optional(),
  firebaseAuthToken: z.string().optional(),
  refreshToken: z.string(),
  idToken: z.string().optional(),
  /** Epoch millis when idToken expires; used to decide when to refresh. */
  idTokenExpiresAt: z.number().optional(),
});
export type StoredTokens = z.infer<typeof StoredTokensSchema>;

/**
 * A single Chill device as returned by /me/installation/{id}/devices/chills.
 *
 * `status` is a free-form diagnostic string (e.g. "COOLING", "HEATING", "OFFLINE",
 * or warnings like "WARNING_NOT_COOLING_HEATING_SYSTEM_IS_HEATING"), so we keep it
 * permissive and derive HomeKit state from it + `isOn`. `mode`/`fanMode` fall back
 * to a safe default if Quatt ever introduces a new value, so one unexpected enum
 * can't break the whole accessory.
 */
// When the Chill loses its wireless link to the CIC, numeric fields come back as
// null. Accept null everywhere and let the service retain the last-known value.
const nullableNumber = z.number().nullable().catch(null);

export const ChillSchema = z.object({
  uuid: z.string(),
  name: z.string().optional(),
  mode: z.enum(['COOLING', 'HEATING']).catch('COOLING'),
  status: z.string(),
  isOn: z.object({ value: z.boolean().catch(false) }),
  fanMode: z.enum(['LOW', 'NORMAL', 'HIGH']).catch('LOW'),
  ambientTemperature: nullableNumber,
  coolingTargetTemperature: nullableNumber,
  heatingTargetTemperature: nullableNumber,
  minTargetTemperature: nullableNumber,
  maxTargetTemperature: nullableNumber,
});
export type Chill = z.infer<typeof ChillSchema>;

export const ChillsResponseSchema = z.object({
  result: z.object({
    chills: z.array(ChillSchema),
  }),
});

export const MeResponseSchema = z.object({
  result: z.object({
    cicIds: z.array(z.string()).optional(),
  }),
});

export const InstallationsResponseSchema = z.object({
  result: z.array(z.object({ externalId: z.string() })),
});

export type ChillMode = Chill['mode'];
export type ChillFanMode = Chill['fanMode'];

/** Action bodies POSTed to .../chills/{uuid}/actions. */
export type ChillAction =
  | { type: 'SET_ON_OFF'; on: boolean }
  | { type: 'SET_MODE'; mode: ChillMode }
  | { type: 'SET_FAN_MODE'; fanMode: ChillFanMode }
  | { type: 'SET_COOLING_TARGET_TEMPERATURE'; coolingTargetTemperature: number }
  | { type: 'SET_HEATING_TARGET_TEMPERATURE'; heatingTargetTemperature: number };
