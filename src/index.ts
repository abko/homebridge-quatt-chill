import type { API } from 'homebridge';
import { QuattChillPlatform } from './platform.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

/** Homebridge entrypoint: register the dynamic platform. */
export default (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, QuattChillPlatform);
};
