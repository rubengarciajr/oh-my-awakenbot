# Awaken Bot Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all four approved performance improvements and verify the installed Mac app and packaged Mac/Windows builds.

**Architecture:** The desktop remains a client of Hermes-owned APIs. Independent work covers conversation display paging, a separate backend session-readiness gate, visibility-controlled visual work, and local reply timing. Integrate only reviewed, measured changes; keep backend source repairs separate from app installation.

**Tech Stack:** React, TypeScript, Tauri/Rust, Python, Hermes native gateway, Vitest, unittest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-desktop-performance-design.md`

## Global Constraints

- Preserve selected models, saved conversation identity, complete saved history and model context.
- Preserve enabled channels, tools, profiles, approvals and automations.
- No new dependency, hidden backend patch, external telemetry upload or automatic write retry.
- Build Apple Silicon Mac, Intel Mac and Windows x64; keep normal Cmd+Q behavior.
- Do not interrupt active backend work for measurements or installation.

## Review Focus

- History changes during a page request: preserve live messages, controls and a stable viewport.
- Rotated history exceeds the resume guard: all saved display history remains reachable in bounded pages.
- Session readiness precedes Telegram: policy, listener, recovery and drain guards still apply.
- Hidden windows continue receiving events: display timers pause but backend work remains live.
- A send queues or its acknowledgement is late: timing belongs to the admitted turn and unknown values remain unknown.

## Task 1: Recent-first history

**Files:** bridge `omher_bridge.py`; `src/lib/protocol.ts`; `src/state/store.ts`; `src/chat/parts/Timeline.tsx`; matching bridge, store and browser tests. Any required backend history extension lives in an isolated Hermes worktree.

**Interfaces:** Native `session.transcript`; app `chat.history` bound to the opened main chat; `ChatOpenResult.history` identifies mode and cursor. Opaque native cursors are never constructed by the UI.

- [x] Add failing tests for bounded opening, legacy compatibility, complete lineage, overlapping pages, cursor reset and stale responses.
- [x] Implement metadata resume, paged display normalization and authenticated older-page reads.
- [x] Implement upward-scroll loading with viewport preservation and accessible loading/retry state.
- [x] Verify fixture completeness and read-only live transfer/latency against the same existing conversation.
- [x] Review and commit the complete history change with observed evidence.

## Task 2: Independent session readiness

**Files:** isolated Hermes runtime/discovery, startup, native authentication and associated tests; app bridge `_default_connect` and startup compatibility tests.

**Interfaces:** Hermes discovery/ensure readiness selector defaults to global gateway readiness; desktop explicitly requests session readiness when supported. The additional readiness claim carries authenticated local-session capabilities only.

- [x] Add failing blocked-adapter tests for one, two and many profiles, plus absent Telegram, policy refusal, listener failure and drain.
- [x] Implement preflight/local recovery before session publication; retain the global platform startup contract.
- [x] Implement capability-aware desktop attachment without restarting a still-starting owner.
- [x] Review lifecycle and identity checks, run canonical backend tests, then commit the separate engine repair.
- [x] Apply reviewed backend changes through Git and perform one guarded idle cold-start measurement after integration.

## Task 3: Hidden visual work

**Files:** `visualActivity` source/hook; `OrbMark`; `LaunchScreen`; shared `useNow`; activity/fallback components; native `window_lifecycle.rs`; unit/browser tests.

**Interfaces:** A shared visual-active boolean combines document/native visibility; it never gates bridge/store subscriptions.

- [x] Record comparable synthetic baseline measurements before visual pausing.
- [x] Add failing lifecycle tests for hidden intervals, still assets, restore refresh and live events while hidden.
- [x] Implement native visibility publication, static hidden assets, paused CSS and display-only timer cleanup.
- [x] Verify visible appearance, reduced motion, daily intro and measured hidden work, then review and commit.

## Task 4: Reply timing

**Files:** a bounded bridge timing helper and tests; send/event hooks; read-only diagnostics protocol and settings surface; engine observation seam only where required for provider attribution.

**Interfaces:** Sanitized recent timing snapshots; canonical admission correlation; finite durations and explicit unknown fields. Retain no content and upload nothing.

- [x] Add failing deterministic tests for acknowledgements, pre-ack events, queued/unrelated turns, overlapping tools, errors, disconnects and bounded storage.
- [x] Measure bridge preparation/submission, first progress/text and tool wall time; add provider-request observation without changing routing.
- [x] Expose read-only local measurements with honest field labels and unavailable states.
- [x] Verify real selected-model timing without resetting the existing conversation; review and commit.

## Task 5: Integrated delivery

- [x] Review all changes against the spec and resolve findings.
- [x] Run appropriate complete desktop checks and backend lifecycle/history/observation checks.
- [x] Build all three desktop targets, verify updater signatures/checksums and record source revisions.
- [x] Back up and install the latest Mac build, verify paging/visibility/recovery and preserve the user's draft.
- [x] Update draft PR and local evidence; complete the requirement-by-requirement audit before marking the goal complete.

## Task 6: Personal Linux build (user-added scope)

The user requested a one-off Linux build for personal use. Build the current installed release on Linux x64 as an AppImage and Debian package, on a separate `build/awaken-linux-personal` branch. Keep the regular Mac/Windows matrix and updater feed unchanged.

- [x] Create a scoped build workflow, packaged startup smoke and checksums/provenance collection.
- [x] Push and start the actual Linux runner build (run `43088688802`, source `168091e4`).
- [x] Follow the live run to completion, fix any build/smoke failure, then download and verify the artifacts. Run43088688802 succeeded; release AppImage startup smoke and downloaded SHA-256 checks passed.
- [x] Give the user the personal AppImage and Debian package with supported architecture and observed validation. Links delivered in chat; installers and README are in build-artifacts/linux-personal-168091e4.

## Task 7: Visible account loading (user-added scope)

The user requested a centered 300×300 rotating orb with small Loading text and one/two/three blinking dots, over a blurred and dimmed whole application. Show it during an initial selected bot connection, including recoverable startup waits. Clear it when the conversation opens or an actionable permanent error arrives. Preserve an already loaded conversation, available navigation/window controls, reduced motion and hidden-window visual pausing.

- [x] Implement the loading state predicate and foreground overlay using the existing brand orb.
- [x] Verify centering, dimensions, full-window blur, animated dots/orb, loaded/error transitions, reduced motion and navigation.
- [x] Include it in the reviewed, rebuilt Mac and Windows delivery.

## Task 8: Desktop installer ZIP (user-added scope)

- [x] After final verification, ZIP the latest Apple Silicon Mac DMG and put the ZIP on the user's Desktop. Preserve any pre-existing file with the chosen name.
- [x] Verify the ZIP contains the final DMG bytes and provide the absolute file link.

## Observed delivery status

Final app runtime source: `564df1e237eaac474fa175486f1d9124c56d7d17`. Separate installed operator Hermes source: `1b5c685509c98b407e3364dfa562097ed593daa2`. Both Mac targets were rebuilt locally, and the complete desktop CI matrix (`43099898402`) passed for Apple Silicon, Intel and Windows. Windows artifact digest/CRC and updater signature passed; its checked-out merge tree exactly matches the app runtime source tree. All three updater signatures and the local release manifest were verified. No public release, updater promotion or merge was performed.

The final Apple Silicon app was backed up, installed and opened. Every installed file matched the built bundle; strict signatures passed before and after launch; no Python bundle cache appeared. Existing chat, current model and empty draft were restored. Read-only metadata checks confirmed both tested conversations retained their stored identity, model, provider and reasoning. The final Desktop ZIP `Awaken Bot - Mac - 564df1e2.zip` passed CRC and contained-DMG SHA-256 verification, and its link was delivered.

Observed checks: UI unit 531 passed; bridge 211 passed/one skipped; boundary 47 passed; local Mac Rust 165 passed/six ignored; combined separate backend 161 passed/one skipped and all 15 quality checks. The full browser rerun passed 366 tests/eight skips after fixing proven startup test synchronization races. The subsequent eight localized timing-label strings passed typecheck and both affected browser tests; no timing/runtime logic changed. App checks and Hermes compatibility CI also passed. Full harness CI run `43099899257` passed: both distribution jobs, both Linux shards, all four Windows shards and the exact-coverage aggregate completed successfully. Root compile, Ruff 0.17.3, all ten generated/document checks, the skill-pack check and selected deterministic documentation claims passed locally.

Personal Linux refresh source: `c5068a451534c03d2f7a46f8bdb5131bc9f0276f`, with runtime paths identical to app source `564df1e2`. Run `43099929486` passed all checks, release AppImage/Debian packaging and packaged startup smoke. The downloaded artifact digest, CRC, source revision and every package checksum passed. The AppImage and Debian package links were delivered; this stays a one-off outside the regular Mac/Windows updater matrix. Earlier transient Actions failures are terminal historical attempts, not current blockers.

Sanitized native startup, history transfer, reply and CPU evidence is in `docs/performance/2026-11-11/`. Startup observations distinguish probe-clock elapsed time from owner age and revision maintenance. Native measurements include the stable app/bridge/three-WebKit cohort and all rejected/excluded attempts; both builds already used little hidden CPU, so no native CPU improvement is claimed. The controlled renderer fixture proves the hidden display-work reduction. `first_progress_ms` is Hermes activity and may be status text; physical provider observations and first reply text establish model stages separately.
