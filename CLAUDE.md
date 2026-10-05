# CLAUDE.md

## Build & Development

This project requires **Yarn 4** via Corepack. Before first use:

```bash
corepack enable
corepack prepare yarn@4.14.1 --activate
```

If `corepack enable` can't write its shims (e.g. no write access to `/usr/local/bin`), prefix commands with `corepack` instead — `corepack yarn install`, `corepack yarn build`, etc.

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

| Path                 | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `src/main.ts`        | Module entry point; connection lifecycle, command routing   |
| `src/state.ts`       | `StateWrapper` type wrapping `AtemState` plus local caches  |
| `src/audioLevels.ts` | `AtemAudioLevels` — cache and subscriptions for live levels |
| `src/config.ts`      | User-facing config schema                                   |
| `src/models/`        | Per-model capability flags (which features each ATEM has)   |
| `src/actions/`       | Action definitions, one file per feature area               |
| `src/feedback/`      | Feedback definitions, one file per feature area             |
| `src/variables/`     | Variable schema (`schema.ts`), update helpers (`lib.ts`)    |
| `src/presets/`       | Preset definitions                                          |
| `src/options/`       | Shared option builders                                      |
| `src/upgrades/`      | Upgrade scripts for saved button configs                    |
| `src/__tests__/`     | Vitest unit tests                                           |

### Fairlight audio level monitoring

Real-time audio levels are **not** stored in `AtemState` — the switcher streams them (~50 Hz) only while asked to via the SFLN command. Everything goes through upstream's `AtemAudioLevels` (`StateWrapper.audioLevels`, `src/audioLevels.ts`):

1. Consumers `subscribe(id)` / `unsubscribe(id)`. SFLN is started when the first subscriber arrives and stopped (and the cache cleared) when the last one leaves. `resume()` re-sends SFLN after a reconnect, since the switcher forgets.
2. Levels arrive via the `levelChanged` event (`this.atem.on('levelChanged', ...)`) and are cached per source (`"<input>.<source>"`, e.g. `"1.-65280"`) and for the master.
3. Updates are coalesced: the callback passed to the constructor runs at most 20 Hz. In `main.ts` that callback rechecks the level feedbacks **and** pushes the level variables.

Consumers:

- **Feedbacks (upstream)** — `fairlightAudioMasterLevel` / `fairlightAudioInputLevel` in `src/feedback/audioLevels.ts`. `value`-type feedbacks showing the raw dB number; each subscribes with its own feedback id.
- **Variables (this fork's addition)** — `updateFairlightAudioLevelVariables()` in `src/variables/lib.ts`, called from `AtemInstance.updateAudioLevelVariables()`, which only sends values that changed. On connect, if the switcher has Fairlight audio (`atem.state.fairlight`), `main.ts` holds a permanent subscription under `LEVEL_VARIABLES_SUBSCRIPTION`, so levels always stream on Fairlight models. On disconnect the cache is cleared and the variables are blanked.

Level variables (strings in dBFS, from each source's _output_ levels):

| Variable                                       | Source                                   |
| ---------------------------------------------- | ---------------------------------------- |
| `audio_input_X_level_left` / `_right` / `_max` | Stereo source `-65280`                   |
| `audio_input_X_left_level`                     | Split-mono left `-256` (max of its L/R)  |
| `audio_input_X_right_level`                    | Split-mono right `-255` (max of its L/R) |
| `audio_master_level_left` / `_right` / `_max`  | Master                                   |

The stereo and master names match an earlier fork of this module, so existing button text using them keeps working. That earlier fork also had threshold feedbacks (`fairlightAudioSourceLevel` / `fairlightAudioSourceLevelThreshold` etc.) — those are **not** carried over; use Companion's internal variable-check feedback against the level variables instead.

Level values from the ATEM are signed 16-bit integers in hundredths of a dB; `AtemAudioLevels` divides by 100 to get dBFS.

### Syncing with upstream

This repo is a clone of `bitfocus/companion-module-bmd-atem` (`origin`), with the level variables committed on the `audio-level-variables` branch on top of the `v4.3.1` tag. To move to a newer upstream release:

```bash
git fetch origin --tags
git merge v4.x.y        # the new release tag
```

Upstream may eventually add its own level variables — if so, check for colliding variable keys and prefer upstream's implementation where it covers the same thing. After merging, run `yarn build`, `yarn test`, and `yarn lint` — a clean merge can still produce colliding identifiers (feedback IDs, variable keys) that only a build/test pass will catch. Then bump the version (see below) and `yarn dist`.

There is no fork remote configured; add one (`git remote add fork <url>`) before pushing anywhere. Pushing requires the `gh` CLI token to have GitHub's `workflow` scope if the history touches `.github/workflows/` — otherwise the push is rejected with "refusing to allow an OAuth App to create or update workflow". Fix with `gh auth refresh -h github.com -s workflow` (opens a browser).

### Adding a new feature area

1. Add actions in `src/actions/<area>.ts`, export from `src/actions/index.ts`.
2. Add feedbacks in `src/feedback/<area>.ts`, export from `src/feedback/index.ts`.
3. Add variable keys to `src/variables/schema.ts` and update helpers to `src/variables/lib.ts`.
4. If the feature is model-gated, add a capability flag to `src/models/`.

Renaming or removing a feedback/action ID breaks saved buttons that use it — add an upgrade script in `src/upgrades/` that migrates the old ID.

## Versioning

Companion requires strict semver. Use `major.minor.patch` or `major.minor.patch-prerelease` (e.g. `4.1.3`). Suffixes like `4.0.2a` are invalid and will be rejected by Companion's module loader.

Custom builds of this repo use `<upstream version>-levels.<n>` (currently `4.3.1-levels.1`), so they're distinguishable from the official release in Companion. Bump `n` for each new build on the same upstream version.

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
