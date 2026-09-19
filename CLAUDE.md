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

Real-time audio levels are **not** stored in `AtemState` — they arrive via streaming commands at ~50 Hz. There are **two independent systems** in `StateWrapper` that both consume this stream, from a fork merge (see "Syncing with upstream" below) where our custom implementation and upstream's own implementation landed side by side rather than replacing each other:

**Ours — `StateWrapper.fairlightAudioLevels`** (`FairlightLevelsStore`, added in this fork):

1. On connect, `this.atem.startFairlightMixerSendLevels()` unconditionally sends the SFLN command whenever `model.fairlightAudio` is set — levels stream regardless of whether anything uses them.
2. `FairlightMixerSourceLevelsUpdateCommand` and `FairlightMixerMasterLevelsUpdateCommand` are handled in the `receivedCommands` loop in `main.ts`.
3. Levels are stored in a `sources` Map (keyed by input index → source bigint-as-string, e.g. `"-65280"` for stereo) and a `master` entry.
4. Feedback checks are throttled to 40 Hz via `scheduleAudioLevelFeedbackCheck()` to prevent button flicker.
5. Powers the `fairlightAudioSourceLevelThreshold` / `fairlightAudioMasterLevelThreshold` boolean feedbacks (`src/feedback/fairlightAudio.ts`) — compare a level against a threshold to drive button color — and the `audio_input_X_level_left/right/max` / `audio_master_level_left/right/max` variables, which update at full rate. Upstream has no equivalent of these variables.

**Upstream — `StateWrapper.audioLevels`** (`AtemAudioLevels` class in `src/audioLevels.ts`):

1. Subscribe/unsubscribe based — SFLN is only requested while at least one feedback using it is active (`state.audioLevels.subscribe(id)` / `unsubscribe(id)`), and levels are cleared on disconnect.
2. Fed via the `levelChanged` event (`this.atem.on('levelChanged', ...)`), not the raw commands.
3. Powers the `fairlightAudioMasterLevel` / `fairlightAudioInputLevel` `value`-type feedbacks (`src/feedback/audioLevels.ts`) — these just display the raw dB number on a button, no threshold comparison.
4. Checked at 20 Hz internally.

Because ours starts SFLN unconditionally, upstream's lazy subscribe/unsubscribe optimization is currently moot in practice — the stream is already running. The feedback names are deliberately non-colliding (`...Threshold` suffix on ours) since a straight rename would have broken existing Companion button configs built against the original names.

Level values from the ATEM are signed 16-bit integers; divide by 100 to get dBFS.

### Syncing with upstream

This fork carries a small number of commits on top of `bitfocus/companion-module-bmd-atem` (currently: the Fairlight level monitoring above, plus this file). An `upstream` remote is configured locally for pulling in upstream changes:

```bash
git fetch upstream
git merge upstream/main
```

Expect conflicts where upstream has since built its own version of something this fork added — resolve by keeping both where they're genuinely different features (as with the two audio-level systems above), not by silently dropping one side. After resolving, run `yarn build`, `yarn test`, and `yarn lint` before pushing — a clean merge can still produce colliding identifiers (feedback IDs, variable keys) that only a build/test pass will catch.

Pushing to `origin` requires the `gh` CLI token to have GitHub's `workflow` scope if the merge touches anything under `.github/workflows/` — otherwise the push is rejected with "refusing to allow an OAuth App to create or update workflow". Fix with `gh auth refresh -h github.com -s workflow` (opens a browser).

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
