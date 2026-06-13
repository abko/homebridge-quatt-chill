import type { ChillFanMode, ChillMode } from './quatt/types.js';

/**
 * HAP characteristic enum values, mirrored here so the mapping functions stay
 * pure and unit-testable without constructing HAP. A unit test asserts these
 * match `hap-nodejs` exactly, so they can never silently drift.
 */
export const HK = {
  Active: { INACTIVE: 0, ACTIVE: 1 },
  CurrentHeaterCoolerState: { INACTIVE: 0, IDLE: 1, HEATING: 2, COOLING: 3 },
  TargetHeaterCoolerState: { AUTO: 0, HEAT: 1, COOL: 2 },
} as const;

/** Chill fan mode -> HomeKit RotationSpeed percentage (3 discrete stops). */
export function fanModeToRotationSpeed(fanMode: ChillFanMode): number {
  switch (fanMode) {
    case 'LOW':
      return 33;
    case 'NORMAL':
      return 66;
    case 'HIGH':
      return 100;
  }
}

/** HomeKit RotationSpeed percentage -> nearest Chill fan mode. */
export function rotationSpeedToFanMode(speed: number): ChillFanMode {
  if (speed <= 33) {
    return 'LOW';
  }
  if (speed <= 66) {
    return 'NORMAL';
  }
  return 'HIGH';
}

/**
 * Chill on/off + live status -> HomeKit CurrentHeaterCoolerState.
 *
 * `status` is free-form; only "COOLING"/"HEATING" mean actively conditioning.
 * When the unit is on but in any other state (warnings, transitions, idle), we
 * report IDLE; when off/offline, INACTIVE.
 */
export function statusToCurrentState(status: string, isOn: boolean): number {
  if (!isOn) {
    return HK.CurrentHeaterCoolerState.INACTIVE;
  }
  switch (status) {
    case 'COOLING':
      return HK.CurrentHeaterCoolerState.COOLING;
    case 'HEATING':
      return HK.CurrentHeaterCoolerState.HEATING;
    default:
      return HK.CurrentHeaterCoolerState.IDLE;
  }
}

/** Chill mode -> HomeKit TargetHeaterCoolerState. */
export function modeToTargetState(mode: ChillMode): number {
  return mode === 'COOLING'
    ? HK.TargetHeaterCoolerState.COOL
    : HK.TargetHeaterCoolerState.HEAT;
}

/** HomeKit TargetHeaterCoolerState -> Chill mode (AUTO falls back to COOLING). */
export function targetStateToMode(value: number): ChillMode {
  return value === HK.TargetHeaterCoolerState.HEAT ? 'HEATING' : 'COOLING';
}

/** HomeKit Active -> Chill on/off boolean. */
export function activeToOn(value: number): boolean {
  return value === HK.Active.ACTIVE;
}
