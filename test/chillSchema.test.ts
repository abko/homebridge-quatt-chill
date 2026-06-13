import { describe, expect, it } from 'vitest';
import { ChillSchema } from '../src/quatt/types.js';

describe('ChillSchema tolerates real-world payloads', () => {
  it('parses a normal online payload', () => {
    const chill = ChillSchema.parse({
      uuid: 'DEV-1',
      name: 'Airco',
      mode: 'COOLING',
      status: 'COOLING',
      isOn: { value: true },
      fanMode: 'HIGH',
      ambientTemperature: 19,
      coolingTargetTemperature: 18,
      heatingTargetTemperature: 16,
      minTargetTemperature: 18,
      maxTargetTemperature: 25,
    });
    expect(chill.ambientTemperature).toBe(19);
  });

  it('parses an offline payload with null temperatures and a warning status', () => {
    const chill = ChillSchema.parse({
      uuid: 'DEV-1',
      name: 'Airco',
      mode: 'COOLING',
      status: 'WARNING_NOT_COOLING_HEATING_SYSTEM_IS_HEATING',
      isOn: { value: false },
      fanMode: 'LOW',
      ambientTemperature: null,
      coolingTargetTemperature: null,
      heatingTargetTemperature: null,
      minTargetTemperature: null,
      maxTargetTemperature: null,
    });
    expect(chill.ambientTemperature).toBeNull();
    expect(chill.status).toContain('WARNING');
  });

  it('falls back to safe defaults for unexpected enum values', () => {
    const chill = ChillSchema.parse({
      uuid: 'DEV-1',
      mode: 'SOMETHING_NEW',
      status: 'OK',
      isOn: { value: true },
      fanMode: 'TURBO',
      ambientTemperature: 20,
      coolingTargetTemperature: 20,
      heatingTargetTemperature: 18,
      minTargetTemperature: 18,
      maxTargetTemperature: 25,
    });
    expect(chill.mode).toBe('COOLING');
    expect(chill.fanMode).toBe('LOW');
  });
});
