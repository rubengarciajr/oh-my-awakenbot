# AWAKEN BOT

The in-app identity is **Awaken Church**, with the official white church wordmark and a slow, twenty-second morphing orb in the corner. The installed application is **Awaken Bot**.

AWAKEN BOT is a desktop workspace for your Hermes bots and coding sessions, for macOS and Windows.
It is a branded fork of [oh-my-hermes](https://github.com/rlaope/oh-my-hermes).
The source stays under `apps/omher/` so upstream changes remain practical to merge.

## Install

Download installers from [AWAKEN BOT releases](https://github.com/rubengarciajr/oh-my-awakenbot/releases).
Builds under the Actions **AWAKEN BOT installers** workflow are test artifacts, not published releases.

- **Mac, Apple Silicon:** `awaken-bot-<version>-macos-arm64.dmg`.
- **Mac, Intel:** `awaken-bot-<version>-macos-x64.dmg`.
- **Windows 10/11, x64:** `awaken-bot-<version>-windows-x64-setup.exe` or `.msi`.

Drag **Awaken Bot** into Applications on Mac, or run the Windows installer.
The current Mac builds are ad-hoc signed, not Apple notarized; Windows installers are not OS code-signed.
OS code signing is separate from the cryptographic signatures used by the in-app updater.

If Hermes is missing, first launch offers **Install**. It installs Hermes Agent and oh-my-hermes using
the upstream installer, then connects to your local bots. Model providers and coding tools still use your
own accounts. The app never takes over or patches Hermes.

## Branding and launch

The launch screen lasts five seconds while the bridge starts in the background. Each launch independently
chooses Charcoal or Quiet studio, with equal probability, and keeps that background throughout the launch.
The outer orb stays circular; liquid currents, dot texture and a pulsing glow move inside it.
Reduced motion uses a still image. After five seconds, setup, the workspace or a connection error appears.

Dark mode uses off-black surfaces and off-white text, with warm off-white brand accents. Light mode and the
existing optional accent palettes remain available in Settings. The app uses its own application identifier,
`com.awakenbot.desktop`, so it installs beside upstream omher. Internal protocol names and the existing
`.omher` session/account folders stay compatible with upstream; they are not renamed or migrated.

The approved vector masters are in `brand/`; app assets are generated with:

```sh
node scripts/brand-assets.mjs
pnpm tauri icon ../../brand/app-icon.png --output /tmp/awaken-icons
# Copy the desktop PNG, ICO and ICNS outputs into src-tauri/icons/; mobile outputs are not shipped.
```

## Develop and verify

Requires Node 22, pnpm 11, Rust and the platform's Tauri prerequisites. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
node scripts/brand-assets.mjs --check
node --test scripts/release-manifest.test.mjs
pnpm exec playwright install chromium
pnpm e2e
(cd src-tauri && cargo test --locked)
python -m unittest discover -s bridge/tests -v
pnpm tauri dev
```

The bridge tests need `websockets` and PyYAML; they use a fake gateway rather than your real bots.
For browser development, use `node e2e/mock-bridge.mjs --port 5308` and
`VITE_OMHER_BRIDGE=ws://127.0.0.1:5308/?token=dev pnpm dev`.
The five-second launch is enabled in the desktop shell; browser development opens the workspace directly.

## Build and release

The **AWAKEN BOT installers** workflow builds Apple Silicon, Intel Mac, and Windows x64 installers.
Build artifacts do not notify installed users. A Mac can also build a local DMG with `pnpm tauri build --bundles app,dmg`.

Set `TAURI_SIGNING_PRIVATE_KEY` in the build environment or repository Actions secrets, using the private
key whose public half is pinned in `src-tauri/tauri.conf.json`. Keep a protected backup outside the repo.
Losing this key prevents future updates to already installed copies. Never commit it.

For a release, update the matching versions in `package.json`, `src-tauri/Cargo.toml`, and
`src-tauri/tauri.conf.json`, and `VERSION` in `bridge/omher_bridge.py`; update Cargo.lock and `RELEASE-NOTES.md`. Test and merge, then tag that exact
commit `awakenbot-v<version>`. The release workflow creates a **draft** with signed update bundles,
installers and checksums. To publish, run **AWAKEN BOT release** for that tag with **publish** enabled.
Only that promotion changes `awakenbot-latest/latest.json` and makes installed users see an update.
Users choose to install and restart; releases already public are not overwritten.

Apple Developer ID signing/notarization and Windows code signing can be added before a wider launch.
They are not required to produce these test installers.

## Bring in upstream updates

```sh
git remote add upstream https://github.com/rlaope/oh-my-hermes.git  # once, if absent
git fetch upstream
git switch -c update/upstream-YYYY-MM-DD origin/main
git merge upstream/main
```

Resolve changes against the AWAKEN brand assets, launch screen, theme tokens, app identity, updater
public key/endpoint, and Mac/Windows-only release workflow. Run the app checks and build installers before
merging. Publish an AWAKEN version only after review; fetching or merging upstream never promotes the
live update manifest. Upstream's Python package keeps its original name and installation/update lifecycle.

The desktop safety contract remains in [OMHER-BOUNDARY.md](../../docs/OMHER-BOUNDARY.md).

## Credits

Agent and CLI marks in `src/assets/agents/` are the projects' own marks, unedited:

- [Lobe Icons](https://github.com/lobehub/lobe-icons) (MIT): Claude Code, Codex, OpenAI, Gemini, Gemini CLI, Grok,
  Grok Bot, Cursor, opencode, Amp, Cline, GitHub Copilot, Goose, Kilo Code, Junie, Qwen, Windsurf, TRAE, Roo Code.
  The model marks in `src/ui/modelMarks.ts` come from the same set.
- pi: `logo-auto.svg` from [pi.dev](https://pi.dev) ([pi-mono](https://github.com/badlogic/pi-mono), MIT).
- omp: the official mark from [omp.sh](https://omp.sh).
- OmO: `omo-icon-light.svg` from [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) (its viewBox
  trimmed to the tile).
- DSH: deepseek-bot's `docs/assets/logo-pixel.svg` from [deepseek-bot](https://github.com/rlaope/deepseek-bot) (MIT).
- OMH: the oh-my-hermes kami mark from this repository.

Each mark belongs to its owner and is used only to name that tool in the app.

New installations default to dark mode, even on a light operating system. Explicit saved theme choices are respected. The default palette uses off-black surfaces and warm off-white accents; optional colour palettes remain available. The launch backdrop fills every window size, with a separate circular orb and wordmark. Reduced-motion preferences stop both orb animations.
