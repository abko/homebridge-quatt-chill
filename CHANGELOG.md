# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-06-14

### Added

- **Pairing without the CLI.** Two new ways to pair:
  - **From the log** — on startup, if not paired, the plugin prompts you to press the
    button on your CIC (60s) and pairs itself.
  - **From the settings UI** — a "Pair with Quatt" button in the plugin settings runs
    the same flow with a live countdown.
  The `quatt-chill-pair` CLI remains as a headless fallback.

### Changed

- **Config is now just `cicId`.** The `installationId` field is gone — the plugin
  resolves the installation automatically after pairing. Existing configs keep working
  (the field is simply ignored).
- Token-file writes are atomic, so the settings-UI and the running plugin can pair
  concurrently without risk of a corrupted token file.

## [0.3.1] - 2026-06-14

### Added

- A donation link (`funding`), shown as a "Donate" button in the Homebridge UI and
  a Sponsor button on the GitHub repo.

## [0.3.0] - 2026-06-13

### Changed

- **Fan slider is now a 4-stop stepped control**: Off (0) / Low (33) / Normal (66) /
  High (99), matching the device's three fan speeds plus off.
- Dragging the fan to 0 no longer sends a spurious `SET_FAN_MODE LOW`; 0 is treated
  purely as off (handled by the power characteristic). This also removes a race where
  the stray fan command could fight the implicit "turn off" from HomeKit.
- When the unit is off, the fan slider now reads 0 instead of a non-zero speed, so the
  power toggle and fan slider never contradict each other (fixes on/off flakiness when
  using the fan slider).

## [0.2.0] - 2026-06-13

### Added

- Clearer default (Info-level) logging:
  - Every control action is logged with its outcome, e.g.
    `Airco: set cooling target → 20°C ✓`, and failures as
    `Airco: fan → HIGH — failed: <reason>`.
  - Device **state transitions** are logged when they change (e.g.
    `Airco: cooling`, `Airco: went offline`, `Airco: back online (off)`).
  - Diagnostic statuses are humanised, e.g. `WARNING_DISCONNECTED` →
    `Airco: warning — disconnected`.

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
