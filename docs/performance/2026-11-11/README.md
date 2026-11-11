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

## Observed installed app

The performance observations use runtime source `0acf422379918d5ae22ccd2c9502c22fef0cb783`; the separately reviewed and installed Hermes operator revision is `1b5c685509c98b407e3364dfa562097ed593daa2`. A subsequent copy correction labels `first_progress_ms` as Hermes activity because status updates can precede model output; timing logic and recorded values are unchanged. The app never applies backend patches. Both tested existing conversation identities, selected models, providers and reasoning settings survived the update. A short diagnostic reply was added to the existing chat; its context was not reset.

`live-history.json` compares authenticated reads of that same existing conversation: the recent native page transferred 123,307 bytes (54 projected rows), versus 3,190,112 bytes (655 rows) for the full resume. Older-page retrieval succeeded without a cursor reset. Read durations are single observations on a busy development machine, not a benchmark distribution. Full saved history and model context remain in Hermes; the display pager does not trim either.

`native-startup.json` records a repeat cold launch with 22 profiles, after revision maintenance had already run. Default local-session readiness was observed at 31.683 seconds of owner process age; all local profiles were available at 43.557 seconds after the probe clock. Full gateway readiness followed at 78.806 seconds after that clock. The probe began before app launch, so these two clock origins must not be compared as if identical. This does not establish an instant cold start: import, configuration and warmup work remains. `startup-phases.json` documents the separate first launch that included revision maintenance; its source/timestamp evidence does not prove which synchronous import caused each delay.

`live-reply.json` records one actual reply using the existing selection. The renderer received its first reply at 38.41 seconds. The bridge observed 2.782 seconds of preparation, 3.903 seconds to acknowledgement, 26.705 seconds across one physical AI request, and no tools. These intervals overlap. `first_progress_ms` is Hermes activity and may be a status update; it does not prove model output. Physical provider observations and first reply text establish those stages separately. The measurements locate observed delay without claiming the app can make that provider respond instantly. Recent diagnostic reports remain content-free and bounded in memory.

Final Mac packaging was checked before and after launching the installed application. A discovered Python bytecode cache invalidated the earlier bundle's resource seal; interpreter `-B` prevents that write. The clean final install matched every built file, generated no bundle cache, and passed strict signature verification after use. Both Mac DMG checksums and updater signatures were verified. The Desktop ZIP was CRC-checked and its contained DMG SHA-256 matched the verified Apple Silicon installer.

`native-cpu-before.json` and `native-cpu-after.json` contain three alternating five-second visible/hidden pairs on the installed Mac app. They cover the app owner and Python bridge, excluding uncorrelated launchd-owned WebKit processes. Hidden owner/bridge CPU was 0.05 CPU-seconds / 15.197 elapsed seconds before and 0.07 / 15.171 after (0.329% and 0.461% of one core). These short samples do **not** establish native CPU improvement. The controlled renderer fixture establishes the visual-work reduction; the native observation verifies low hidden owner/bridge work, the same process and window on restore, an empty preserved draft, and unchanged selected model. Gateway active work was zero before and after; the app's strict signature remained valid throughout.

A follow-up identified the app's GPU, Networking and WebContent helpers through matching macOS responsibility and coalition identities. `native-cpu-full-before.json`, `native-cpu-full-after.json` and `native-cpu-full-comparison.json` cover the stable five-process app/bridge/WebKit cohort. The baseline came from the pristine `edc3d33c` updater archive after both updater and strict app signatures passed. The installed build was restored and its executable matched the verified `0acf4223` archive.

Across three accepted hidden windows per arm, baseline CPU was 0.08 CPU-seconds / 15.270 elapsed seconds and candidate CPU was 0.09 / 15.240 (about 0.52% and 0.59% of one core). Both were already low; these samples establish **no native hidden-CPU improvement**. Visible observations were 13.25 / 15.449 CPU/wall seconds before and 11.41 / 15.315 after, but build order was post-then-baseline, process warmth and rendered history differed, and these are observational samples rather than a causal benchmark.

All accepted windows, rejected intervals and excluded pilots are retained. Baseline raw snapshots are indexed in `native-cpu-full-before.samples.jsonl`; the earlier candidate capture did not persist raw timestamps, which is recorded explicitly. Transient helper churn caused one refusal per arm; a refused interval is excluded from stable-cohort totals and must not be treated as measured zero. The evidence retains physical CPU/wall seconds rather than treating utilization as a corpus success rate. No broader battery-life or all-time CPU claim follows from these windows.
