import type { PlatformAccessory } from 'homebridge';
import { ChillService } from './chillService.js';
import type { Chill } from './quatt/types.js';
import type { QuattChillPlatform } from './platform.js';

/**
 * Wraps a Homebridge PlatformAccessory for one Chill: sets accessory info and
 * owns the HeaterCooler service. Control actions are routed through the platform's
 * mobile client, followed by a prompt re-poll so HomeKit reflects the new state.
 */
export class ChillAccessory {
  /** Quatt device uuid (stable id), used to correlate poll results. */
  readonly chillUuid: string;
  private readonly service: ChillService;

  constructor(platform: QuattChillPlatform, accessory: PlatformAccessory, chill: Chill) {
    this.chillUuid = chill.uuid;
    const { Service, Characteristic } = platform.api.hap;

    (
      accessory.getService(Service.AccessoryInformation) ??
      accessory.addService(Service.AccessoryInformation)
    )
      .setCharacteristic(Characteristic.Manufacturer, 'Quatt')
      .setCharacteristic(Characteristic.Model, 'Chill')
      .setCharacteristic(Characteristic.Name, chill.name ?? 'Quatt Chill')
      .setCharacteristic(Characteristic.SerialNumber, chill.uuid);

    this.service = new ChillService(
      platform.api,
      accessory,
      chill,
      async (action) => {
        await platform.client.sendChillAction(platform.requireInstallationId(), chill.uuid, action);
        platform.scheduleRefreshSoon();
      },
      platform.log,
    );
  }

  update(chill: Chill): void {
    this.service.checkState(chill);
  }
}
