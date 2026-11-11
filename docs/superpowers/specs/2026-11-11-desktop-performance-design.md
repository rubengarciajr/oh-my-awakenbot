# Awaken Bot performance

The user approved four improvements: recent-first chat history with older messages on upward scroll, desktop chat readiness independent of Telegram startup, less hidden-window visual work, and measured send-to-response latency with the selected model preserved. The same behavior must serve installations with one or two profiles and the existing large fleet.

## Conversation loading

Use Hermes' authenticated `session.transcript` protocol, discovered through `runtime.describe`, after metadata-only `session.resume`. Read a bounded latest page with inline images disabled, then read opaque older-page cursors on upward scroll. Preserve the viewport when prepending. Deduplicate durable row identities, preserve active streaming and pending approvals, and discard responses from an obsolete bot, connection or conversation window. A cursor reset refreshes stored history without resetting live work.

Older Hermes versions retain a compatibility path: resume the existing conversation once and page the returned display rows from bridge memory. Mark this path as legacy; it does not reduce the gateway transfer. The former display cap must not make already-fetched history unreachable.

The native pager's current rotated-lineage guard can exclude archived ancestors above `max_resume_messages`. Completion requires an explicit bounded, authenticated conversation-history read that reaches those saved ancestors, with tests for compaction, deduplication and cursor invalidation. This concerns display reads only; model context, saved history and session identity remain Hermes-owned.

## Local chat readiness

Keep global gateway readiness and service-supervisor readiness unchanged. Add a separate authenticated session-readiness gate after served-profile policy preflight, authority initialization and the recovery needed for local admissions. Publish only the capabilities that are usable at this gate. Native connection discovery explicitly selects session readiness; older clients retain the global gate.

Telegram and other configured channels continue connecting and recovering normally. A channel failure must not masquerade as a ready channel. A policy refusal, native listener failure, drain, stop or fatal startup failure withdraws session readiness and settles startup tasks. No duplicate gateway, listener or Telegram poller may be created. Installations without Telegram must not acquire a Telegram dependency.

The desktop calls Hermes' own discovery and ensure APIs. The app never applies backend patches. Operator changes to the installed backend are separately reviewed, versioned and reversible.

## Hidden-window work

Combine document visibility with native window visibility. Closing a Mac window hides it; Cmd+Q retains normal cleanup. Do not use loss of keyboard focus as evidence that a window is hidden.

While hidden, replace embedded SMIL orb images with existing still assets, pause CSS animation, and stop display-only clock intervals. Recompute elapsed labels immediately on restore. The daily intro timeout still advances, and backend subscriptions, prompts, notifications, connection recovery and automation work remain active. Respect reduced motion and retain the visible animation design.

## Reply timing

Collect bounded, local metadata for sends initiated in Awaken Bot. Measure preparation, submission acknowledgement, turn start, first model progress, first visible response, tool-active wall time and completion. Use canonical admission identity to avoid attributing another turn's activity to the send, including events arriving before its acknowledgement. Missing events or unsupported metadata must remain unknown, not zero.

Provider timings require a provider-request observation; message-start or generic status events cannot prove provider latency. Report combined/unattributed wait honestly until the relevant engine measurement is available. No prompts, response text, hidden reasoning, tool arguments, credentials or raw session identifiers enter a diagnostic report. Keep recent measurements bounded in memory, with no external upload. A read-only diagnostics surface makes the measurements inspectable.

## Verification and delivery

Prove page completeness, small initial transfer, scroll anchoring, active-turn and reconnect races with tests and a browser smoke. Prove staged readiness with blocked channel adapters for one, two and many profiles, as well as policy/failure/drain tests. Compare hidden visual work under the same fixture before and after, then verify native hide/reopen and continued event delivery. Verify timing arithmetic and correlation, plus an observed real chosen-model request without resetting the user's conversation.

Run the desktop's relevant unit, bridge, boundary, browser and native checks. Review the integrated changes before rebuilding Apple Silicon Mac, Intel Mac and Windows x64 packages. Install and smoke-test the Mac build with an application backup; do not interrupt active backend work. Preserve checksums, updater signature checks and source provenance. Keep the draft PR current. Publishing a public release is outside this optimization request.

## Added user requests

Produce a personal Linux x86_64 AppImage and Debian package as a one-off, with packaged startup verification and checksums. Keep the regular Mac/Windows release matrix and public updater feed unchanged.

During initial account connection, show a centered rotating 300×300 brand orb with small Loading text and dots progressing one/two/three. Blur and dim the entire application behind the sharp foreground treatment. Keep navigation and window controls available, respect reduced motion and hidden visual pausing, and remove the overlay when ready or when a permanent actionable error arrives. Already loaded conversation history stays readable during a reconnect.
