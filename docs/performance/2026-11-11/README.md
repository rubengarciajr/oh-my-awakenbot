# Desktop performance evidence

`visual-work.json` contains every sample from a controlled synthetic Chromium fixture. It measures renderer `TaskDuration`, not native macOS CPU, energy use or model speed. The baseline is the installed-source revision `edc3d33c`; the candidate replaces animated embedded SVGs with stills and stops display clocks while hidden. Both runs use the same mock workspace, 1280×820 viewport, no submitted message and no reduced-motion preference.

Each arm records three visible and three hidden windows, alternating, with a 0.5-second settle and roughly five-second measurement per window. No sample is discarded. Compare the median hidden task seconds between arms; compare visible samples separately to check that the visible design still performs normally. These short synthetic samples establish a renderer-work improvement, not a native battery-life claim.

## Reproduce

Use separate baseline/candidate checkouts with installed desktop development dependencies. In `apps/omher`, start the mock bridge with `OMHER_MOCK_PORT=5578 node e2e/mock-bridge.mjs`, then Vite with `VITE_OMHER_BRIDGE=ws://127.0.0.1:5578/?token=dev pnpm exec vite --port 5577`. Run:

```sh
node scripts/profile-visual.mjs candidate /tmp/awaken-visual-candidate.json http://127.0.0.1:5577
```

Run the same script against the baseline checkout/host and use label `baseline`. The script overrides document visibility while keeping the renderer running, to model a hidden native WebView that continues reporting a visible document. Native-event and hidden-message behavior are separately tested in `e2e/visibility.spec.ts`. Native hide/reopen and live backend startup measurements must be recorded after the final build; these fixture results do not substitute for them.

The implementation scope and completion checks are in the [design](../../superpowers/specs/2026-11-11-desktop-performance-design.md) and [plan](../../superpowers/plans/2026-11-11-desktop-performance.md).
