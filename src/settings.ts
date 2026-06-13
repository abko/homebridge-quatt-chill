/**
 * Plugin-wide identifiers and defaults.
 *
 * PLATFORM_NAME must match the `platform` value users put in config.json.
 * PLUGIN_NAME must match the npm package name.
 */
export const PLATFORM_NAME = 'QuattChill';
export const PLUGIN_NAME = 'homebridge-quatt-chill';

/** Default polling cadence in seconds. The Quatt cloud refreshes ~once per minute,
 * so polling faster than this gains nothing. */
export const DEFAULT_HEARTRATE_SECONDS = 60;
export const MIN_HEARTRATE_SECONDS = 60;

/** Default filename (within the Homebridge storage path) for persisted auth tokens. */
export const DEFAULT_TOKEN_FILENAME = 'quatt-chill-tokens.json';
