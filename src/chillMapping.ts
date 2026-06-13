import type { ChillAction, ChillFanMode, ChillMode } from './quatt/types.js';

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

/** Human-readable one-liner for a control action, for Info-level logs. */
export function describeAction(action: ChillAction): string {
  switch (action.type) {
    case 'SET_ON_OFF':
      return action.on ? 'turned on' : 'turned off';
    case 'SET_MODE':
      return `mode → ${action.mode}`;
    case 'SET_FAN_MODE':
      return `fan → ${action.fanMode}`;
    case 'SET_COOLING_TARGET_TEMPERATURE':
      return `cooling target → ${action.coolingTargetTemperature}°C`;
    case 'SET_HEATING_TARGET_TEMPERATURE':
      return `heating target → ${action.heatingTargetTemperature}°C`;
  }
}

/** Human-readable device status, for state-transition logs. */
export function describeStatus(status: string): string {
  switch (status) {
    case 'COOLING':
      return 'cooling';
    case 'HEATING':
      return 'heating';
    case 'OFF':
      return 'off';
    case 'OFFLINE':
      return 'offline';
    default:
      return status; // free-form warning/diagnostic strings, shown as-is
  }
}
