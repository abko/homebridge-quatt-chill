import type {
  Characteristic,
  CharacteristicValue,
  Service,
  WithUUID,
} from 'homebridge';

export interface CharacteristicDelegateOptions {
  /** HAP characteristic props (min/max/step/validValues) applied via setProps. */
  props?: Parameters<Characteristic['setProps']>[0];
  /** Called when HomeKit reads the value. */
  getter?: () => CharacteristicValue | Promise<CharacteristicValue>;
  /** Called when HomeKit writes the value. */
  setter?: (value: CharacteristicValue) => void | Promise<void>;
}

/**
 * Wraps a single HAP characteristic with a simple `value` accessor.
 *
 * Assigning `delegate.value = x` pushes `updateValue()` to HomeKit — the
 * "values" pattern borrowed from ebaauw's homebridge-lib, made type-safe.
 */
export class CharacteristicDelegate {
  readonly characteristic: Characteristic;

  constructor(
    service: Service,
    characteristicType: WithUUID<new () => Characteristic>,
    options: CharacteristicDelegateOptions = {},
  ) {
    this.characteristic =
      service.getCharacteristic(characteristicType) ??
      service.addCharacteristic(characteristicType);

    if (options.props) {
      // HAP validates the *current* value against new props, and a freshly
      // created characteristic still holds its type default (e.g. 0/10), which
      // may fall outside our props and emit a warning. Seed a valid value first.
      this.seedValidValue(options.props);
      this.characteristic.setProps(options.props);
    }
    if (options.getter) {
      this.characteristic.onGet(options.getter);
    }
    if (options.setter) {
      const setter = options.setter;
      this.characteristic.onSet(async (value) => {
        await setter(value);
      });
    }
  }

  /** Nudge the current value into the soon-to-be-applied props to avoid HAP warnings. */
  private seedValidValue(props: NonNullable<CharacteristicDelegateOptions['props']>): void {
    const current = this.characteristic.value;
    if (Array.isArray(props.validValues) && props.validValues.length > 0) {
      if (current == null || !props.validValues.includes(current as number)) {
        this.characteristic.updateValue(props.validValues[0]);
      }
      return;
    }
    if (typeof props.minValue === 'number' && (typeof current !== 'number' || current < props.minValue)) {
      this.characteristic.updateValue(props.minValue);
    } else if (typeof props.maxValue === 'number' && typeof current === 'number' && current > props.maxValue) {
      this.characteristic.updateValue(props.maxValue);
    }
  }

  get value(): CharacteristicValue {
    return this.characteristic.value as CharacteristicValue;
  }

  /** Push a new value to HomeKit (no-op for HomeKit-originated writes). */
  set value(value: CharacteristicValue) {
    this.characteristic.updateValue(value);
  }
}
