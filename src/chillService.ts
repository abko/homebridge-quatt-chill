import type { API, PlatformAccessory } from 'homebridge';
import { CharacteristicDelegate } from './lib/characteristicDelegate.js';
import type { LevelLogger } from './lib/levelLogger.js';
import {
  activeToOn,
  describeStatus,
  fanModeToRotationSpeed,
  modeToTargetState,
  rotationSpeedToFanMode,
  statusToCurrentState,
  targetStateToMode,
} from './chillMapping.js';
import type { Chill, ChillAction } from './quatt/types.js';

export type ChillActionHandler = (action: ChillAction) => Promise<void>;

/** Lowest heating setpoint we expose; heating can sit below the cooling range. */
const HEATING_FLOOR = 5;

/** Fallbacks used only when the very first sighting of a Chill is offline (nulls). */
const FALLBACK = { ambient: 20, cool: 20, heat: 18, min: 16, max: 30 };

interface Range {
  min: number;
  max: number;
}

const clamp = (value: number, { min, max }: Range): number => Math.min(max, Math.max(min, value));

/**
 * Wraps a single HeaterCooler service for a Chill device. Reads push to HomeKit
 * via `checkState(chill)`; writes go out through the supplied action handler.
 */
export class ChillService {
  private readonly active: CharacteristicDelegate;
  private readonly currentState: CharacteristicDelegate;
  private readonly targetState: CharacteristicDelegate;
  private readonly currentTemperature: CharacteristicDelegate;
  private readonly coolingThreshold: CharacteristicDelegate;
  private readonly heatingThreshold: CharacteristicDelegate;
  private readonly rotationSpeed: CharacteristicDelegate;
  private readonly coolingRange: Range;
  private readonly heatingRange: Range;
  private prevStatus?: string;

  constructor(
    api: API,
    accessory: PlatformAccessory,
    chill: Chill,
    private readonly onAction: ChillActionHandler,
    private readonly log: LevelLogger,
  ) {
    const { Service, Characteristic } = api.hap;
    const service =
      accessory.getService(Service.HeaterCooler) ??
      accessory.addService(Service.HeaterCooler, chill.name ?? 'Quatt Chill');

    this.active = new CharacteristicDelegate(service, Characteristic.Active, {
      setter: (value) => this.onAction({ type: 'SET_ON_OFF', on: activeToOn(Number(value)) }),
    });

    this.currentState = new CharacteristicDelegate(service, Characteristic.CurrentHeaterCoolerState);

    this.targetState = new CharacteristicDelegate(service, Characteristic.TargetHeaterCoolerState, {
      // The Chill is explicitly heating OR cooling — no AUTO.
      props: {
        validValues: [
          Characteristic.TargetHeaterCoolerState.HEAT,
          Characteristic.TargetHeaterCoolerState.COOL,
        ],
      },
      setter: (value) => this.onAction({ type: 'SET_MODE', mode: targetStateToMode(Number(value)) }),
    });

    this.currentTemperature = new CharacteristicDelegate(
      service,
      Characteristic.CurrentTemperature,
      { props: { minValue: -50, maxValue: 100, minStep: 0.1 } },
    );

    // The device's min/maxTargetTemperature describe the COOLING range; heating
    // setpoints can sit below it (e.g. 16 < 18), so give heating a wider band.
    // Fields may be null if the Chill is offline at first sighting — fall back.
    const minT = chill.minTargetTemperature ?? FALLBACK.min;
    const maxT = chill.maxTargetTemperature ?? FALLBACK.max;
    const coolT = chill.coolingTargetTemperature ?? FALLBACK.cool;
    const heatT = chill.heatingTargetTemperature ?? FALLBACK.heat;
    this.coolingRange = { min: Math.min(minT, coolT), max: Math.max(maxT, coolT) };
    this.heatingRange = { min: Math.min(HEATING_FLOOR, heatT), max: Math.max(maxT, heatT) };

    this.coolingThreshold = new CharacteristicDelegate(
      service,
      Characteristic.CoolingThresholdTemperature,
      {
        props: { minValue: this.coolingRange.min, maxValue: this.coolingRange.max, minStep: 1 },
        setter: (value) =>
          this.onAction({
            type: 'SET_COOLING_TARGET_TEMPERATURE',
            coolingTargetTemperature: Math.round(Number(value)),
          }),
      },
    );

    this.heatingThreshold = new CharacteristicDelegate(
      service,
      Characteristic.HeatingThresholdTemperature,
      {
        props: { minValue: this.heatingRange.min, maxValue: this.heatingRange.max, minStep: 1 },
        setter: (value) =>
          this.onAction({
            type: 'SET_HEATING_TARGET_TEMPERATURE',
            heatingTargetTemperature: Math.round(Number(value)),
          }),
      },
    );

    // Stepped slider: 0 = Off, 33 = Low, 66 = Normal, 99 = High.
    this.rotationSpeed = new CharacteristicDelegate(service, Characteristic.RotationSpeed, {
      props: { minValue: 0, maxValue: 99, minStep: 33 },
      setter: (value) => {
        if (Math.round(Number(value)) === 0) {
          // 0 = off; the Active characteristic handles power, so send no fan command.
          return;
        }
        return this.onAction({
          type: 'SET_FAN_MODE',
          fanMode: rotationSpeedToFanMode(Number(value)),
        });
      },
    });

    this.checkState(chill);
  }

  /** Fan the latest device state out to all characteristics. */
  checkState(chill: Chill): void {
    this.logStatusTransition(chill);
    this.active.value = chill.isOn.value ? 1 : 0;
    this.currentState.value = statusToCurrentState(chill.status, chill.isOn.value);
    this.targetState.value = modeToTargetState(chill.mode);
    // Show 0 (off) when the unit is off, so the fan slider and power never disagree.
    this.rotationSpeed.value = chill.isOn.value ? fanModeToRotationSpeed(chill.fanMode) : 0;
    // Temperatures may be null when offline — retain the last-known value.
    if (chill.ambientTemperature != null) {
      this.currentTemperature.value = chill.ambientTemperature;
    }
    if (chill.coolingTargetTemperature != null) {
      this.coolingThreshold.value = clamp(chill.coolingTargetTemperature, this.coolingRange);
    }
    if (chill.heatingTargetTemperature != null) {
      this.heatingThreshold.value = clamp(chill.heatingTargetTemperature, this.heatingRange);
    }
  }

  /** Log the initial state once, then only when the device's status changes. */
  private logStatusTransition(chill: Chill): void {
    const name = chill.name ?? 'Quatt Chill';
    if (this.prevStatus === undefined) {
      this.log.info('%s: %s', name, describeStatus(chill.status));
    } else if (chill.status !== this.prevStatus) {
      if (chill.status === 'OFFLINE') {
        this.log.info('%s: went offline', name);
      } else if (this.prevStatus === 'OFFLINE') {
        this.log.info('%s: back online (%s)', name, describeStatus(chill.status));
      } else {
        this.log.info('%s: %s', name, describeStatus(chill.status));
      }
    }
    this.prevStatus = chill.status;
  }
}
