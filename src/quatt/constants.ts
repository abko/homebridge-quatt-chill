/**
 * Hardcoded Google/Firebase + Quatt mobile-app credentials, copied verbatim from the
 * reverse-engineered Home Assistant integration (marcoboers/home-assistant-quatt,
 * custom_components/quatt/const.py). These identify the official Quatt Android app to
 * Firebase/Google so we can mint an anonymous identity and call the Quatt mobile API.
 *
 * If Quatt rotates these, update them here — this is the single source of truth.
 */
export const GOOGLE_API_KEY = 'AIzaSyDM4PIXYDS9x53WUj-tDjOVAb6xKgzxX9Y';
export const GOOGLE_APP_ID = '1:1074628551428:android:20ddeaf85c3cfec3336651';
export const GOOGLE_APP_INSTANCE_ID = 'dwNCvvXLQrqvmUJlZajYzG';
export const GOOGLE_ANDROID_CERT = '1110A8F9B0DE16D417086A4BDBCF956070F0FD97';
export const GOOGLE_ANDROID_PACKAGE = 'io.quatt.mobile.android';
export const GOOGLE_CLIENT_VERSION = 'Android/Fallback/X24000001/FirebaseCore-Android';
export const GOOGLE_FIREBASE_CLIENT =
  'H4sIAAAAAAAAAKtWykhNLCpJSk0sKVayio7VUSpLLSrOzM9TslIyUqoFAFyivEQfAAAA';

/** Quatt mobile-app version/build sent in the Firebase remote-config fetch. */
export const QUATT_APP_VERSION = '1.42.0';
export const QUATT_APP_BUILD = '964';

/** Base URL for the Quatt mobile API. All `/me...` paths are appended to this. */
export const QUATT_API_BASE_URL = 'https://mobile-api.quatt.io/api/v1';

/** Google/Firebase endpoints used during anonymous auth. */
export const FIREBASE_INSTALLATIONS_URL =
  'https://firebaseinstallations.googleapis.com/v1/projects/-/installations';
export const FIREBASE_REMOTE_CONFIG_URL =
  'https://firebaseremoteconfig.googleapis.com/v1/projects/-/namespaces/firebase:fetch';
export const IDENTITY_SIGNUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
export const IDENTITY_LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
export const SECURETOKEN_URL = 'https://securetoken.googleapis.com/v1/token';

/** The Quatt cloud refreshes server-side roughly once per minute. */
export const PAIRING_TIMEOUT_SECONDS = 60;
