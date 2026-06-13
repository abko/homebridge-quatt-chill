# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-13

### Added

- Clearer default (Info-level) logging:
  - Every control action is logged with its outcome, e.g.
    `Airco: set cooling target → 20°C ✓`, and failures as
    `Airco: fan → HIGH — failed: <reason>`.
  - Device **state transitions** are logged when they change (e.g.
    `Airco: cooling`, `Airco: went offline`, `Airco: back online (off)`).

### Changed

- The OFFLINE notice now logs once on transition instead of repeating every poll.
- A failed control action now propagates to HomeKit (the control reflects the
  failure) instead of silently succeeding.

## [0.1.0] - 2026-06-13

### Added

- Initial release: control a Quatt Chill airco from Apple HomeKit via Homebridge.
- HomeKit **HeaterCooler** accessory per Chill: on/off, heat/cool mode, separate
  cooling/heating setpoints, current temperature, and 3-speed fan (LOW/NORMAL/HIGH
  mapped to RotationSpeed).
- Quatt cloud mobile API client with Firebase anonymous authentication, token
  persistence, and refresh-on-expiry.
- One-time pairing via the `quatt-chill-pair` CLI (physical button-press on the CIC).
- Dynamic platform with a self-correcting heartbeat poll (default 60s) and stale
  accessory cleanup.
- Homebridge UI config schema, graduated logging (off/info/debug/verbose), and a
  unit test suite (mapping + auth refresh/retry).
- Homebridge 2.0 compatible (`homebridge` `^1.8.0 || ^2.0.0`, Node `^22.12 || ^24`).

### Notes

Verified end-to-end against a real Quatt Chill. Hardened from real-device behaviour:

- The Firebase installation/remote-config handshake is best-effort — Google gates it
  behind device attestation (403 off-device); anonymous signup works without it.
- `status` is treated as a free-form diagnostic string (e.g.
  `WARNING_NOT_COOLING_HEATING_SYSTEM_IS_HEATING`, the heat-pump heat-demand interlock);
  HomeKit current state is derived from `isOn` + status.
- Temperature fields can be `null` when the Chill loses its link to the CIC; these are
  tolerated and the last-known value is retained. Heating setpoints may sit below the
  cooling range, which has its own wider band.
- An accessory is only removed after several consecutive missed polls, to avoid the tile
  flapping when the Chill briefly disconnects.
