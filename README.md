# homebridge-quatt-chill

A [Homebridge](https://homebridge.io) 2.0 plugin to control your **Quatt Chill** airco
from Apple HomeKit.

It exposes each Chill as a HomeKit **HeaterCooler** accessory:

- **On/off**
- **Heat / Cool** mode
- **Target temperature** (separate cooling and heating setpoints)
- **Current temperature**
- **Fan speed** — Low / Normal / High (mapped to HomeKit's fan slider)

> ⚠️ **Heads-up — this uses Quatt's cloud.** The Chill cannot be controlled over the
> local network. This plugin talks to Quatt's mobile API (`mobile-api.quatt.io`) using
> the same reverse-engineered, anonymous authentication the Quatt app uses. It depends
> on Quatt's servers being reachable, and Quatt could change the API at any time. There
> are no Quatt account credentials to enter — instead you pair once by pressing the
> physical button on your CIC.

## Requirements

- Homebridge `^1.8.0 || ^2.0.0`
- Node.js `^22.12.0 || ^24`
- A Quatt CIC (Commander) and at least one paired Quatt Chill

## Installation

Install through the Homebridge UI (**Plugins → search "Quatt Chill"**), or:

```bash
npm install -g homebridge-quatt-chill
```

## Pairing (one time)

The Chill must be paired to an anonymous identity once before it can be controlled.

1. Find your **CIC hostname** — it looks like `cic-abc123`. It's the DHCP hostname of
   your CIC on your network (check your router's client list). Put it in `cicId`.
2. Pair using **either** method (you only need one):
   - **Settings UI:** open the plugin settings, save the `cicId`, click **Pair with
     Quatt**, and press the button on your CIC within 60 seconds.
   - **From the log:** save the `cicId`, restart Homebridge, and when the log prompts
     `>>> Press the button on your Quatt CIC now <<<`, press it within 60 seconds.
   - **Headless CLI** (fallback): `quatt-chill-pair --cic cic-abc123` (run it inside the
     Docker container if that's where Homebridge lives).

That's it — the installation id and tokens are stored automatically; nothing else to copy.

## Configuration

Use the Homebridge UI, or add a platform block to `config.json`:

```json
{
  "platforms": [
    {
      "platform": "QuattChill",
      "name": "Quatt Chill",
      "cicId": "cic-abc123",
      "heartrateSeconds": 60,
      "logLevel": 1
    }
  ]
}
```

| Field              | Required | Default            | Description                                              |
| ------------------ | -------- | ------------------ | -------------------------------------------------------- |
| `cicId`            | yes      | —                  | CIC hostname (e.g. `cic-abc123`), used for pairing.      |
| `heartrateSeconds` | no       | `60`               | Poll cadence. The cloud refreshes ~once a minute.        |
| `tokenFile`        | no       | HB storage path    | Where auth tokens are stored.                            |
| `logLevel`         | no       | `1`                | `0` off, `1` info, `2` debug, `3` verbose (HTTP traces). |

Until paired, the plugin loads but does nothing except prompt you to pair.

## Development

```bash
npm install
npm run build        # compile TypeScript to dist/
npm run lint
npm test             # vitest
npm run dev          # run a local, isolated Homebridge with this plugin (-U ./.hb-dev)
```

See [`CHANGELOG.md`](./CHANGELOG.md) for release history.

## How it works

- `src/quatt/` — the cloud client: `auth.ts` (Firebase anonymous identity + token
  refresh), `pairing.ts` (CIC button-press pairing), `mobileApi.ts` (Chill endpoints),
  `constants.ts` (the reverse-engineered app credentials — the one place to update if
  Quatt rotates them).
- `src/lib/` — small typed delegate base classes (Platform / Characteristic) with a
  1-second heartbeat, inspired by [ebaauw](https://github.com/ebaauw)'s homebridge-lib.
- `src/chillMapping.ts` — pure Chill ⇄ HomeKit mapping (unit tested).

## Acknowledgements

- [marcoboers/home-assistant-quatt](https://github.com/marcoboers/home-assistant-quatt)
  for the reverse-engineered Quatt API.
- [ebaauw](https://github.com/ebaauw) for the Homebridge plugin patterns.

## Support

If this plugin is useful to you and you'd like to say thanks, donations are
welcome (entirely optional): [bunq.me/homebridge](https://bunq.me/homebridge).

## License

[MIT](./LICENSE)
