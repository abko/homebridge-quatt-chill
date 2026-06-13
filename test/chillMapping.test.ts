import { describe, expect, it } from 'vitest';
import { Characteristic } from 'hap-nodejs';
import {
  HK,
  activeToOn,
  describeAction,
  describeStatus,
  fanModeToRotationSpeed,
  modeToTargetState,
  rotationSpeedToFanMode,
  statusToCurrentState,
  targetStateToMode,
} from '../src/chillMapping.js';

describe('HK constants match hap-nodejs (guard against drift)', () => {
  it('Active', () => {
    expect(HK.Active.INACTIVE).toBe(Characteristic.Active.INACTIVE);
    expect(HK.Active.ACTIVE).toBe(Characteristic.Active.ACTIVE);
  });
  it('CurrentHeaterCoolerState', () => {
    expect(HK.CurrentHeaterCoolerState.INACTIVE).toBe(
      Characteristic.CurrentHeaterCoolerState.INACTIVE,
    );
    expect(HK.CurrentHeaterCoolerState.IDLE).toBe(Characteristic.CurrentHeaterCoolerState.IDLE);
    expect(HK.CurrentHeaterCoolerState.HEATING).toBe(
      Characteristic.CurrentHeaterCoolerState.HEATING,
    );
    expect(HK.CurrentHeaterCoolerState.COOLING).toBe(
      Characteristic.CurrentHeaterCoolerState.COOLING,
    );
  });
  it('TargetHeaterCoolerState', () => {
    expect(HK.TargetHeaterCoolerState.AUTO).toBe(Characteristic.TargetHeaterCoolerState.AUTO);
    expect(HK.TargetHeaterCoolerState.HEAT).toBe(Characteristic.TargetHeaterCoolerState.HEAT);
    expect(HK.TargetHeaterCoolerState.COOL).toBe(Characteristic.TargetHeaterCoolerState.COOL);
  });
});

describe('fan mode <-> rotation speed', () => {
  it('maps each fan mode to a discrete stop', () => {
    expect(fanModeToRotationSpeed('LOW')).toBe(33);
    expect(fanModeToRotationSpeed('NORMAL')).toBe(66);
    expect(fanModeToRotationSpeed('HIGH')).toBe(100);
  });

  it('buckets arbitrary speeds back to a fan mode', () => {
    expect(rotationSpeedToFanMode(0)).toBe('LOW');
    expect(rotationSpeedToFanMode(33)).toBe('LOW');
    expect(rotationSpeedToFanMode(34)).toBe('NORMAL');
    expect(rotationSpeedToFanMode(66)).toBe('NORMAL');
    expect(rotationSpeedToFanMode(67)).toBe('HIGH');
    expect(rotationSpeedToFanMode(100)).toBe('HIGH');
  });

  it('round-trips each fan mode', () => {
    for (const mode of ['LOW', 'NORMAL', 'HIGH'] as const) {
      expect(rotationSpeedToFanMode(fanModeToRotationSpeed(mode))).toBe(mode);
    }
  });
});

describe('status + isOn -> current state', () => {
  it('is INACTIVE whenever the unit is off, regardless of status', () => {
    expect(statusToCurrentState('COOLING', false)).toBe(HK.CurrentHeaterCoolerState.INACTIVE);
    expect(statusToCurrentState('OFFLINE', false)).toBe(HK.CurrentHeaterCoolerState.INACTIVE);
  });
  it('maps active conditioning states when on', () => {
    expect(statusToCurrentState('COOLING', true)).toBe(HK.CurrentHeaterCoolerState.COOLING);
    expect(statusToCurrentState('HEATING', true)).toBe(HK.CurrentHeaterCoolerState.HEATING);
  });
  it('reports IDLE when on but in a warning/transition state', () => {
    expect(statusToCurrentState('WARNING_NOT_COOLING_HEATING_SYSTEM_IS_HEATING', true)).toBe(
      HK.CurrentHeaterCoolerState.IDLE,
    );
    expect(statusToCurrentState('OFFLINE', true)).toBe(HK.CurrentHeaterCoolerState.IDLE);
  });
});

describe('mode <-> target state', () => {
  it('maps and round-trips', () => {
    expect(modeToTargetState('COOLING')).toBe(HK.TargetHeaterCoolerState.COOL);
    expect(modeToTargetState('HEATING')).toBe(HK.TargetHeaterCoolerState.HEAT);
    expect(targetStateToMode(HK.TargetHeaterCoolerState.COOL)).toBe('COOLING');
    expect(targetStateToMode(HK.TargetHeaterCoolerState.HEAT)).toBe('HEATING');
    // AUTO is excluded from validValues but falls back safely to cooling.
    expect(targetStateToMode(HK.TargetHeaterCoolerState.AUTO)).toBe('COOLING');
  });
});

describe('active -> on', () => {
  it('maps active to boolean', () => {
    expect(activeToOn(HK.Active.ACTIVE)).toBe(true);
    expect(activeToOn(HK.Active.INACTIVE)).toBe(false);
  });
});

describe('describeAction (log text)', () => {
  it('describes each action type', () => {
    expect(describeAction({ type: 'SET_ON_OFF', on: true })).toBe('turned on');
    expect(describeAction({ type: 'SET_ON_OFF', on: false })).toBe('turned off');
    expect(describeAction({ type: 'SET_MODE', mode: 'COOLING' })).toBe('mode → COOLING');
    expect(describeAction({ type: 'SET_FAN_MODE', fanMode: 'HIGH' })).toBe('fan → HIGH');
    expect(
      describeAction({ type: 'SET_COOLING_TARGET_TEMPERATURE', coolingTargetTemperature: 20 }),
    ).toBe('cooling target → 20°C');
    expect(
      describeAction({ type: 'SET_HEATING_TARGET_TEMPERATURE', heatingTargetTemperature: 18 }),
    ).toBe('heating target → 18°C');
  });
});

describe('describeStatus (log text)', () => {
  it('humanises known statuses and warning strings', () => {
    expect(describeStatus('COOLING')).toBe('cooling');
    expect(describeStatus('OFFLINE')).toBe('offline');
    expect(describeStatus('WARNING_DISCONNECTED')).toBe('warning — disconnected');
    expect(describeStatus('WARNING_NOT_COOLING_HEATING_SYSTEM_IS_HEATING')).toBe(
      'warning — not cooling heating system is heating',
    );
  });
});
