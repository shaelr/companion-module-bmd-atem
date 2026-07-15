# CLAUDE.md

## Build & Development

This project requires **Yarn 4** via Corepack. Before first use:

```bash
corepack enable
corepack prepare yarn@4.14.1 --activate
```

Then:

```bash
yarn install   # install dependencies
yarn build     # compile TypeScript → dist/
yarn dist      # package to bmd-atem-<version>.tgz for Companion installation
yarn test      # run vitest test suite
yarn lint      # ESLint
```

`yarn build` must be run before `yarn dist` — the packager requires compiled JS in `dist/`.

## Architecture

This is a [Companion](https://bitfocus.io/companion) module for the Blackmagic Design ATEM switcher family, built on `@companion-module/base`. It communicates with the ATEM via the `atem-connection` library.

Key entry point: `src/main.ts` — the `AtemInstance` class extends `InstanceBase` and wires everything together.

### Source layout

| Path             | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `src/main.ts`    | Module entry point; connection lifecycle, command routing  |
| `src/state.ts`   | `StateWrapper` type wrapping `AtemState` plus local caches |
| `src/config.ts`  | User-facing config schema                                  |
| `src/models/`    | Per-model capability flags (which features each ATEM has)  |
| `src/actions/`   | Action definitions, one file per feature area              |
| `src/feedback/`  | Feedback definitions, one file per feature area            |
| `src/variables/` | Variable schema (`schema.ts`), update helpers (`lib.ts`)   |
| `src/presets/`   | Preset definitions                                         |
| `src/options/`   | Shared option builders                                     |
| `src/__tests__/` | Vitest unit tests                                          |

### Fairlight audio level monitoring

Real-time audio levels are **not** stored in `AtemState` — they arrive via streaming commands at ~50 Hz. The flow:

1. On connect, `this.atem.startFairlightMixerSendLevels()` sends the SFLN command to enable streaming.
2. `FairlightMixerSourceLevelsUpdateCommand` and `FairlightMixerMasterLevelsUpdateCommand` are handled in the `receivedCommands` loop in `main.ts`.
3. Levels are stored in `StateWrapper.fairlightAudioLevels` — a `FairlightLevelsStore` with a `sources` Map (keyed by input index → source bigint-as-string, e.g. `"-65280"` for stereo) and a `master` entry.
4. Feedback checks are throttled to 40 Hz via `scheduleAudioLevelFeedbackCheck()` to prevent button flicker.
5. Variable values (`audio_input_X_level_left/right/max`, `audio_master_level_left/right/max`) update at full rate.

Level values from the ATEM are signed 16-bit integers; divide by 100 to get dBFS.

### Adding a new feature area

1. Add actions in `src/actions/<area>.ts`, export from `src/actions/index.ts`.
2. Add feedbacks in `src/feedback/<area>.ts`, export from `src/feedback/index.ts`.
3. Add variable keys to `src/variables/schema.ts` and update helpers to `src/variables/lib.ts`.
4. If the feature is model-gated, add a capability flag to `src/models/`.

## Versioning

Companion requires strict semver. Use `major.minor.patch` or `major.minor.patch-prerelease` (e.g. `4.1.3`). Suffixes like `4.0.2a` are invalid and will be rejected by Companion's module loader.

## Installing on Companion

Copy the built `.tgz` to the Companion host and install via **Settings → Modules → Install from file**, or place it in the modules directory manually and restart Companion.

On a Companion Pi the modules directory is typically:
`/home/companion/.config/companion-nodejs/modules/`

If Companion rejects a new version due to a cached bad version string, delete the SQLite cache files and restart:

```bash
sudo systemctl stop companion
sudo rm /home/companion/.config/companion-nodejs/v*/cache.sqlite*
sudo systemctl start companion
```
