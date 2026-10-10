# Line by line code review

Started: 2026-10-02. Status: **in progress**.

Last verified coverage checkpoint: **1,562 files, 226,488 lines read in full**. The ledger now records **249 issues**; additional files have since been reviewed, but the full coverage inventory has not yet been reconciled. The repository-wide target remains much larger, so this document must not be treated as a complete audit.

This is a coverage ledger and finding log for a source-level review of the repository. A file is marked reviewed only after reading its complete contents and checking relevant callers or contracts for suspected defects. The review preserved existing local changes. Remediation began at the user’s request on 2026-10-03; pre-existing edits are being preserved while applying the fixes. Line references describe the working tree at review time.

## Remediation

Additional remediation: R105 now deletes expired membership-cache entries on read and bounds the cache at 50,000 entries, sweeping expired entries and evicting the oldest when full. R109 now applies the instance registration-disabled policy to guest upgrades with the same response as direct registration. R110 now rejects mixed email-change and profile-edit requests so accepted fields cannot be silently discarded. R111 now validates memory profile edits and guest upgrades against cloned records and commits only after all fallible validation and hashing succeeds. R112 now serializes phone OTP challenge issuance by locking the user's auth row in one transaction around cooldown validation, old challenge invalidation and insertion. R113 now uses the shared atomic webhook delivery guard with a ten-minute TTL instead of a process-local map. R114 now sets `skipOnError: false` for configured shared Redis rate limiting, so Redis failures reject the request rather than bypassing the global limits. R099 now performs Redis WATCH/MULTI session mutations on a dedicated connection so concurrent CAS operations cannot overwrite each other's WATCH state. R115 now reserves each first-time metadata import atomically with a conditional upsert before work starts, preventing concurrent requests from over-consuming the daily quota. R116 now serializes operator changes with a transaction-scoped advisory lock and checks the last-operator invariant before demotion, with the audit in the same transaction. R117 now returns a scanner error until a configured blocklist has loaded a valid snapshot and treats malformed entries as load failures. R118 now caps queue insertion at the remaining configured depth even when the requested batch is larger. R119 now creates external scanner temporary directories with mode 0700 and input files with mode 0600; synthetic scanner tests verify both permissions. R120 now holds a PostgreSQL advisory lock per Echo channel through bridge re-read, webhook creation and bridge persistence. R121 now acquires and releases each scheduled job's PostgreSQL advisory lock on the same checked-out client. Backend TypeScript compilation and the CSAM scanner suite pass.

R245 now attaches a rejection handler to opportunistic socket warm-up; the normal realtime lifecycle remains responsible for recovery.

R246 now converts recognized local-upload URLs to path-only same-origin routes, rather than forwarding an arbitrary input origin; its focused web regression passes.

R122 now gates development diagnostics on the socket peer's exact loopback address, ignoring Host and forwarded headers.

R123 now checks the normalized MIME essence before applying the blocked-type list, so parameters cannot disguise inline SVG or another blocked media type; the upload policy regression passes.

R124 now requires guests to be at least 90 days old and untouched for 90 days, excludes active server sessions, prints candidate age, and rechecks the complete interaction/age predicate in each deletion statement.

R125 now bounds game-service requests at ten seconds, converts transport and parse errors to unavailable results, and attaches rejection handlers to join/action/leave and disconnect cleanup tasks.

R126 now copies shadow reactions with `ON CONFLICT DO NOTHING` and deletes only the source reaction rows after successful insertion, preserving non-conflicting reactions when the canonical user already has a duplicate.

R247 now catches failures from detached message-request acceptance and DM navigation flows; the acceptance helper exposes an optional error callback and its focused web regression passes.

R248 now blocks stage camera/screen publication while channel metadata is unavailable; the focused stage publishing test passes.

R127 now attaches terminal rejection handlers to the named socket, room-adapter and Discord gateway tasks. Chat/channel tasks emit stable failure responses where possible, and the remaining failures are logged. Backend TypeScript compilation passes.

R128 now updates image-slot content with a JSONB compare-and-set against the document originally read, returning `slot_already_filled` if another writer wins; the focused image-slot suite passes.

R131 is covered by the separate `echo.voiceE2eeJoinRace.integration.ts` regression, which posts a correctly signed `room_finished` event through the real LiveKit webhook route while a REST participant and MLS group exist, then verifies the group survives and session minting succeeds. This newer test invokes the production handler; the finding's cited older test remains deficient. The integration test was inspected but not run because it requires a configured database and LiveKit.

R132 now uses conflict-safe request insertion and serializes moderator decisions by locking the pending row through participant promotion and deletion in one database transaction. Stage-speaker mutation participates in that transaction, so only one concurrent approve/reject wins. Audit, roster publication, and LiveKit synchronization still occur after this transaction in the route; durable outbox delivery and injected concurrent request/decision tests remain to be completed.

R087 now holds a per-migration PostgreSQL session advisory lock on one checked-out client, rechecks the marker after acquiring it, and only returns the client to the pool after unlocking (destroying it if unlock fails). This prevents concurrent replica callbacks from running the same migration. Existing callbacks still issue pool-level statements, so their work and marker are not one transaction; crash recovery for partially applied callbacks remains open.

R133 now verifies the Google link before stopping streams or deleting related credentials, and deletes the Google, YouTube channel, and stream-key rows in one transaction. The external stream stop still precedes the database transaction; durable retry/outbox coordination and injected-failure tests remain open.

R134 now uses Fastify's already hop-validated `req.ip` directly for HTTP, and socket IP resolution selects the forwarded address using `ECHO_TRUST_PROXY_HOPS` without trusting `CF-Connecting-IP`. Backend typecheck and the shipping-security test pass.

R135 now resolves the configured official server on each onboarding operation instead of caching positive or negative database results indefinitely. This avoids stale resolution after server or vanity changes at the cost of one small lookup per onboarding attempt.

R136 now locks the account row before counting server slots and holds that lock through membership insertion for invite, directory, and official-server joins. Server creation uses the same account lock across its slot check and creation, serializing concurrent admission across different target servers. Backend typecheck passes; database concurrency regressions remain to be added and require PostgreSQL.

R137 now records at most one open per user, activity, and UTC day; popularity is derived from those deduplicated records, and the open route has a 60/hour rate limit. The database regression now checks replay deduplication and requires an existing test user; backend typecheck passes. Database execution remains contingent on PostgreSQL.

R138 now serializes each reaction toggle on a session advisory lock keyed by message, user, and normalized emoji, held through the state read, mutation, and aggregate read. Unlock failure destroys the checked-out connection. Database concurrency verification remains to be added.

R139 now requires `deleted_at IS NULL` in legacy and JSON message edit updates, checks each update's affected-row count, and reports a concurrent delete as not found; search flags are refreshed only after a successful edit. Backend typecheck passes; deterministic database race coverage remains open.

R140 now disconnects the affected user's sockets entirely if channel enumeration fails during membership eviction, preventing stale channel-room subscriptions from surviving an incomplete cleanup. Successful enumeration still evicts only the removed server's scopes.

R141 now serializes ringtone capacity checks on the user's auth row and performs recount plus insert in the same transaction. Backend typecheck passes; database concurrency coverage remains open.

R142 now keys upload-dedupe registrations by `(sha256_hex, uploader_id)` and migrates the prior global hash primary key, allowing each uploader to register identical bytes independently while preserving per-user deduplication. Backend typecheck passes; the migration requires PostgreSQL validation.

R143 now commits uniquely named RBAC fixtures before evaluating them through the pool and removes its fixture server and users in `finally`, so the evaluator can observe the test rows without leaving shared state behind.

R145 now searches successive occurrences of each configured term until it finds a whole-word match, using Unicode letter/number boundaries. A focused matcher regression covers embedded-then-standalone, repeated embedded, punctuation, and Unicode-adjacent cases.

R146 now measures realtime health with a bounded NATS `flush()` round trip and reports timeout or connection failure as unavailable rather than healthy. Backend typecheck passes; probe-specific timeout coverage remains open.

R147 now makes final Watch Together byte accounting conditional and atomic against the session maximum, rejecting and purging an upload that loses a near-cap race. This prevents concurrent completion from taking `bytes_used` over the cap. Presign-time reservation, idempotent registration keyed to upload intents, and release of failed/abandoned reservations remain open.

R148 now writes browser harness credentials only into a new file with mode 0600 inside a mode-0700 directory, rejects unsafe/pre-existing output locations, omits credential JSON from stdout, and removes the artifact on SIGINT/SIGTERM or error.

R149 now wraps the complete best-effort welcome-message workflow in a terminal catch that logs context and absorbs enrichment or delivery failures, including those after persistence.

R150 now calls the existing batch viewer-visibility query once for all connected users and fans out only to the returned viewer set, replacing serial per-viewer database round trips.

R152 now keeps the intentional default-to-online behavior only for missing or blank HTTP status values; nonempty invalid values remain invalid and the route returns `INVALID_STATUS`. Unit coverage now checks invalid input and the `DND` alias.

R151 now fails closed with HTTP 503 when a configured YouTube usage budget cannot be checked in Redis, validates the Lua response shape and counters, and reports Redis availability only after a successful consume. The client still controls reported elapsed time and can omit reports; server-owned playback metering and per-user bounds on global contribution remain unresolved.

R153 now carries the generated sequence into the next millisecond after 4,096 IDs, resumes sequence state from the durable mapping table after restart, and updates user reports, message reports, and Discord media-mirror queue references alongside existing message references. The script remains PostgreSQL-dependent; dense-timestamp and schema-driven reference tests remain open.

R154 now marks only rows still older than the stale cutoff in one database-time `UPDATE ... RETURNING`, so a concurrent heartbeat prevents the offline transition. Heartbeats also restore an existing offline row to the authenticated profile status instead of only touching its timestamp.

R156 now ignores older Discord presence snapshots during conflict updates. Equal timestamps use last-arriving delivery as the deterministic tie rule.

R157 now sends service-driven message edits through `broadcastToEchoChannel`, applying the authorized local fan-out path and cross-node transport used by socket edits and deletes.

R158 now treats malformed user/global Redis quota responses and configured Redis command failures as unavailable, returns HTTP 503 for cold image searches when quota enforcement cannot be checked, and omits fresh quota headers when usage cannot be read. In-memory quotas remain for unconfigured local development. Outage regressions remain to be added.

R159 now converts fetch transport and abort failures from either GIF provider into a null provider result, allowing the configured Klipy fallback to run after Giphy network failures (and vice versa).

R155 replaces broad name/prefix-based deletion with exact server/user ID manifests, a one-day minimum age, production-shaped database refusal, a dry-run plan hash that must be repeated with `--confirm-plan`, and transactional row locks/revalidation before deletion. A selected user cannot be deleted while owning a server outside the manifest.

R160 now rejects unsupported Discord channel `topic`/`position` and member `mute`/`deaf` fields with explicit validation errors instead of returning success for no-op updates.

R161 now namespaces every Honcho session by authenticated Echo user, creates sessions with only that user's peer, rejects queries targeting another peer, and applies the same namespace to server-driven message sync. This prevents arbitrary session/peer identifiers from addressing another user's memory; a focused namespace regression was added.

R162 now rejects linked-role propagation when an implied role grants any permission absent from the explicitly selected seed role or sits above the seed's hierarchy position. Since callers authorize the seed grant and hierarchy first, this prevents link closure from elevating the resulting grant set or rank; unsafe links created before later role edits are skipped at assignment time.

R163 now claims each user/message report's 24-hour cooldown with a conditional upsert and inserts the report in the same transaction. Existing recent reports seed the cooldown table during schema setup; concurrent attempts can only produce one inserted report and therefore one notification.

R164 now excludes invite-preview voice channels when either the retained legacy category or channel overwrite explicitly denies `VIEW_CHANNEL`, alongside the normalized overwrite checks.

R165 now creates a Paper share token with a compare-and-set update and returns the winning persisted token after a concurrent writer wins, instead of returning a generated token that was never stored.

R166 now performs voice-mirror row creation, mirror-only marking, CONNECT denial overwrite replacement, and legacy-overwrite cleanup in one transaction. Permission cache invalidation runs after commit; retries overwrite the same mirror row and deny state idempotently.

R167 now sends DM and server-role notification recipients in batches of at most eight, bounding simultaneous per-recipient access/preferences/override/attention-snapshot queries and push requests. Bulk query reduction and durable queued delivery remain open.

R168 now tracks whether permission computation completed without a generation change and writes to the cache only when the generation still matches after computation. Retry exhaustion returns the computed result to the current caller without retaining it for later authorization decisions.

R171 now distinguishes an omitted archive field from an explicitly supplied `null`, allowing callers to unarchive a forum post while preserving its current state when the field is omitted.

R172 now validates Paper channel IDs before rate-map admission and caps the process-wide rate map at 50,000 entries with periodic ten-minute expiry pruning; at capacity it evicts the oldest limiter record.

R173 now makes the outbox branch the sole dispatcher for durable workspace events and marks delivery only after dispatch succeeds; failures return the processing row to retryable pending state with backoff. The outbox insert is still detached from the underlying state mutation transaction, so process exit before its insert completes remains a durability gap.

Requested: 2026-10-03. **Code fixes implemented for R001–R086, R089–R097, R100, R104, R107 and R242–R244.** The original findings and review-time line references remain below as the audit record. This remediation does not complete the repository-wide review. The four findings added during the earlier continued review, R079–R082, have also been fixed and verified. R083 now migrates and clears a legacy base overwrite only when the corresponding members overwrite exists, preserving it beside unrelated normalized rows. R084 now reuses a case-insensitive existing category and appends new categories after the current maximum position. R085 creates the emoji pack table and indexed columns before attempting its optional indexes. R086 no longer creates the legacy timeline index when the cleanup flag is enabled. R089 bounds the in-memory WebAuthn fallback and removes expired entries when capacity is reached. R090 now issues discoverable-credential authentication options without looking up accounts or returning account-specific credential IDs. R091 now updates stored WebAuthn counters monotonically in PostgreSQL and memory mode, preventing concurrent lower-counter assertions from rolling the counter backward. R092 now rejects TOTP verification when configured Redis replay storage fails rather than falling back to a replica-local replay decision. R093 now watches the policy's parent directory, so atomic replacement and recreation remain observable; the regression passed. R094 now parses environment overrides strictly and reports the variable name on invalid values; boolean, integer and float typo regressions passed. R095 now injects a snapshot builder in the scheduler test and asserts exactly one emission per distinct user; the regression passed. R096 now tests only contract-valid presorted input and is registered in the RBAC test script; the regression passed. R097 now catches and logs detached session-touch failures so an optional Redis TTL refresh cannot create an unhandled rejection. R100 removes expired sessions from both memory indexes and sweeps never-accessed expired rows periodically. R104 now makes every GET verification request a non-consuming fragment redirect; the token is consumed only by the POST endpoint. R107 now fails login protection closed when configured Redis reads or writes fail rather than silently switching to per-process state. R242 was fixed by checking Echo+ entitlement and channel upload permission, plus the owned registered library upload and quota, before claiming the host slot. R243 was fixed by clearing the channel completion marker before replacement begins so failed rebuilds remain visibly incomplete and retryable. R244 was fixed by reading message-format settings through the channel metadata API whose return type includes those fields. Backend TypeScript compilation, login-protection and TOTP suites, WebAuthn capacity check, atomic policy-replacement regression, strict environment parsing regression, attention scheduler regression, and permission-order regression pass; the channel-settings integration suite cannot reach PostgreSQL at `localhost:5433` in this environment.

The verification column distinguishes executed regressions from source inspection. Existing local edits were preserved. No size baseline, placement allowance or audit bypass was added.

| Finding | Implemented change                                                                                                                     | Verification                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| R001    | Resolve the watchdog under server/ops/scripts and handle child launch errors.                                                          | Bot build; path checked.                                                                                 |
| R002    | Retain polling across shard disconnects and skip disconnected clients.                                                                 | Bot build; reconnect lifecycle inspected.                                                                |
| R003    | Advance voice snapshot history only on successful delivery; schedule retries.                                                          | Bot build; scheduler and reconciliation inspected.                                                       |
| R004    | Serialize all exports per guild through one shared queue.                                                                              | Three export concurrency regressions passed.                                                             |
| R005    | Trigger recovery once per outage transition rather than per subscription.                                                              | Bot build; transition ownership inspected.                                                               |
| R006    | Spread root file environment into the bot PM2 process.                                                                                 | Configuration checked.                                                                                   |
| R007    | Use neutral message jump previews, reject foreign origins and strip historical private fields.                                         | Preview regression passed without any private-data query.                                                |
| R008    | Decrement the reaction count independently of disclosed reactor IDs.                                                                   | Reaction regression and web suite passed.                                                                |
| R009    | Discard query strings and fragments from relative media storage keys.                                                                  | Signed media regression and web suite passed.                                                            |
| R010    | Parse quoted and escaped rich-block attributes without truncation.                                                                     | Rich token regressions passed.                                                                           |
| R011    | Encode button fields in a versioned URL-safe format with legacy support.                                                               | Button serialization regressions passed.                                                                 |
| R012    | Reject ambiguous duplicate image-slot target IDs.                                                                                      | Image-slot contract regressions passed.                                                                  |
| R013    | Reserve canonical slot IDs before consuming historical fallback slots.                                                                 | Image-slot rebuild regressions passed.                                                                   |
| R014    | Use explicit mention identity without falling back to a matching label.                                                                | Mention regressions and web suite passed.                                                                |
| R015    | Validate partial and merged instance policy against the complete JSON schema.                                                          | Four instance-policy suites passed.                                                                      |
| R016    | Preserve paired role permissions unless the UI pair changes.                                                                           | Role merge regression passed.                                                                            |
| R017    | Request the Discord GuildPresences intent and document the privileged-intent prerequisite.                                             | Bot build; live Discord delivery not verified (see limits).                                              |
| R018    | Search recursively for published source maps in the CI guard.                                                                          | Workflow source checked.                                                                                 |
| R019    | Remove whole-source-file CodeQL exclusions; retain narrow query filters.                                                               | CodeQL configuration checked; hosted scan not run locally.                                               |
| R020    | Include voice configuration and signature suites in the npm test command.                                                              | Voice architecture and both suites passed.                                                               |
| R021    | Enforce bounded HLS input downloads and clean partial files after failures.                                                            | Bounded download regression and media build passed.                                                      |
| R022    | Track activity socket membership and remove it once on leave/disconnect.                                                               | Activity socket tests and typecheck passed.                                                              |
| R023    | Keep Wordline progression when applying room settings.                                                                                 | Game rules regression passed.                                                                            |
| R024    | Award the opponent victory when a wrong-color guess reveals its final word.                                                            | Game rules regression passed.                                                                            |
| R025    | Emit one finishing Skriggles chat entry rather than duplicating it.                                                                    | Game rules regression passed.                                                                            |
| R026    | Prune departed roster state and resolve departed drawer/role transitions.                                                              | Game rules regression passed.                                                                            |
| R027    | Allow only supported finite primitive Skriggles settings.                                                                              | Game rules regression passed.                                                                            |
| R028    | Discard stale marketing status responses with a request generation.                                                                    | Marketing build passed; generation flow inspected.                                                       |
| R029    | Use truthful browser/client labels and supported download routes.                                                                      | Marketing build passed; routes checked.                                                                  |
| R030    | Calculate poll scores server-side using shared canonical question weights.                                                             | Shared scoring regressions and marketing build passed.                                                   |
| R031    | Skip balanced Swift interpolations while still detecting surrounding raw copy; localize exposed text.                                  | Eight maintainability tests and Apple copy gate passed.                                                  |
| R032    | Classify attachment fallback media using the URL pathname.                                                                             | Apple rendering regression and full suite passed.                                                        |
| R033    | Remove the account APNs token before logout; securely retain failed removals for original-account retries.                             | Postgres owner-isolation logout integration passed; Apple suite passed.                                  |
| R034    | Remove the unsupported Google quick-auth control.                                                                                      | Apple build and suite passed.                                                                            |
| R035    | Check call identity/cancellation through preparation and join; await teardown before a replacement call.                               | Uncancellable preparation regression and Apple suite passed.                                             |
| R036    | Back off failed proactive token refresh attempts.                                                                                      | Apple suite passed; retry interval inspected.                                                            |
| R037    | Persist hidden DMs separately for each signed-in account.                                                                              | Account-switch and persistence regressions passed.                                                       |
| R038    | Apply presence enrichment to the current home snapshot with generation guards.                                                         | Apple suite passed; stale snapshot path inspected.                                                       |
| R039    | Bind search pagination responses and errors to the original query generation.                                                          | Controlled stale-pagination regression passed.                                                           |
| R040    | Key thumbnail work by image data and guard canceled results.                                                                           | Apple suite passed.                                                                                      |
| R041    | Recognize the HEIC extension for native image attachments.                                                                             | Apple rendering regression passed.                                                                       |
| R042    | Release failed thumbnail requests and expose a retryable error state.                                                                  | Apple suite passed; retry ownership inspected.                                                           |
| R043    | Key GIF work by tab and query and reject canceled results.                                                                             | Apple suite passed.                                                                                      |
| R044    | Mark the photo library loaded only after success and provide retry.                                                                    | Apple suite passed.                                                                                      |
| R045    | Import only remaining attachment capacity and report overflow.                                                                         | Apple suite passed.                                                                                      |
| R046    | Reserve pending photo selections by UUID and reject stale completions.                                                                 | Composer capacity and selection regressions passed.                                                      |
| R047    | Restore captured text/poll/reply after failed sends only if the draft remains unchanged.                                               | Apple suite passed; draft revision guard inspected.                                                      |
| R048    | Guard people-search responses with generation and cancellation checks.                                                                 | Apple suite passed.                                                                                      |
| R049    | Open document attachments through authenticated media resolution and surface errors.                                                   | Apple build and suite passed.                                                                            |
| R050    | Retain the oldest fetched pagination prefix and preserve optimistic messages separately.                                               | Timeline pagination regression passed.                                                                   |
| R051    | Use the latest sent server message as catch-up cursor; fetch latest when none exists.                                                  | Timeline cursor regression passed.                                                                       |
| R052    | Reconcile exactly one uploading match; process send ACKs by exact client ID.                                                           | Duplicate-text optimistic message regression passed.                                                     |
| R053    | Preserve friendship state after fetch failures and disable actions until a valid snapshot.                                             | Apple suite passed.                                                                                      |
| R054    | Serialize captured presence updates so stale writes cannot win.                                                                        | Apple suite passed; serialized task chain inspected.                                                     |
| R055    | Bind profile-photo work to selection identity and cancel discarded selections.                                                         | Apple suite passed.                                                                                      |
| R056    | Scope sound preferences to server/account and guard asynchronous cache updates.                                                        | Apple suite passed.                                                                                      |
| R057    | Mark notification preferences loaded only after success and block premature saves.                                                     | Apple suite passed.                                                                                      |
| R058    | Accept Spanish when loading and saving native language preferences.                                                                    | Apple suite passed.                                                                                      |
| R059    | Edit account field sheets in local drafts and commit only on Save.                                                                     | Apple suite passed.                                                                                      |
| R060    | Correct the account identifier prompt to User ID and localize it.                                                                      | Apple localization gate and suite passed.                                                                |
| R061    | Retain pending notification saves on exit and bind cache updates to their original account.                                            | Apple suite passed.                                                                                      |
| R062    | Reset custom emoji state on account change and replace successful catalog snapshots.                                                   | Apple suite passed.                                                                                      |
| R063    | Scope video posters by server/account, clear caches on transitions and reject stale insertions.                                        | Apple suite passed.                                                                                      |
| R064    | Skip escaped/code math delimiters and continue searching for valid pairs.                                                              | Markdown rendering regressions passed.                                                                   |
| R065    | Require matching fenced-code delimiters with at least three characters.                                                                | Markdown rendering regressions passed.                                                                   |
| R066    | Carry exact UTF-16 mention spans through block/segment parsing with position markers.                                                  | Repeated-label, Unicode and later-paragraph regressions passed.                                          |
| R067    | Wrap mixed text and custom emoji using a shared flow layout with explicit line breaks.                                                 | Apple build and suite passed; flow sizing inspected.                                                     |
| R068    | Update existing Keychain items atomically; add only when missing.                                                                      | Apple suite passed; SecItemUpdate path inspected.                                                        |
| R069    | Chunk native presence requests at the server limit of 200.                                                                             | Apple suite passed; chunk/merge path inspected.                                                          |
| R070    | Give socket connections generations and constrain cancellation cleanup to its owner.                                                   | Apple networking suite passed.                                                                           |
| R071    | Await the inbox response task instead of sleeping for 50 ms.                                                                           | Inbox regression and full suite passed.                                                                  |
| R072    | Serialize all network suites sharing the global URLProtocol stub under one parent suite.                                               | Full Apple suite passed.                                                                                 |
| R073    | Enforce Vue color rules, migrate colors into theme tokens and extract oversized component styles.                                      | Stylelint, web build, placement and size gates passed.                                                   |
| R074    | Bound console request/field sizes and restrict the endpoint to matching local clients.                                                 | Actual HTTP bounds/origin regression passed.                                                             |
| R075    | Seed two joined servers and require the rail root and expected visible icons.                                                          | Actual Playwright rail callback passed; Cypress fixture/assertions inspected.                            |
| R076    | Read and assert the UI message's persisted contentJson in both harness and default modes.                                              | Harness and default browser upload/render/persistence passed.                                            |
| R077    | Send real wheel input; retain direct scrollTop changes only for scrollbar mode.                                                        | Browser wheel run executed; geometry assertions still report overlaps (see limits).                      |
| R078    | Point REST proxies and browser sockets at each isolated harness; own spawned processes directly.                                       | Image-slot wrapper API/UI/persistence passed; scroll wrapper reached its seeded channel.                 |
| R079    | Require configured NATS transport before serving; propagate connection failures to startup so the supervisor can retry.                | Real unavailable-NATS rejection and healthy two-node delivery regressions passed.                        |
| R080    | Remove category-name-based recategorization; preserve user layouts and leave legacy defaults in the provenance-aware column migration. | Fresh/repeated Postgres schema initialization and existing mirror repair integration passed.             |
| R081    | Remove recurring username-based badge grants; document grants/revocations keyed by verified immutable IDs.                             | Postgres regression covered all six legacy handles, repeated startup and retention of an explicit award. |
| R082    | Remove every ASCII control character using a global regex.                                                                             | Repeated NUL/control-character regressions passed for status, bio and display names.                     |

### Continued-review remediation verification

R079–R082: backend TypeScript build, source-size ratchet, new-code charter and placement gates passed. Tests ran against isolated PostgreSQL and NATS containers; both containers were removed afterwards. Profile sanitization and existing voice mirror repair tests passed. Healthy NATS delivery was verified across two Socket.IO nodes after the unavailable-transport case.

Existing deployment badge data was not inspected or altered: no deployment database was used. Operators must verify previously issued awards against trusted immutable account IDs using [account badge administration](../operations/account-badge-administration.md). The new schema path preserves existing awards and stops the unsafe grants. Historical category placement also cannot be reconstructed from category names; the fix prevents further startup moves and preserves the current layout.

### Additional corrections required by browser verification

- Give Fastify gateway upgrades and Socket.IO upgrades separate ownership. The previous handlers both processed `/socket.io/`, causing invalid frames; a real-socket integration now verifies both gateway echo and chat connections.
- Wire `fillImageSlot` through controller exposure, chat provider, injection keys and message surface assembly. The browser previously reached a callable wrapper with an undefined action.
- Preserve local upload read URLs when media CDN signing is unavailable, including batch resolution. The previous fallback changed local files into nonexistent S3 reads; the targeted media regression passes.
- Use a fresh PNG fixture and await the filled element instead of a fixed delay. Fresh browser contexts no longer clear storage on every navigation.

### Verification summary and limits

- Web: final full Vitest suite passed: **632 files, 2,912 tests**; one file and two tests remain skipped by existing suite configuration. Targeted wiring regressions (20 tests) and media regressions (6 tests) passed after those corrections.
- Apple: **174 tests in 37 suites passed**; the unsigned iOS simulator build also passed for arm64 and x86_64. Tests include timeline identity/pagination, search, composer, call cancellation and rendering cases. Apple maintainability/copy gate and its eight regression tests passed.
- Backend, bot, media and marketing builds passed; activities tests/typecheck and voice architecture/configuration/signature tests passed. Contract, export, role, policy and bounded-download regressions passed. Owner-filtered APNs logout passed against isolated Postgres.
- Browser: seeded rail smoke callback passed. Isolated image-slot wrapper passed upload, filled rendering and persisted `contentJson`; default browser run also passed upload, rendering and persisted `contentJson`.
- Structural gates passed: source size, new-code charter, placement, feature boundaries, channel/message rules, RBAC, SQL columns and Apple architecture. Stylelint and document links passed.
- `test:ci:guards` stops at the dependency audit: **52 advisories at or above high severity** in the current dependency tree. No allowlist entry or bypass was introduced. These are outside R001–R078 and remain a repository CI limitation.
- The scroll wrapper reaches its own seeded backend and sends real wheel input. The geometry verifier reports **nine overlaps** in both initial and settled snapshots; scroll metrics report zero overlaps/overflow/blank viewport samples. Its `[data-index]` selector measures natural inner content rather than the clipped outer virtual slots. The geometry assertions were not weakened; this run is recorded as failing, so it does not establish complete layout correctness.
- Live Discord presence delivery was not tested because no local bot token is configured. The application must enable the privileged Guild Presences intent. Hosted CodeQL execution, APNs delivery on a real device and native visual interaction were not run locally.

## Findings

### R001 · High · Recovery watchdog never starts after a Discord uptime failure

- **Location:** `bot/src/recoveryWatchdog.ts:40`
- **Evidence:** `triggerRecoveryWatchdog` looks for `<repo>/scripts/echo-recovery-watchdog.mjs`, but the tracked script is `server/ops/scripts/echo-recovery-watchdog.mjs`. The existence check at line 41 therefore returns early in the normal repository layout. `bot/src/uptimeMonitor.ts:355,366` calls this function when uptime flips down, so the configured recovery action is silently reduced to a warning.
- **Action:** Resolve the script under `server/ops/scripts/`, and align the CLI help in `bot/src/index.ts:233` with the real location.

### R002 · High · Presence polling permanently stops after a shard disconnect

- **Location:** `bot/src/presenceRelay.ts:218-224`
- **Evidence:** The `shardDisconnect` handler clears both the presence and watchlist intervals. `startDiscordPresenceRelay` creates those intervals only once; it has no `shardResume` or `shardReady` path to restart them. A transient Discord disconnect therefore leaves snapshot polling disabled for the remaining bot process lifetime, even after the shard reconnects.
- **Action:** Restart polling when the shard resumes, or retain the timers and skip work while the client is disconnected. Handle multi-shard clients without stopping all guilds on one shard's disconnect.

### R003 · Medium · Failed voice snapshots lose the last user leaves transition

- **Location:** `bot/src/voiceMirrorRelay.ts:104-110`
- **Evidence:** `prevVoiceChannelIdsByGuild` is advanced before the POST, while `postEchoWebhookJson` returns `null` or a non-OK response on delivery failure without throwing. If the last user leaves a channel and its empty snapshot fails, the relay forgets that channel. A later voice event omits the empty channel, leaving stale occupancy in Echo until a separate reconciliation happens.
- **Action:** Advance the previous-channel set only after a successful response, and retry failed snapshots or run periodic reconciliation.

### R004 · High · Pending export poll can overwrite an active export

- **Location:** `bot/src/index.ts:300-312`
- **Evidence:** The `setInterval` callback starts `processPendingExportsVisibleGuilds` with `void`, so a run longer than the poll interval can overlap the next run. Both runs can select the same pending guild and write to the same directory. `runFullExport` truncates `members.jsonl` and other JSONL files at startup (`bot/src/exporter/runFullExport.ts:51-55`), so the second run can erase or interleave the first run's data. The `GuildCreate` and bootstrap paths can also start concurrent exports for the same guild.
- **Action:** Serialize export work per guild across all entry points, or guard the pending poll with an in-flight run and queue guilds that arrive during it.

### R005 · Medium · One outage starts a watchdog for every subscribed channel

- **Location:** `bot/src/uptimeMonitor.ts:352-356`
- **Evidence:** `deliverUptimeUpdate` owns a health transition per channel subscription. The scheduled loop at lines 487-504 calls it once for every subscribed channel; each healthy-to-unhealthy transition calls `triggerRecoveryWatchdog`. With several channels subscribed, one endpoint outage can start several detached recovery scripts at once. The watchdog function has no in-flight or cooldown guard. This becomes observable once R001's script path is corrected.
- **Action:** Track the endpoint health transition once per bot process and trigger recovery once, independent of how many channels receive the status embed.

### R006 · High · Presence relay starts without the Discord presence intent

- **Location:** `bot/src/index.ts:258-265`
- **Evidence:** The serve-mode Discord client omits `GatewayIntentBits.GuildPresences`. The presence relay subscribes to `presenceUpdate` (`bot/src/presenceRelay.ts:197`) and asks for members with presences (`:116`), but its gateway connection does not request presence events. As a result, event-driven snapshots cannot work and cached member presence can be absent or stale.
- **Action:** Request the privileged Guild Presences intent in the client configuration and enable it for the Discord application, then verify the relay receives a presence update.

### R007 · High · Message jump preview can expose a private message to another channel

- **Location:** `server/backend/src/sockets/echoLinkEmbeds.ts:52-61` and `server/backend/src/domain/echoMessageLinkEmbed.ts:55-85`
- **Evidence:** The jump resolver checks access for the **author of the link message** and then embeds the target message's content, author, and timestamp. `resolveAndBroadcastLinkEmbeds` stores that embed on the link message and broadcasts it to every viewer of the destination channel. A user who can read a private channel can post its message link in a less restricted channel, where recipients who cannot read the source channel receive its preview. `contracts/echoMessageJumpPath.ts` also accepts any HTTP(S) host with the matching path shape, so an external URL can trigger the same lookup.
- **Action:** Do not persist source-message content in a destination channel unless every viewer has source access. Render private jump previews per viewer after authorization, or show only a neutral link card in shared messages. Restrict recognized jump URLs to Echo origins.

### R008 · Medium · Removing a reaction can erase other users' reaction count in the client

- **Location:** `clients/web/src/features/layout/composables/messaging/useMessageReactions.ts:45-55`
- **Evidence:** The socket fan-out intentionally strips other users' IDs (`contracts/messageReactionsWire.ts:14-23`), and the merge keeps only the viewer's ID (`:29-45`). If the resulting local reaction has `count: 3, userIds: ['me']`, the viewer's next unreact removes `me` and drops the whole reaction row because `nextUserIds.length` is zero. Two other users' reactions disappear until a server snapshot arrives. A delayed or lost snapshot leaves the count wrong longer.
- **Action:** When optimistically removing the viewer's reaction, decrement the authoritative count independently of `userIds`; retain the row while the new count is positive.

### R009 · Low · Relative signed media URLs return a storage key containing the token query

- **Location:** `contracts/mediaCdn.ts:80-82` and `contracts/echoUploadStorageKey.ts:179-187`
- **Evidence:** Both relative-path branches pass the full string after the path prefix to `decodeStorageKeyPath`. For `/v1/o/echo/channels/c1/file.png?t=token`, the returned key is `echo/channels/c1/file.png?t=token`; the absolute-URL branch correctly uses `URL.pathname`. Relative local-upload and S3 read-through URLs have the same behavior. Storage-key lookup and authorization can therefore fail for valid relative URLs carrying a query string.
- **Action:** Parse relative URLs with a base URL or remove search/hash before decoding the path.

### R010 · Medium · Rich block token formatting does not round-trip quoted labels

- **Location:** `contracts/richBlockToken.ts:30-36,59-65,92-95`
- **Evidence:** The formatter emits `![type]` when attributes are empty, but the parser requires `![type: ...]`. It also leaves `]` unchanged in quoted values while both token matchers stop at the first `]`. A button label containing `]` therefore produces a token the parser cannot read. The attribute parser toggles quote state on escaped quotes; a value containing a quote followed by a comma is split at that comma even though the comma remains inside the quoted value. Existing tests cover spaces and simple attributes, but not these formatted values.
- **Action:** Make the formatter and parser share an escape-aware grammar, and test round-trips for brackets, escaped quotes, backslashes, and commas.

### R011 · Medium · Multi-button composer shortcuts lose labels and URLs containing separators

- **Location:** `contracts/buttonRow.ts:104-116,189-199`
- **Evidence:** The formatter joins each button as `label|style|target` and joins buttons with `;`, without escaping either separator. The parser splits on both characters. A label such as `A|B` or `Save; close`, or a URL containing `;`, therefore parses into different fields or buttons when the composer is reopened or sent. The outer rich-block quoting only protects commas and spaces; it does not protect these inner delimiters.
- **Action:** Encode the inner button specification or store a structured representation for composer shortcuts, then add round-trip tests for separator characters.

### R012 · Medium · Filling one image slot also fills every duplicate slot ID

- **Location:** `contracts/imageSlotContentJson.ts:149-168`
- **Evidence:** `patchImageSlotFill` checks only the first slot with the requested ID, then maps over the whole document and replaces **every** image slot with that ID. The server's content JSON validator checks each slot's attributes but does not enforce ID uniqueness. A message with two empty slots sharing an ID therefore fills both from one `fillImageSlot` request, while the API reports one successful fill.
- **Action:** Enforce unique slot IDs when accepting message content, or patch exactly one matching slot and reject ambiguous documents.

### R013 · Medium · Rebuilding mixed image tokens can reuse the wrong slot ID

- **Location:** `contracts/richBlockContentJson.ts:116-159`
- **Evidence:** The rebuild index advances only for composer shortcuts (`![image: ratio=…]`), not for canonical image tokens (`![image: ratio=…, slotId=…]`). If the first original slot is represented by a canonical token and a later slot by a shortcut, the shortcut reuses the first original slot's ID and filled image. The rebuilt document can contain duplicate IDs and lose the later slot's image. This function is used by the client composer and message edit flow.
- **Action:** Track consumed original slots for both token forms, matching canonical IDs first and assigning each shortcut a distinct remaining slot.

### R014 · Medium · User mentions with a different ID can ping viewers who share the label

- **Location:** `contracts/attentionPing.ts:55-76,120-140`
- **Evidence:** Both mention classifiers try `userId` and entity `id`, but still fall back to matching `mention.label` against the viewer's username or display name when an explicit ID points elsewhere. Two members with the same display name can therefore both receive a personal ping from a mention intended for only one. The label fallback is appropriate only for legacy mentions without a usable target ID.
- **Action:** Use label matching only when both target ID fields are absent; if either ID is present, its mismatch should end the user-mention check.

### R015 · High · Instance policy accepts wrong JSON types for security switches and limits

- **Location:** `contracts/instancePolicy.ts:315-341` and `server/backend/src/config/instancePolicy/loadInstancePolicy.ts:60-80`
- **Evidence:** The file JSON is merged into defaults and cast to `InstancePolicy` without schema validation. The custom validator checks some ranges, but not that fields such as `guest.enabled` and `registration.disabled` are booleans or that every numeric limit is actually a number. A JSON value like `"false"` is truthy when `server/backend/src/config.ts:1388-1389` copies these switches, so an operator can accidentally enable guest accounts or disable registration. The checked-in JSON schema is not referenced by the loader.
- **Action:** Validate the parsed file and merged policy against a complete runtime schema before use; reject unknown keys and wrong types with field-specific errors.

### R016 · High · Saving a role can grant companion permissions the role never had

- **Location:** `contracts/rolePermissionBridge.ts:52-55,118-128,161-171`
- **Evidence:** The UI collapses `MUTE_MEMBERS` and `DEAFEN_MEMBERS` into one `muteDeafenMembers` boolean using OR. Saving the role maps that true value back to **both** permissions, replacing the stored managed bits. A role that previously had only MUTE therefore gains DEAFEN when any role edit is saved. `USE_EXTERNAL_EMOJIS` and `USE_EXTERNAL_STICKERS` have the same issue through `addExpressions`. This merge function is used by the web role persistence path.
- **Action:** Represent the paired permissions separately in the editor, or preserve each stored bit unless the user explicitly changes that pair.

### R017 · Medium · PM2 bot misses root environment values when `env_file` is ignored

- **Location:** `ecosystem.config.cjs:163-171`
- **Evidence:** This configuration parses the root `.env` into `fileEnv` because `env_file` is unreliable on some PM2 builds (lines 5-27). The backend, media worker, media server, and activities app spread `fileEnv` into their `env`, but `echo-discord-bot` sets only `NODE_ENV` and relies solely on `env_file`. On affected PM2 builds, the bot starts without `DISCORD_BOT_TOKEN`; `bot/src/config.ts:27` reads that variable and `bot/src/index.ts:387` exits when it is missing. The webhook URL and secret also remain unset.
- **Action:** Spread `fileEnv` into the bot's `env` object, as for the other server apps, and check that a clean PM2 process receives its required variables.

### R018 · Low · Source-map CI guard misses nested output

- **Location:** `.github/workflows/echo-web-ci.yml:82-88`
- **Evidence:** Bash does not enable `globstar` here, so `clients/web/dist/**/*.map` matches only one directory level beneath `dist` and misses `.map` files directly in `dist` or nested two or more levels down. The workflow can pass despite shipping a source map.
- **Action:** Use `find clients/web/dist -type f -name '*.map' -print -quit` and fail when it returns a path, or enable and verify recursive globbing explicitly.

### R019 · Medium · CodeQL skips the entire link unfurl fetch module

- **Location:** `.github/codeql/codeql-config.yml:26-28,38-45`
- **Evidence:** The `query-filters` entry already excludes the expected `js/request-forgery` finding at `linkUnfurlFetch.ts`, but `paths-ignore` also excludes that whole file from extraction. New problems of any query class in the outbound fetch implementation will be invisible to CodeQL, despite this being the network boundary for user-supplied URLs. The same broad exclusion applies to two browser helpers after their specific XSS findings are filtered.
- **Action:** Remove those whole-file `paths-ignore` entries and retain narrowly scoped query filters for the reviewed false positives.

### R020 · Low · Voice test command never runs its unit tests

- **Location:** `server/voice/package.json:8` and `server/voice/src/tests/run.ts:24-53`
- **Evidence:** `npm test -w voice` executes only `src/tests/run.ts`. That script scans source text for a forbidden SDK import and exits; it never imports or spawns `config.test.ts` or `verifyEchoForwardSignature.test.ts`. The workspace CI invokes this test command, so both unit test files are silently skipped.
- **Action:** Make the test runner execute all intended test files, or switch the package script to a test command that discovers them while retaining the architecture check.

### R021 · Medium · HLS input size limit runs after the full download

- **Location:** `server/media/src/hls/processor.ts:397-419`
- **Evidence:** The worker reads `liveMeta` (including object size) before download, but does not compare `liveMeta.size` with `echoVideoHlsMaxInputBytes`. It downloads or copies the entire object to the worker's temporary disk and only then checks `inStat.size`. `server/backend/src/api/routes/echo/uploads.ts:1244-1262` and `:1887-1900` enqueue using available source size without enforcing the HLS cap. A source larger than the configured limit can therefore consume temporary disk space and transfer bandwidth before it is rejected.
- **Action:** Reject oversized `liveMeta.size` before `downloadEchoUploadObjectToFile`, and enforce a byte limit during streaming in case metadata is stale or absent.

### R022 · Medium · Leaving one game socket can evict another tab on disconnect

- **Location:** `server/activities/src/realtime/socket.ts:158-167`
- **Evidence:** `game:leave` calls `membership.remove` for that socket, but leaves its connection active and does not record that its membership was already removed. The later `disconnect` handler calls `membership.remove` again. With two tabs in the same room, one tab's leave drops the reference count from two to one; its disconnect drops it from one to zero and calls `manager.leave`, evicting the user while the second tab is still connected. The first socket also remains joined to Socket.IO room channels after `game:leave`.
- **Action:** Track join state per socket and remove it at most once; leave the room and user channels on `game:leave`.

### R023 · Low · Server Wordline level mode restarts at level one

- **Location:** `server/activities/src/games/wordline/index.ts:101-106,127-129`
- **Evidence:** A win increments `nextPuzzle.level` but leaves the puzzle in the terminal `won` state. The client's “Next level” action calls `setWordlineMode('levels')` (`clients/web/src/features/voice/wordline/useWordlineServerGame.ts:79-82`), whose server handler calls `freshPuzzle`; that function always initializes `level` to zero. The player therefore cannot advance beyond the first level through the server game path. `WORDLE_SERVER_MODE` is currently false, so this defect is latent until that path is enabled.
- **Action:** Carry the level into a fresh puzzle on the next-level action; keep mode switching and retry behavior distinct.

### R024 · Medium · Revealing the opponent's final Codenames card does not end the game

- **Location:** `server/activities/cores/games/codenames/reducer.ts:138-141`
- **Evidence:** A wrong-color reveal switches the turn immediately. This branch never checks whether the revealed card was the opponent's last unrevealed team card. Only the current team's own-card branch counts remaining cells, so completing the opponent's set by mistake leaves the match in `playing` instead of declaring that team the winner.
- **Action:** After any team-colored reveal, check whether that affiliation has zero unrevealed cards and finish with that team as winner before changing turns.

### R025 · Low · Final correct Skriggles guess appears twice in chat

- **Location:** `server/activities/cores/games/skriggles/guessing.ts:152-155,133-142`
- **Evidence:** `applyGuessToActivity` first calls `mergeGuessChat`, which appends the correct guess. When that guess completes the round, `endRoundOnCorrectGuess` receives the already updated state and appends the same `outcome.chatEntry` again. The round reveal snapshot therefore contains a duplicate final guess.
- **Action:** Append the entry once, either before the branch or inside the finishing function, and preserve the resulting chat log.

### R026 · Medium · Codenames and Skriggles retain departed players in their rosters

- **Location:** `server/activities/src/games/codenames/index.ts:33-39,88-110` and `server/activities/src/games/skriggles/index.ts:33-43,89-98`
- **Evidence:** Both `syncRoster` implementations call `mergeHangmanRoster` (through a re-export), which unions the stored roster with the current room roster. Their `onLeave` paths pass a filtered roster into that union. When at least one member remains, the departed user is reintroduced from the old roster. Codenames keeps stale role assignments and can wait for a departed player's turn; Skriggles can keep selecting a departed drawer and count that user when deciding whether everyone has guessed.
- **Action:** Reconcile to the current room membership on leave and handle role/drawer reassignment or a paused round explicitly.

### R027 · Medium · Malformed Skriggles settings can stop timed rounds

- **Location:** `server/activities/cores/games/skriggles/rounds.ts:140-165` and `server/activities/src/games/skriggles/index.ts:112-117`
- **Evidence:** The server passes the socket payload's `settings` directly to `applySettingsChange`. The function spreads arbitrary fields into state, and `clamp` uses `Math.floor` without checking that numeric settings are finite numbers. For example, a JSON payload with `drawTimeSec: "invalid"` stores `NaN`; `applyWordChoice` then computes `phaseEndsAt = now + NaN`. `expirePhaseIfNeeded` returns early for that falsy value, so the drawing phase never expires automatically.
- **Action:** Validate an allowlist of setting fields and finite numeric values before updating state; reject invalid payloads.

### R028 · Low · An older status probe can overwrite a newer result

- **Location:** `marketing/src/lib/statusMonitor.ts:279-314`
- **Evidence:** Timer, refresh button, and visibility handlers can start `refresh` concurrently. Each request calls `applyProbeResult` when it finishes, with no sequence check or cancellation. If the earlier request is slower than a later manual refresh, its stale health result becomes the displayed current status and is appended after the newer sample.
- **Action:** Serialize probes or use a monotonically increasing request ID so only the latest result updates the page; count samples in actual probe order if overlap is retained.

### R029 · Medium · Desktop download buttons open the web app

- **Location:** `marketing/src/pages/download.astro:20-45,101-103` and `marketing/src/pages/index.astro:74-88,176-190`
- **Evidence:** The Windows, macOS, and Linux cards all set their `action.href` to `CHAT_APP_ORIGIN`, exactly like the Web Browser card. The homepage's “Download Echo” buttons also share the “Open in Browser” URL. The CTA labels promise downloads, but each link navigates to the app homepage without selecting or fetching a platform installer.
- **Action:** Point each desktop card at its current installer or a platform-specific download route, or label the action as opening the web app until packages are available.

### R030 · High · Poll leaderboard accepts scores unrelated to submitted answers

- **Location:** `server/backend/src/api/routes/echo/public.ts:440-473`
- **Evidence:** The public POST validates that `score` is an integer from 0 to 100 and that `answers` contains 50 option indices, but never calculates the score from those answers or checks the submitted category scores against them. `submitMarketingPollEntry` stores all three client-provided values unchanged (`server/backend/src/domain/echoStore/marketingPoll.ts:122-165`). A caller can submit `score: 100` with any valid answer array and take the top leaderboard position, or forge topic scores used by the comparison view. The browser normally calculates the values, but the endpoint does not require that browser.
- **Action:** Keep the question weights on the server, calculate the overall and category scores from validated answers, and ignore or reject mismatched client scores.

### R031 · Low · Apple raw-copy gate misses text after a leading interpolation

- **Location:** `clients/apple/scripts/check-maintainability.mjs:65-74`
- **Evidence:** `countRawUiCopy` skips every literal whose body starts with `\\(` or `@\\(`, although its comment intends to skip only pure interpolation. For example, `Text("\\(name) welcomes you")` and `Text("@\\(name), welcome")` both return zero raw-copy matches, while `Text("Welcome, \\(name)")` returns one. English UI copy can therefore bypass the localization gate simply by starting the string with an interpolated value.
- **Action:** Parse or strip interpolations and check whether any literal text remains; add cases for text before and after interpolation.

### R032 · Low · Apple audio attachment fallback misses signed URLs

- **Location:** `clients/apple/Modules/EchoDomain/Sources/EchoDirectMessage.swift:248-265`
- **Evidence:** `isImage` and `isVideo` accept an extension followed by `?`, but `isAudio` only checks whether the full filename or URL ends in `.mp3`, `.m4a`, and similar extensions. A legacy attachment without a useful `kind` or MIME type whose URL is `.../clip.m4a?t=token` is therefore classified as a document rather than audio, so the native audio player path is skipped. The default decoded kind is `document` when the field is absent (line 274).
- **Action:** Parse the URL path before checking file extensions, and use the same fallback for image, video, audio, and document classification.

### R033 · Medium · Failed APNs unregister is forgotten at sign-out

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Authentication/EchoPushRegistration.swift:92-103`
- **Evidence:** `stop()` ignores an `unregisterPushToken` failure and always deletes the only locally stored APNs token. `EchoRootView.swift:58-61` calls this on sign-out. If the device is offline or the request fails, the server row remains associated with the old user (`server/backend/src/domain/iosDeviceTokenRepo.ts:63-80`), but the client has no token to retry removing it. That signed-out device can continue receiving the old account's push notifications until a new successful registration reassigns the token.
- **Action:** Keep a pending unregister record and retry it when connectivity returns, or make the server revoke the user's device token as part of the authenticated logout path.

### R034 · Low · Google sign-in button always leads to an unsupported-flow error

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Authentication/EchoAuthenticationView.swift:151-154`
- **Evidence:** The authentication screen presents a clickable Google quick-auth button. Its action calls `model.continueWith(.google)`, but `EchoAuthenticationModel.swift:288-294` immediately rejects every provider except Apple with a message saying the native browser handoff is still needed. A user can never sign in through the offered Google action.
- **Action:** Hide or disable the Google button until the native handoff works, or implement the handoff and callback flow.

### R035 · High · Ending a call during MLS preparation can connect it afterward

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Calling/EchoCallModel.swift:370-406,442-465`
- **Evidence:** `connect()` checks cancellation only before `e2ee.prepareDM`. The production preparer awaits `EchoMlsJsRuntime.prepareDM`, which uses a plain checked continuation without a cancellation handler (`EchoMlsJsRuntime.swift:19-75`), so cancelling `connectTask` does not stop that await. `finish()` cancels the task, disconnects transport, and stops MLS, but when the pending preparation later resolves, `connect()` can still mint a session and join LiveKit while the model is idle. That can leave a hidden call connected after the user hung up.
- **Action:** Check cancellation and call identity after each await, make the MLS bridge cancellation aware, and serialize finish/connect so teardown runs after any in-flight join.

### R036 · Medium · Proactive token refresh retries immediately after failure

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/EchoRootView.swift:159-172`
- **Evidence:** Once `refreshAt` is in the past, `delay` is zero. A transient failure in `ensureAccessToken(forceRefresh: true)` is discarded with `try?`, leaving the old session and refresh token in place. The `while` loop then computes another zero delay and repeats immediately. During an outage this can continually send refresh requests or spin on fast local failures until the session is cleared.
- **Action:** Add a bounded retry delay or exponential backoff after refresh failure, and stop retrying when the task is cancelled or the session changes.

### R037 · Medium · Hidden DM state carries across accounts on one Apple device

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/EchoHiddenDmInboxStore.swift:8-28,42-65`
- **Evidence:** The singleton persists hidden peer IDs and group channel IDs under the fixed `echo_hidden_dm_inbox_v1` UserDefaults key. The key and stored payload contain no viewer account ID, and sign-out does not clear or switch the store. If a different account on the same device has a DM with the same peer (or belongs to the same group channel), `visibleConversations` applies the prior account's hide and removes that thread from the new account's inbox until newer activity arrives.
- **Action:** Scope the persisted hide map by authenticated user ID and reload it when the active account changes.

### R038 · Medium · Presence refresh can overwrite newer inbox activity

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/EchoHomeModel.swift:151-168`
- **Evidence:** `refreshPeerPresence` captures `snapshot` before awaiting `loadPresenceMap`, then applies presence to that old value and assigns it to `self.snapshot`. A realtime message received during the request updates `self.snapshot` through `applyActivity` (lines 175-201), but the eventual presence response replaces it with the older snapshot, reverting its last-message preview and timestamp. The `lightRefreshGeneration` check occurs after the helper has already mutated state (lines 77-90), so it does not prevent stale writes.
- **Action:** Apply returned presence to the latest `self.snapshot` after the await, and guard each write with the current refresh generation or account identity.

### R039 · Medium · Old search page can append into a new filtered result set

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/EchoMessageSearchModel.swift:104-128`
- **Evidence:** `search()` increments `searchGeneration` and clears results for a new query, but `loadMore()` captures no generation or query snapshot. If pagination is in flight when the user changes the query or filters, the old page later appends its messages to the new result set and can overwrite `hasMoreBefore`. The first-page search has a generation guard (lines 95-100); pagination does not.
- **Action:** Capture the generation and criteria before loading more, then discard the response unless they still match the active search.

### R040 · Low · Same-size attachment replacement keeps stale thumbnail

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoComposerPendingPreview.swift:146-185`
- **Evidence:** `EchoComposerLocalThumb` reruns its decode task only when `data.count` changes. SwiftUI can reuse the view at the same position when one attachment is replaced by another of the same byte length; the image state then retains the previous attachment's thumbnail.
- **Action:** Key the task or thumbnail view by the attachment ID or content identity instead of byte count.

### R041 · Medium · HEIC photo data receives a JPEG filename

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoComposerPhotoLibrary.swift:100-118,203-208`
- **Evidence:** The Photos request returns original image data and its UTI. `mimeType(for:)` can return `image/heic`, but `extensionName` chooses `jpg` for every non-PNG type. The resulting uploaded asset has HEIC bytes and MIME type with a `.jpg` filename, which can mislead filename-based consumers and downloads.
- **Action:** Use a `.heic` extension for HEIC data, or transcode the bytes to JPEG before naming them `.jpg`.

### R042 · Low · Failed gallery thumbnail never retries

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoComposerPhotoLibrary.swift:180-200,340-355`
- **Evidence:** `requestThumbnail` inserts the asset ID into `requestedIDs` before Photos responds. Its callback writes a nil image on failure but never removes the ID. Later `ensureThumbnail` and prefetch calls skip the request, leaving the cell's `ProgressView` indefinitely until a list change prunes the ID.
- **Action:** Clear the requested ID on error or nil response, and show a failed or retryable state instead of a permanent spinner.

### R043 · Medium · GIF tab stays empty on first open

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoExpressionPicker.swift:203-208,255-257`
- **Evidence:** The GIF loading task uses `model.tab == .gifs ? model.query : ""` as its ID. The initial emoji tab has an empty query, and switching to GIFs resets the query to empty, so the ID remains `""` and SwiftUI does not restart the task. `gifContent` then shows “No GIFs found” without making a request until the user types a search.
- **Action:** Include the selected tab in the task ID so opening GIFs runs `loadGIFs()` even for an empty query.

### R044 · Low · Failed custom emoji library load cannot retry

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoExpressionPicker.swift:134-145,253`
- **Evidence:** `loadLibrary` sets `loadedLibrary = true` before the network request. On failure it only sets `errorMessage`, so later appearances or task restarts hit the guard and never retry loading custom emoji packs.
- **Action:** Mark the library loaded only after success, or reset the flag on failure and provide a retry path.

### R045 · Medium · File import can exceed the ten-attachment limit

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoMessageComposer.swift:252-270`
- **Evidence:** `importFiles` appends up to ten selected URLs without accounting for `state.assets` already present. For example, nine pending photos plus ten imported files leave nineteen attachments, despite the photo picker enforcing a limit of ten (lines 233-235).
- **Action:** Limit imports to the remaining capacity and report excess selections.

### R046 · Medium · Concurrent photo selections bypass the attachment limit

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoMessageComposer.swift:225-249`
- **Evidence:** `togglePhoto` checks `state.assets.count` before starting an asynchronous Photos request. Multiple taps can each pass while the count is below ten, then all append after awaiting `composerAsset`, exceeding the limit. Repeated taps on one photo before its first load completes can also append duplicates because the pending ID is not tracked.
- **Action:** Track pending photo IDs and reserve attachment slots before awaiting; recheck capacity and selection identity before appending.

### R047 · Medium · Failed message send discards the draft

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoMessageComposer.swift:295-315`
- **Evidence:** `send()` calls `state.reset()` and clears `replyTo` before awaiting `onSend`. If `onSend` throws, the catch only displays an error and never restores text, attachments, GIF, poll, or reply metadata. The user cannot retry the same submission from the composer.
- **Action:** Restore the captured submission on failure, unless a newer draft has been entered while the send was in flight.

### R048 · Medium · Older people search can overwrite newer results

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/EchoAddFriendView.swift:21-42,180-190`
- **Evidence:** The view cancels its prior `.task(id:)` when the query changes, but `EchoAddFriendModel.search` has no cancellation or query-generation check after awaiting `searchFriendCandidates`. If the network operation completes despite cancellation, its older response assigns `candidates` after the newer search, displaying results for the wrong query.
- **Action:** Capture a search generation or query and discard responses that no longer match the active search; keep loading state tied to that generation.

### R049 · Medium · Document attachments have no open action

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/EchoMessageRow.swift:326-347,390-408`
- **Evidence:** Non-image, non-video, non-audio attachments render through `attachmentFallback`, which is only a styled `HStack` showing the filename and MIME type. It has no `Button`, `Link`, or viewer action using `attachment.url`, so a received PDF or other document cannot be opened or downloaded from the native message row.
- **Action:** Make the fallback row open or download the attachment URL through the authenticated media path.

### R050 · High · Older pagination discards every page once the window is full

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/EchoMessageTimelineModel.swift:120-142`
- **Evidence:** `loadOlder` constructs `additions + messages`, then takes `suffix(maximumWindowSize)`. Once `messages` already contains 400 rows, `suffix(400)` removes all newly prepended older rows. It still returns `true` and can leave `hasMoreBefore` true, so top scrolling and `reveal` repeatedly request the same page without advancing the oldest visible message.
- **Action:** When prepending older history, trim from the newest end or use a window strategy that retains the fetched page and updates the cursor consistently.

### R051 · Medium · Catch-up can use an optimistic local ID as a server cursor

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/EchoMessageTimelineModel.swift:161-180,365-398`
- **Evidence:** `send` appends a `local-...` optimistic message to the end of `messages`. If reconnect or foreground catch-up runs during the upload, `catchUp` sets `after = messages.last?.id` and sends that local ID as the `after` query parameter through `EchoHomeClient.loadMessages`. The server has no such message cursor, so missed server messages are not reliably fetched.
- **Action:** Choose the newest sent server message ID for catch-up, excluding local optimistic entries.

### R052 · Medium · Reconciliation can remove an unrelated pending message

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Home/EchoMessageTimelineModel.swift:450-464`
- **Evidence:** `reconcileOptimistic` removes every unsent local message with the same author, text, and attachment count as an arriving sent message. Two deliberate identical sends can both be in flight; the first server response then removes both optimistic bubbles, including the second pending send. A matching failed bubble can also disappear even though it was a distinct attempt.
- **Action:** Reconcile with a request or client nonce carried through the server response, or constrain the match to one known pending send.

### R053 · Medium · Friendship lookup failure is treated as no relationship

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Profile/EchoFullProfileModel.swift:47-66,96-115`
- **Evidence:** Both `loadFriends` and `loadFriendRequests` use `try?`, and `applyFriendship` maps nil responses to `.none`. If either lookup fails while the profile request succeeds, the view enables an “Add friend” action (or another incorrect action) after loading. The same fallback runs after a successful friendship mutation, so a refresh failure can misrepresent the new state.
- **Action:** Preserve the previous relationship when lookup data is unavailable and surface a retryable error instead of interpreting failed requests as empty lists.

### R054 · Medium · Presence saves can finish out of order

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Profile/EchoProfileEditView.swift:339-355`
- **Evidence:** Each presence tap launches an independent `persistPresence` task, but the request reads the mutable `presenceStatus` when it runs and has no generation or serialization. Rapid selections can send concurrent updates that finish in a different order; an older response can set `originalPresenceStatus` after a newer selection, and an older failure can revert the UI to a value that is no longer current.
- **Action:** Capture the selected value for each request and serialize or generation-guard both server updates and response handling.

### R055 · Medium · Discarded photo selection can reappear after loading

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Profile/EchoProfileEditView.swift:147-152,384-394`
- **Evidence:** Selecting a banner or avatar launches a transfer task that later assigns `bannerData` or `avatarData`. `discardChanges` clears the picker item and data but does not cancel or identify that in-flight transfer. If it completes afterward, the discarded image is restored as a pending change and can be saved unintentionally.
- **Action:** Cancel the transfer or compare a selection generation before assigning loaded data.

### R056 · Low · Sound preferences from one account persist into another

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSoundPlayback.swift:5-20,23-31`
- **Evidence:** The sound gate stores notification preferences under one device-wide UserDefaults key without an account identifier. The key is refreshed from settings load/save, but ordinary playback reads the cached value directly. After changing accounts on the same device, the new account's sounds follow the previous account's enablement and volume until its notification settings are loaded.
- **Action:** Scope the cache to the authenticated account or clear and reload it on account changes.

### R057 · High · Notification load failure enables saving default preferences

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingDetailModel.swift:139-177,219-230`
- **Evidence:** `loadRemoteState` sets `notificationPreferencesLoaded = true` even when `loadNotificationPreferences` throws. The model then retains its default `EchoNotificationPreferences` and a nil `lastPersistedNotificationSettings`. A user changing one toggle triggers `saveNotifications`, which sends the entire default-filled preferences object and can overwrite unrelated server choices.
- **Action:** Set the loaded flag only after a successful fetch, and block saves until a valid server snapshot exists or merge a field-level update.

### R058 · Medium · Spanish language choice is silently ignored

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoLocaleOptions.swift:3-8` and `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingDetailModel.swift:192-206,248-250`
- **Evidence:** The language picker includes `es`, and the settings view calls `updateLocaleAndTimeZone` when it is selected. That method only accepts `en-US` and `en-GB`, so it returns without a request or error. Remote state loading also ignores `es`, leaving the displayed choice out of sync with the account setting.
- **Action:** Support `es` consistently in save and load validation, or remove it from the picker until it is supported.

### R059 · Medium · Canceling an account field edit retains the unsaved value

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingAccountSheets.swift:29-35,50-50,81-84` and `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingDetailView.swift:498-517`
- **Evidence:** Email, username, and phone editors bind their text fields directly to `model.accountState`. The Cancel button only dismisses the sheet. A canceled edit therefore remains visible in account settings; later saving a different identity field calls `saveIdentity`, which sends both the retained email and phone values and can submit the supposedly discarded edit.
- **Action:** Give each sheet a local draft and copy it to account state only on Save, or restore the original value on cancel.

### R060 · Medium · Manual user report advertises usernames but sends them as IDs

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoNativeSettingsPages.swift:195-197,238-252`
- **Evidence:** The field prompts for “@username or user ID,” but `submit()` passes the entered string directly as `targetUserID`. `EchoSettingsClient.reportUser` serializes it as `targetUserId`, and the backend `/reports/user` route looks up `auth_users.id = target` (`server/backend/src/api/routes/echo/safety.ts:138-163`). Entering an ordinary username therefore yields “User not found” instead of filing the report.
- **Action:** Resolve usernames to user IDs before submission, or change the field and help text to require a user ID.

### R061 · Medium · Leaving notification settings cancels the last change

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingDetailView.swift:454-460` and `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingDetailModel.swift:139-150,491-493`
- **Evidence:** Every notification or sound edit schedules a save after a 450 ms debounce. `onDisappear` calls `cancelPendingNotificationSave`, and the canceled task exits before its request. A user who toggles a setting and immediately taps Back sees the value change locally, but the update is never sent; reopening the page reloads the old server value.
- **Action:** Flush pending preferences on exit or retain the save task until it completes, with account identity checks.

### R062 · Medium · Custom emoji catalog retains prior account entries

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoCustomEmojiCatalog.swift:9-35,39-67`
- **Evidence:** `EchoCustomEmojiCatalog.shared` is process-wide. `ingest` starts from existing `byID` and `byName` dictionaries and only adds or replaces entries. A refresh for a new access token never clears the previous account's emoji library, so name lookup and image rendering can resolve private custom emoji from an earlier account on the same device.
- **Action:** Replace the catalog on authenticated account change and scope its entries to the current account, including failed refreshes.

### R063 · Medium · Video poster cache is shared across accounts

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMediaPlayer.swift:92-114,118-143`
- **Evidence:** The process-wide cache uses only the attachment storage key and URL as its key. `loadPoster` returns a cached image before resolving the URL with the current authentication session. If different accounts receive the same storage key or relative URL, the second account can see the first account's cached video frame, including after a sign-out and sign-in in the same process.
- **Action:** Scope poster cache entries to the authenticated account and server, and clear them on account changes.

### R064 · Low · An unmatched math opener masks later valid inline math

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownMath.swift:16-38`
- **Evidence:** For each delimiter type, `firstInline` examines only the first opening occurrence. If that opening has no usable close, it returns `nil` for the entire delimiter type instead of searching the next opener. For example, an escaped or code-contained first `$` prevents a later valid `$x$` span on the same line from being recognized.
- **Action:** Continue scanning opening delimiters until a valid opening and closing pair is found.

### R065 · Medium · Short backtick lines consume the rest of a message as code

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownParser.swift:19-32,471-488`
- **Evidence:** `fenceOpening` checks whether `candidate.prefix(3)` contains only the first backtick or tilde, but never checks that three characters exist. A line containing just one or two backticks is accepted as a fence opener. Without a later closing fence, `blocks` consumes all following lines into a code block.
- **Action:** Require at least three opening fence characters and match the closing fence to the opening length.

### R066 · Medium · Mention highlighting can target the wrong text

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownParser.swift:267-287` and `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownBlockViews.swift:15-45`
- **Evidence:** `applyMentions` derives a label from the mention's original source offsets, then highlights `output.range(of: label)`, which always finds the first matching label in the rendered substring. Repeated names can highlight an earlier non-mention; blocks and inline segments also pass the full message's offsets to shortened substrings, so later mentions can be skipped entirely.
- **Action:** Carry mention ranges through block and segment splitting and map source offsets to exact rendered ranges.

### R067 · Low · Mixed inline segments lose normal text wrapping

- **Location:** `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownInlineViews.swift:35-64`
- **Evidence:** A plain text segment uses a single `Text` view, but text mixed with a custom emoji or another non-math segment is placed in an `HStack`. The stack can wrap each `Text` only within its own segment, so prose cannot flow around an inserted emoji and can leave large gaps or expand beyond a narrow message column.
- **Action:** Use an inline layout that wraps across text and emoji segments within the available width.

### R068 · Medium · Failed Keychain save deletes the prior session

- **Location:** `clients/apple/Modules/EchoPersistence/Sources/SessionStore.swift:167-194`
- **Evidence:** `saveSession` calls `SecItemDelete` before `SecItemAdd`. If adding the replacement fails, it throws after the previous refresh token has already been removed. A transient Keychain failure during token rotation can therefore sign the user out with no recoverable stored session.
- **Action:** Update the existing item with `SecItemUpdate`, adding only when missing, or otherwise preserve the old item until replacement succeeds.

### R069 · Medium · Home load fails when more than 200 peers need presence

- **Location:** `clients/apple/Modules/EchoNetworking/Sources/EchoHomeClient.swift:36-47,400-409`
- **Evidence:** `load` gathers all peer IDs and `fetchPresence` sends every unique ID in one `/presence?ids=` request. The backend route at `server/backend/src/api/routes/echo/social.ts:421-440` rejects more than `ECHO_PRESENCE_BATCH_MAX_USER_IDS` (200). `fetchProfiles` already chunks at 200, but presence does not, so an account with over 200 distinct DM peers cannot load its home snapshot.
- **Action:** Chunk presence requests at the server limit and merge their maps.

### R070 · Medium · Canceling an old connection can tear down its replacement

- **Location:** `clients/apple/Modules/EchoNetworking/Sources/EchoSocketIORealtimeClient.swift:35-52,128-160`
- **Evidence:** A new `connect` cancels the prior `connectTask`. The canceled task's handler launches an unstructured `Task { await self.disconnect() }`, while the new task independently queues `open` on `handleQueue`. If the new `open` runs first, the old cancellation's `disconnect` subsequently calls `teardown` and closes the new socket. There is no generation check tying cleanup to the task that owned the socket.
- **Action:** Serialize connection transitions and make cancellation cleanup conditional on the canceled connection's generation or socket identity.

### R071 · Low · Inbox acceptance test depends on a 50 ms race

- **Location:** `clients/apple/Tests/EchoFeaturesTests/EchoInboxModelTests.swift:27-40`
- **Evidence:** `respond` starts asynchronous work, but the test waits a fixed 50 ms and then asserts that the request has been removed and the stub was called. A slow CI runner can reach the assertions before the task completes, producing a false failure.
- **Action:** Await a completion signal or expose a testable async operation instead of sleeping for a fixed interval.

### R072 · Low · Network tests share one mutable URLProtocol handler across suites

- **Location:** `clients/apple/Tests/EchoNetworkingTests/EchoURLProtocolHarness.swift:7-16,28-34` and `clients/apple/Tests/EchoNetworkingTests/EchoNetworkingHomeRealtimeTests.swift:140-146`
- **Evidence:** Each test replaces the same static `EchoURLProtocolStub.handler`; `startLoading` reads it when a request begins rather than when its session is created. The networking test files use separate serialized suites, which do not serialize work across suites. Concurrent tests can therefore route a request into another test's handler and report failures unrelated to the code under test.
- **Action:** Give each test session an isolated protocol handler or serialize all suites that use the shared global stub.

### R073 · Low · Style lint does not enforce color rules in Vue styles

- **Location:** `clients/web/stylelint.config.mjs:57-72` and `clients/web/package.json:19`
- **Evidence:** The `lint:style` command includes every Vue file, but the `**/*.vue` override sets both configured color rules to `null`. The later exception for `SettingsAppearance.vue` is redundant. Raw hex colors and disallowed color functions inside all Vue single-file component styles therefore pass this style check.
- **Action:** Apply the color rules to Vue styles and keep only the explicitly exempt swatch component as an override.

### R074 · Low · Dev console log endpoint accepts unbounded request bodies

- **Location:** `clients/web/vite-plugins/consoleLogDevPlugin.ts:23-36,120-169` and `clients/web/vite.config.ts:394-404`
- **Evidence:** The development server listens on all interfaces and registers `/__dev/console-log` without a request size limit. `readJsonBody` accumulates every chunk before parsing; `sanitizeDetails` caps array length but not the size of each element or the message. A reachable client can force large memory allocations and write oversized `console-log.json` content with a single POST.
- **Action:** Bound the incoming body and individual retained fields, and restrict the dev endpoint to intended local clients.

### R075 · Low · Server rail smoke tests pass when their target is absent

- **Location:** `clients/web/cypress/e2e/server-rail-reorder.cy.ts:8-28` and `clients/web/scripts/verify-e2e-smoke.mjs:115-145`
- **Evidence:** Both Cypress and its Playwright smoke mirror assert the reorder root only when it already exists, and assert icon visibility only when two icons already exist. Both pass without any assertion about the rail when those elements are missing, so removal of the feature or a failed setup can leave these checks green.
- **Action:** Provide deterministic joined-server fixtures and assert that the root and expected icons exist before checking visibility or reorder behavior.

### R076 · Low · Default image slot UI check does not verify persistence

- **Location:** `clients/web/scripts/verify-image-slot-fill.mjs:300-375,394-441`
- **Evidence:** The default UI path creates a separate session and message, clicks its empty slot, and checks only for a filled DOM element and image box. It fetches that message from the server after the UI action only when a harness file is supplied. An optimistic UI fill that fails to persist can therefore pass the default UI verification, even though the earlier API persistence check exercised a different message.
- **Action:** Fetch and assert the UI message's persisted `contentJson` after every UI fill, regardless of harness mode.

### R077 · Low · Wheel scroll verification never sends wheel events

- **Location:** `clients/web/scripts/verify-message-list-layout.mjs:415-439`
- **Evidence:** The default `SCROLL_MODALITY` is `wheel`, but both its fallback branch and the `scrollbar` branch change `scrollTop` directly with the same code. The script never calls `page.mouse.wheel`, so it cannot catch wheel handler or passive listener regressions despite labeling the run as wheel verification.
- **Action:** Send real wheel input for the wheel mode and retain direct `scrollTop` changes only for the scrollbar mode.

### R078 · Medium · Two self-contained web verifiers proxy to the wrong backend port

- **Location:** `clients/web/scripts/run-image-slot-fill-verify.sh:7,22-50`, `clients/web/scripts/run-message-list-scroll-verify.sh:7,23-54`, and `clients/web/vite.config.ts:39-55`
- **Evidence:** The image-slot and scroll scripts start their isolated backend harnesses on ports 3002 and 3003, respectively, and pass those URLs to the Playwright scripts. They start Vite with an empty `VITE_API_URL`, so browser API calls use Vite's same-origin proxy, whose target is hard-coded to port 3000. The UI therefore reaches a different backend from the one that minted its session and seeded its fixtures.
- **Action:** Parameterize the Vite proxy target for each verifier and point it at that run's harness port.

### R079 · Medium · Failed initial NATS connection permanently disables cross-node realtime

- **Location:** `server/backend/src/bootstrap/socket.ts:99-110`; sole startup call at `server/backend/src/bootstrap/startServer.ts:62`.
- **Evidence:** When the configured NATS service is temporarily unavailable at backend startup, the attach function catches the failure and starts serving with the local adapter. There is no scheduled retry or subsequent production caller of `connectNats`/`attachSocketAdapterIfConfigured`. Once NATS becomes reachable, this process still lacks both the adapter and channel-fanout subscription. `publishEchoChannelFanout` consequently has no connection and publishes nothing; users on other backend replicas miss channel events until this process restarts. The multi-node test attaches only after NATS is already available, so it does not cover this recovery path.
- **Action:** Retry initial attachment with bounded backoff and lifecycle cleanup, or fail startup when cross-node transport is configured as required. Add a startup-unavailable-then-available integration case.

- **Remediation:** Fixed: startup now rejects a configured NATS outage before accepting traffic; unavailable and healthy two-node cases passed.

### R080 · Medium · Startup voice repair overwrites intentional category placement

- **Location:** `server/backend/src/db/repairEchoVoiceChannelMigration.ts:46-108`; called on every process schema initialization at `server/backend/src/db/echoTables.ts:1848`.
- **Evidence:** The repair treats every voice/stage channel in a category named `Text Channels` as migration damage, without checking provenance or a migration marker. Categories can contain intentionally placed voice channels. An isolated Postgres reproduction created a normal voice channel under that category with no mirror configuration; the repair reported one recategorized channel and moved it to `Voice Channels`. Because schema initialization calls this repair on each startup, restoring the user's layout is undone on the next restart. Its existing regression verifies the repair case, but does not preserve legitimate mixed categories.
- **Action:** Restrict the repair to rows proven to have been affected by the legacy migration and record completion. Preserve intentional mixed-category layouts and test that they survive startup.

- **Remediation:** Fixed: the recurring category-name heuristic was removed; legitimate mixed categories survive repeated Postgres schema initialization.

### R081 · Medium · Mutable usernames grant permanent official account badges

- **Location:** `server/backend/src/db/authTables.ts:393-410`.
- **Evidence:** Every schema initialization awards Developer, Bug Hunter and explicit OG badges using mutable username strings. `danny`, `dannas29`, `lesbian` and `blawh` are valid registration handles and are not reserved in `contracts/usernamePolicy.ts`. If an original owner renames/deletes their account, or on a fresh self-hosted database, an unrelated account can claim the handle and receive the award on restart. An isolated Postgres account named `danny` acquired `awarded_badges = ['developer']` after `ensureAuthTables`. The public badge title identifies its holder as an Echo developer; the award persists after renaming because it is appended to durable account state.
- **Action:** Award official badges through immutable, explicitly configured account IDs or an authorized administrative action. Stop recurring grants based on handles and audit already-issued awards.

- **Remediation:** Fixed: handle-based grants were removed; all legacy handles receive no award on repeated initialization. Existing award audit remains an operator data task; see the administration runbook above.

### R082 · Medium · Profile sanitizer removes only the first control character

- **Location:** `server/backend/src/auth/accountPolicy.ts:18,91,131`.
- **Evidence:** `CONTROL_CHARS_RE` lacks the global flag. Both `.replace(CONTROL_CHARS_RE, '')` calls therefore remove one control character and leave the rest. Direct execution of `sanitizeProfileCustomStatus('a\u0000b\u0000c')` returned `ab\u0000c`. The Postgres profile updater passes this result directly as `custom_status` (and uses the same sanitizer for bio); a second NUL reaches a PostgreSQL text parameter and is rejected instead of producing a sanitized profile. Display names use the same incomplete removal.
- **Action:** Remove all control characters and verify multiple NUL/control-character inputs for custom status, bio and display names.

- **Remediation:** Fixed: the global control-character sanitizer passed multiple-NUL/control-character and repeated-call regressions.

### R083 · High · Mixed permission migration deletes the legacy base overwrite

- **Location:** `server/backend/src/db/echoTables.ts:2041-2105`.
- **Evidence:** Legacy channel/category JSON is copied only when no normalized overwrite row of any target type exists. The subsequent `UPDATE` clears that legacy JSON whenever any row exists. A partial deployment or mixed writer can therefore leave a member- or role-specific row beside an unmigrated base blob; startup skips the copy and then destroys the blob. In isolated PostgreSQL, a channel with legacy `{ VIEW_CHANNEL: false }` plus a normalized member row `{ SEND_MESSAGES: false }` emerged from `ensureEchoTables` with `permission_overrides = NULL` and only the member row. The base visibility deny was lost, which can expose the channel to members it previously denied.
- **Action:** Upsert the normalized base `members` row based on that target's identity, independently of other rows, and clear the legacy column only after verifying the equivalent base row exists. Apply the same rule to category overrides and add mixed-state migration regressions.

### R084 · Medium · Partial category migration cannot resume when its category already exists

- **Location:** `server/backend/src/db/echoTables.ts:2122-2183`.
- **Evidence:** For every legacy `category_name` group whose channel still has `category_id = NULL`, the migration unconditionally inserts a new category. It does not reuse an existing case-insensitive category even though `echo_categories_server_name_lower_unique` forbids duplicates. An isolated partial-migration state with an existing `Review` category and one remaining `category_name = 'Review'` channel failed startup with PostgreSQL `23505` on that unique index. Because the legacy column remains after the failed run, every restart repeats the failure.
- **Action:** Resolve each legacy group to an existing normalized category before inserting, compute positions after existing categories, and verify restart recovery from partially applied channel and override migrations.

### R085 · Low · Fresh databases omit emoji market search indexes until restart

- **Location:** `server/backend/src/db/echoTables.ts:1368-1385,1564-1590`.
- **Evidence:** Both optional trigram indexes are attempted before `echo_server_emoji_packs` and its `description`/`listed_in_market` columns are created. The errors are swallowed as optional degradation and there is no later attempt in the same initialization. An isolated fresh database had neither index after its first successful `ensureEchoTables`; a second process initialization created both. New deployments therefore use sequential emoji-market scans until a later restart.
- **Action:** Create the table and required columns before attempting these indexes, then test index presence after a single fresh initialization.

### R086 · Medium · Legacy-index cleanup rebuilds the same large index on every startup

- **Location:** `server/backend/src/db/echoTables.ts:322-325,1286-1290`; flag at `server/backend/src/config.ts:1136-1139`.
- **Evidence:** `echo_messages_channel_created` is always created near the start of schema initialization. When `ECHO_DROP_LEGACY_MESSAGE_TIMELINE_INDEXES=true`, the same initialization drops it later. On every following process start, PostgreSQL must build the complete message timeline index again before immediately dropping it. On a large message table this adds startup work, disk churn and write interference specifically after operators enable the cleanup flag.
- **Action:** Guard the early creation with the inverse flag, as already done for the author timeline index, and verify the legacy index stays absent across consecutive flagged startups.

### R087 · High · “Run once” migrations execute concurrently on multiple replicas

- **Location:** `server/backend/src/db/echoSchemaMigration.ts:4-25`; callers throughout `server/backend/src/db/echoTables.ts:1798-3541`.
- **Evidence:** The helper performs `SELECT`, runs the callback, then inserts the marker without a transaction or database lock. Two processes that see no marker both execute the callback; `ON CONFLICT` protects only the final marker. A two-pool PostgreSQL reproduction ran the same callback twice. Several real callbacks contain non-idempotent DDL (for example bare `CREATE TABLE echo_instance_bans`) or destructive role rewrites, so simultaneous replica startup can fail one process or apply data changes twice. A crash between callback statements and marker insertion can also leave a partial migration that is rerun.
- **Action:** Serialize each migration with a transaction-scoped advisory lock, recheck the marker after acquiring it, and commit the callback plus marker atomically. Add concurrent-caller and injected-failure recovery regressions.

### R088 · Medium · Passkey ceremonies are lost on restart or replica changes

- **Location:** `server/backend/src/auth/webauthnChallenge.ts:3-26`; registration callers at `server/backend/src/api/routes/passkeyRoutes.ts:135-136,205-207`; login callers at `server/backend/src/api/routes/passkeyRoutes.ts:526-527,574-576`.
- **Evidence:** Challenges are held only in a module-local `Map`. The options response returns an opaque handle, and verification succeeds only if it reaches the same live Node process. A process restart, rolling deployment, or load balancer routing verification to another supported API replica makes a still-valid ten-minute ceremony return `CHALLENGE_EXPIRED`. The multi-replica runbook does not require sticky HTTP routing, and PostgreSQL is already required for passkeys.
- **Action:** Store one-time challenge records in a shared durable store with expiry and atomic consumption, binding registration challenges to the authenticated user and ceremony type. Add restart and cross-replica option/verify regressions.

### R089 · Low · Abandoned WebAuthn challenges remain in memory forever

- **Location:** `server/backend/src/auth/webauthnChallenge.ts:5,11-26`; option creation at `server/backend/src/api/routes/passkeyRoutes.ts:135-136,526-527`.
- **Evidence:** Expiry is checked only when `takeWebAuthnChallenge` receives that exact handle. There is no timer, periodic sweep, size limit or opportunistic cleanup of other entries. Every prefetched or abandoned registration/login options request therefore leaves a permanent entry for the lifetime of the process. Route rate limits slow growth but do not bound it over a long-running process.
- **Action:** Use the shared expiring challenge store from R088, or add bounded capacity plus expiry sweeping and tests that abandoned entries are reclaimed.

### R090 · Low · Passkey options disclose account registration and credential IDs

- **Location:** `server/backend/src/api/routes/passkeyRoutes.ts:475-528`.
- **Evidence:** This unauthenticated endpoint accepts an email or username. For a matching non-guest account with passkeys it returns a non-empty `allowCredentials` containing every credential ID; for unknown accounts or accounts without passkeys it omits the field. An attacker can therefore enumerate registered identifiers, identify passkey adoption, and collect stable credential IDs from the response. The empty-body discoverable-credential flow already works without this disclosure.
- **Action:** Return discoverable-credential options without account-specific credential IDs from the public login endpoint, or protect any identifier-bound flow with an enumeration-resistant proof and indistinguishable response shape.

### R091 · Medium · Concurrent passkey logins can move the authenticator counter backward

- **Location:** `server/backend/src/api/routes/passkeyRoutes.ts:591-638`; `server/backend/src/auth/store/postgres/PostgresAuthStore.ts:1874-1901`.
- **Evidence:** Verification reads the stored counter, validates the assertion in application code, then performs an unconditional `UPDATE counter = newCounter`. Two assertions can both validate against the same old value. If the higher counter commits first and the lower one finishes later, the lower value overwrites it. SimpleWebAuthn relies on the stored counter comparison to detect cloned/replayed authenticators, so this race weakens that signal and loses monotonic state.
- **Action:** Update atomically with the expected old counter (or a row lock transaction), reject a stale update, and never lower a nonzero counter. Add an out-of-order concurrent-authentication regression.

### R092 · Medium · Redis errors silently weaken TOTP replay protection across replicas

- **Location:** `server/backend/src/auth/totpReplayCache.ts:18-59`; production callers in `server/backend/src/auth/store/postgres/PostgresAuthStore.ts:1443,1538,1615,1749`.
- **Evidence:** With Redis configured, any connection or command failure is caught and the replay decision falls through to a process-local `Map`. During a Redis outage, two API replicas can each accept the same valid TOTP code because neither sees the other's in-memory mark. The application receives no error and authentication continues with weaker replay protection precisely while the shared security dependency is unavailable.
- **Action:** Fail closed for security-sensitive production flows when configured shared replay storage is unavailable, or use a durable database fallback with atomic insert/expiry. Exercise the same code against two instances during a Redis outage.

### R093 · Medium · Atomic policy-file replacement disables hot reload

- **Location:** `server/backend/src/config/instancePolicy/hotReload.ts:52-87`; advertised behavior in `docs/operations/instance-policy.md:42`.
- **Evidence:** When the policy exists, `fs.watch` attaches to that file/inode and is never reattached. Editors and deployment tools commonly write a temporary file and rename it over the target. A macOS reproduction initialized the watcher, atomically replaced the policy twice, waited beyond the 300 ms debounce after each write, and retained the initial value both times; no reload event ran. The existing hot-reload test explicitly deletes `ECHO_INSTANCE_POLICY_WATCH` and therefore never exercises the watcher.
- **Action:** Watch the parent directory and filter by basename (including when the file initially exists), or recreate the watcher after rename events. Add direct-write, atomic-replace and delete/recreate regressions.

### R094 · Medium · Malformed policy environment overrides silently disable safeguards

- **Location:** `server/backend/src/config/instancePolicy/envOverrideHelpers.ts:8-22`; consumers in `server/backend/src/config/instancePolicy/envOverrides.ts:22-184`.
- **Evidence:** `envBool` sends every non-empty value through `parseBoolean(..., false)`, so a typo such as `ECHO_REGISTRATION_DISABLED=tru` is accepted as an explicit `false` override and re-enables registration. The same behavior can disable the HWID account cap and other policy switches. `envInt` and `envFloat` use prefix parsers, so values such as `10junk` are accepted as 10. The resulting values pass policy schema validation because their runtime types are valid; startup gives the operator no error or warning that the configured value was not understood.
- **Action:** Parse present environment overrides strictly and fail startup with the variable name and accepted syntax when the full value is invalid. Add regressions for misspelled booleans and numeric suffixes on security and rate-limit settings.

### R095 · Low · Attention scheduler dedupe test never observes an emission

- **Location:** `server/backend/src/tests/members/echoAttentionSnapshotScheduler.test.ts:9-23`.
- **Evidence:** The test creates an `emitted` array but its mock `emit` callback never appends to it, then asserts only that the untouched array remains empty. The fake pool cannot build a snapshot, and the scheduler catches that failure internally. Running the test reports success whether user IDs are deduplicated, duplicated, or no emission is attempted at all.
- **Action:** Inject or mock the snapshot builder, record every emitted user/room, and assert exactly one emission for `u1` and one for `u2`. Set debounce configuration before importing the module or expose the delay as a dependency.

### R096 · Low · Permission ordering regression is both failing and absent from test scripts

- **Location:** `server/backend/src/tests/permissions/echo.mergeOverrideRows.presort.test.ts:4-27`; `server/backend/package.json:6-104`.
- **Evidence:** The test passes deliberately unsorted rows while setting `presorted: true`, then incorrectly expects the result to match the internally sorted path. Running the file fails at line 22: the sorted result is `VIEW_CHANNEL: false` and the presorted unsorted result is `true`. No package test script invokes this file, so the permanently failing regression is invisible to normal test runs.
- **Action:** Make the contract explicit: either remove the invalid unsorted-plus-presorted assertion or change the implementation to ignore the hint. Register the corrected test in the permission suite so future failures reach CI.

### R097 · Medium · Best-effort session touches can become unhandled rejections

- **Location:** `server/backend/src/auth/middleware.ts:93-97`; `server/backend/src/auth/serverSession.ts:200-211`.
- **Evidence:** Every successful cookie or native-bearer request launches `touchServerSession` with `void` and no rejection handler. The touch awaits Redis `EXPIRE`, `GET`, and another `EXPIRE`; a Redis command failure after authentication therefore rejects a detached promise. There is no process-level unhandled-rejection handler in the backend. Under Node's default behavior this can terminate the API process, turning an optional TTL refresh into an availability failure.
- **Action:** Attach an explicit catch that records the Redis failure without rejecting the request, or await the touch under a controlled session-store error policy. Add a regression with a Redis client that fails during `EXPIRE`.

### R098 · High · Session revocation can miss a concurrently saved Redis session

- **Location:** `server/backend/src/auth/serverSession.ts:131-151,234-246`; password, replay, ban and logout-all callers listed at `server/backend/src/api/routes/auth/password.ts:163,293`, `server/backend/src/api/routes/auth/session.ts:120,166,416`, and `server/backend/src/domain/echoStore/safety/instanceBans.ts:304`.
- **Evidence:** `deleteAllServerSessionsForUser` first reads the user set with `SMEMBERS`, then later deletes only those IDs and the set. A concurrent `saveServerSession` can commit its atomic `SET` + `SADD` between those operations. The revoker then deletes the index but not the newly added session key, leaving an unindexed session that `getServerSession` continues to accept until its full refresh-token TTL. This defeats immediate all-session revocation during password reset/change, refresh-token replay response, instance ban, and logout-all when issuance overlaps the revocation window.
- **Action:** Serialize issuance and revocation per user, or implement both with one Lua script/versioned revocation epoch so a save that began before revocation cannot survive it. Add a deterministic Redis interleaving regression.

### R099 · Medium · Redis session CAS operations share connection-scoped WATCH state

- **Location:** `server/backend/src/auth/serverSession.ts:61-78,81-114`; callers at `:256-303,346-359`.
- **Evidence:** Every update uses the same singleton ioredis connection. Redis `WATCH` state belongs to the connection, not to an async JavaScript call. Two overlapping updates can both execute `WATCH` and read the old payload; one call's `EXEC` clears the connection's watched state, after which the other transaction can commit without detecting the intervening write. The later writer then restores stale fields, such as an old refresh-token binding or cached user, despite the function being presented as compare and set.
- **Action:** Replace this sequence with an atomic Lua script, or acquire an isolated Redis connection for each WATCH transaction and release it afterward. Add concurrent updates to different fields and assert neither update is lost.

### R100 · Low · Expired in-memory sessions leak user-index entries

- **Location:** `server/backend/src/auth/serverSession.ts:31-38,175-198`.
- **Evidence:** When `getServerSession` encounters an expired in-memory row, it deletes only `memSessions[sessionId]`. It never removes that ID from `memUserIndex`, and there is no background sweep. Users whose sessions expire naturally therefore retain stale IDs and often permanent per-user sets for the process lifetime. Later per-user revocation scans all accumulated stale entries.
- **Action:** Remove the session ID from the matching user set when expiring it, delete empty sets, and add bounded periodic cleanup or opportunistic sweeping for sessions that are never looked up again.

### R101 · Medium · A legitimate concurrent refresh revokes the winning session

- **Location:** `server/backend/src/api/routes/auth/session.ts:109-132,154-178`; behavior asserted in `server/backend/src/tests/auth/auth.integration.ts:220-255`; retrying client at `clients/web/src/api/authClient.ts:90-109`.
- **Evidence:** Two requests using the same current refresh token are indistinguishable from a replay after one wins rotation. The losing request treats `already_redeemed` as theft, revokes every refresh token and server session for the account, and disconnects all sockets, including the successor just issued to the winner. The integration test explicitly confirms that the winner is unusable. The web client simultaneously labels this response a “concurrent rotation” and retries after 120 ms, but the server has already destroyed the replacement, so the retry cannot recover. Separate tabs, native clients, or network retries can therefore sign the user out everywhere without token theft.
- **Action:** Give a just-rotated token a short, bounded reuse grace that returns or recognizes the same successor for the same session/device, while retaining family-wide revocation for reuse outside that window or context. Align the client and integration expectations with that policy.

### R102 · Medium · Concurrent registrations bypass the HWID account cap

- **Location:** `server/backend/src/api/routes/auth/register.ts:249-299`; `server/backend/src/services/auth/hwidAccountProfile.ts:35-94`.
- **Evidence:** Registration counts existing `(hwid_hash, ip)` accounts, then creates the user and session, and only afterward inserts the binding in a separate query. Concurrent requests can all observe the same below-limit count and each create an account before any binding is visible. The table has only a per-user uniqueness constraint, so it cannot enforce the configured maximum. If binding insertion fails, the route returns 500 after the account and server session have already been created.
- **Action:** Reserve and enforce a cap slot atomically with user creation in one transaction, using a lock or counter row keyed by HWID hash and IP. Roll back account/session issuance when the reservation cannot be recorded, and add concurrent registration regressions.

### R103 · Medium · Absolute instance caps admit unlimited concurrent work before counting it

- **Location:** `server/backend/src/services/auth/absoluteInstanceRateLimiter.ts:19-63`; registration caller at `server/backend/src/api/routes/auth/register.ts:234-304`; message caller at `server/backend/src/sockets/chatMessageHandler.ts:151-160,659-661`.
- **Evidence:** `checkWindow` only reads the counter. Registration increments it after user creation and message sending increments it after persistence, across many awaited operations. A burst of concurrent requests can therefore all pass while the counter is below the limit and only increment after the protected work has completed. This bypass exists even in one process; the documented per-process design multiplies it across replicas.
- **Action:** Combine admission and reservation in one synchronous/atomic operation before starting the work, refunding a reservation only when the operation definitively fails. Use shared storage if the setting is intended to be instance-wide across replicas.

### R104 · Medium · Legacy GET verification still consumes query-string tokens

- **Location:** `server/backend/src/api/routes/auth/register.ts:92-137`.
- **Evidence:** The route comment says legacy `?token=` links are redirected to a fragment without consuming the token because proxies log query strings. However, adding `format=json` calls `finishEmailVerification` directly from the GET request. That state-changing branch consumes signup tokens and applies pending email changes while the secret remains in proxy/history logs. Automated link scanners can also consume a one-time token before the user follows it.
- **Action:** Make every GET variant perform only the fragment redirect. Keep token consumption exclusively on the rate-limited POST endpoint and remove the `format=json` state-changing compatibility path.

### R105 · Low · Official-server membership cache retains every user forever

- **Location:** `server/backend/src/services/auth/officialEchoServerMembershipCache.ts:4-42`.
- **Evidence:** Every checked user ID is stored in a module-level map. Entries older than 24 hours stop suppressing backfill, but `shouldSkipOfficialEchoServerMembershipBackfill` never removes them and there is no sweep or size bound. Over a long-lived process, every distinct user that reaches this path remains in memory permanently.
- **Action:** Delete expired entries when read and periodically sweep or bound the cache. Add a test showing expired user IDs are reclaimed.

### R106 · Medium · Concurrent SMS requests bypass all send caps

- **Location:** `server/backend/src/services/auth/phoneVerificationActions.ts:21-49`; `server/backend/src/domain/smsSendAbuse.ts:5-74`.
- **Evidence:** The service separately checks the process-local IP history and two PostgreSQL counts, then issues a challenge, records the IP only afterward, and sends the billed SMS. Concurrent requests can all observe counts below their limits and proceed. The IP limit is also process-local, so replicas each grant a full allowance. The database has no reservation or constraint enforcing the per-user or per-phone daily maxima.
- **Action:** Reserve all applicable quotas atomically before issuing a challenge or contacting Telnyx, using shared storage and one transaction/script. Refund only failures that should not count, and add concurrent multi-replica cap tests.

### R107 · High · Redis errors fail open and forget login lockout state

- **Location:** `server/backend/src/services/auth/loginProtection.ts:38-80,101-168,170-236`.
- **Evidence:** Password and MFA lockout reads are split across two Redis commands. If either command fails, `readState` ignores all Redis state and uses a process-local map, even when the other Redis read returned an active lock. Failure recording also falls back independently per process. During an outage, attackers receive a fresh failure budget on every replica; when Redis recovers, reads immediately prefer Redis and forget the failures accumulated in memory. A transient failure of only the lock-key read can therefore bypass an already active shared account lockout.
- **Action:** Treat configured shared lockout storage as fail closed for protected login attempts, or use a durable database fallback. Read/update counters and locks atomically in one script, and test active-lock behavior through partial Redis failures and recovery across replicas.

### R108 · Medium · Concurrent guest mints bypass hourly limits and CAPTCHA thresholds

- **Location:** `server/backend/src/services/auth/guestAbuseLimiter.ts:54-161`; caller at `server/backend/src/api/routes/auth/guest.ts:137-249`.
- **Evidence:** `evaluateGuestMint` reads hourly and daily counters without reserving capacity. Guest creation and session issuance occur before `recordGuestMintSuccess` increments them. Concurrent requests can all pass the same below-limit count, avoid a CAPTCHA that should become required, and mint accounts beyond the cap. Redis read errors fall back to per-process arrays, giving each replica a separate fresh budget; successful Redis reads later ignore those fallback mints.
- **Action:** Atomically reserve the hourly/day quota and return the CAPTCHA decision from the same shared operation before creating the guest. Define rollback semantics for failed creation and test concurrent requests plus Redis outage/recovery.

### R109 · Medium · Guest upgrade bypasses disabled registration policy

- **Location:** direct registration gate at `server/backend/src/api/routes/auth/register.ts:225-233`; guest upgrade at `server/backend/src/api/routes/auth/guest.ts:270-337`.
- **Evidence:** `registration.disabled` is described as rejecting new account registration and the ordinary `/register` route enforces it. `/guest/upgrade` converts a guest into a full password/email account without checking the same policy. Because guest enablement and registration disablement are independent instance settings, existing or resumable guests can create full accounts while an operator believes registration is closed.
- **Action:** Apply the registration-disabled gate to guest upgrades, or introduce and document a separate explicit policy switch if operators should be able to allow conversions while blocking other registrations. Add a policy matrix regression.

### R110 · Low · Email-change requests silently discard every other profile edit

- **Location:** `server/backend/src/api/routes/auth/me.ts:401-459,527-594`.
- **Evidence:** The PATCH schema permits `email` alongside display name, username, avatar, status, phone and other profile fields, and the handler builds all of those values into `patch`. When a non-empty email is present, however, it stages the email change and returns immediately at line 562. None of the other accepted fields reach `updateUserProfile`, and the response gives no indication that they were ignored. A settings form that submits email with other edits therefore reports success while losing those edits.
- **Action:** Reject mixed email-change payloads explicitly, or stage the email and apply the remaining patch in a defined transaction before responding. Add a request containing email plus one ordinary profile field.

### R111 · Low · Memory profile failures leave partial mutations behind

- **Location:** `server/backend/src/auth/store/memory/MemoryAuthStore.ts:245-327,375-430`.
- **Evidence:** `updateUserProfile` writes avatar, status, bio and banner fields directly onto the stored user before validating later display-name, username, phone, timezone or locale fields. If a later validator throws, the route returns an error but all earlier writes remain. `upgradeGuestAccount` similarly assigns email, username and display name before awaiting the password hash and before validating the optional avatar; an invalid avatar can return `INVALID_BODY` after the stored record already has the requested identity and password and may be partly converted. PostgreSQL gets statement/transaction atomicity, so memory mode behaves differently.
- **Action:** Validate and normalize the complete input first, build a cloned next record, and replace the stored object only after every step succeeds. Add mixed valid/invalid patch and invalid-avatar upgrade regressions asserting no field changes.

### R112 · Medium · Concurrent phone-code issuance creates multiple active challenges

- **Location:** `server/backend/src/auth/store/postgres/PostgresAuthStore.ts:1222-1273`; schema at `server/backend/src/db/authTables.ts:166-187`.
- **Evidence:** Cooldown lookup, invalidation of existing challenges and insertion of the new challenge are separate pool operations with no transaction or user-row lock. Concurrent requests can both pass the cooldown, both invalidate only older rows and then both insert active challenges. The schema has ordinary lookup indexes but no constraint limiting a user to one active challenge. Verification selects only the newest active row, so a valid code delivered by the other request is rejected; the race also lets concurrent sends bypass the intended resend interval.
- **Action:** Serialize issuance per user in one transaction, for example by locking the auth-user row before checking cooldown and replacing the active challenge. Add a partial unique invariant where practical and a concurrent issuance regression proving one request is rejected or superseded deterministically.

### R113 · Medium · LiveKit replay protection is local to one replica

- **Location:** `server/backend/src/services/livekit/webhookReplayCache.ts:3-33`; caller at `server/backend/src/api/routes/livekitWebhook.ts:159-190,222-317`.
- **Evidence:** The replay key is stored only in a module-level `Map`. A signed LiveKit retry routed to another backend replica is accepted again and repeats downstream work, including sidecar forwarding, audit inserts, workspace and roster events, and participant-leave E2EE cleanup. Process restarts also immediately forget every accepted payload.
- **Action:** Store a stable event or payload identifier in shared storage with an atomic set-if-absent and TTL before applying side effects. Keep database mutations idempotent and add a two-replica replay test.

### R114 · Medium · Redis errors disable HTTP rate limiting across the service

- **Location:** `server/backend/src/services/httpRateLimitStore.ts:12-41`; registrations include `server/backend/src/bootstrap/httpPlugins.ts:130-139` and authentication route limiters.
- **Evidence:** Every limiter using the shared store receives `skipOnError: true`, while the Redis client also disables its offline queue and allows only one retry. Any Redis outage therefore admits requests without a local fallback or reservation. This affects the global API limiter and sensitive login, registration, password-reset, guest, OAuth and passkey limiters simultaneously; multiple replicas all fail open.
- **Action:** Use a bounded local fallback for availability-sensitive limits and fail closed or apply a stricter emergency budget to abuse-sensitive routes. Expose the degraded mode in health/metrics and test Redis failure and recovery across replicas.

### R115 · Medium · Concurrent Discord imports bypass the daily start quota

- **Location:** `server/backend/src/services/discordImport/discordImportQuota.ts:20-53`; caller at `server/backend/src/services/discordImport/discordImport.ts:1095-1196`.
- **Evidence:** The quota helper reads the current daily count without locking or reserving capacity. The caller then loads and imports an entire bundle before incrementing the counter near the end. Concurrent first-time imports can all observe the same below-limit count and proceed beyond the configured maximum; failures after substantial work also leave no reservation to constrain the other requests.
- **Action:** Atomically reserve a daily slot with a conditional upsert before starting import work. Define whether failed imports consume or refund the slot and add a concurrent limit regression.

### R116 · Medium · Concurrent self-demotions can remove every instance operator

- **Location:** `server/backend/src/api/routes/echo/instanceBanHandlers.ts:86-121`; mutation at `server/backend/src/domain/echoStore/safety/instanceBanOperators.ts:26-55`.
- **Evidence:** Each self-demotion counts operators in one query and updates its user in a later query without a transaction or lock. With two operators, both can read a count of two and then both demote themselves, leaving the instance with zero operators despite the explicit last-operator guard.
- **Action:** Serialize operator demotions in one transaction and lock a shared guard row or all current operator rows before enforcing the invariant. Add a two-operator concurrent self-demotion test that permits only one commit.

### R117 · High · An unreadable CSAM blocklist silently permits every upload

- **Location:** `server/backend/src/services/csamScan/sha256Blocklist.ts:13-48`; scanner at `server/backend/src/services/csamScan/scanner.ts:7-21`; configuration at `server/backend/src/config/csamPrecompute.ts:22-52`.
- **Evidence:** A configured blocklist path is enough for scan mode `on` to remain active, but every stat/read/parse error is swallowed. Before the first successful load, the in-memory set is empty, so `runEchoConfiguredCsamScanners` returns `pass` for every hash when no external scanner is configured. A missing, unreadable or malformed deployment therefore reports scanning as enabled while silently accepting all content.
- **Action:** Distinguish an initialized snapshot from an empty valid list. Return `scanner_error` until the first successful read, validate the configured file during startup, emit actionable health/metrics, and test missing and permission-denied files in enforcement mode.

### R118 · Medium · Mirror-queue admission can exceed its configured depth by a full batch

- **Location:** `server/backend/src/domain/echoStore/messages/discordImportMediaMirrorQueue.ts:8-62`.
- **Evidence:** The advisory lock serializes callers, but the insert predicate only checks `active_count < maxQueueDepth`. Once that Boolean is true, `LIMIT $1` admits the entire requested batch without subtracting the existing active count. With a depth cap of 100 and 99 active rows, a batch limit of 500 inserts up to 500 more jobs and leaves 599 active entries.
- **Action:** Limit insertion to `LEAST(batch_limit, max_queue_depth - active_count)` within the locked statement. Add boundary tests with a nearly full queue and with concurrent callers.

### R119 · High · External CSAM scan copies use host-readable default permissions

- **Location:** `server/backend/src/services/csamScan/externalScanCmd.ts:17-59`.
- **Evidence:** The scanner creates its random directory with the default `mkdir` mode and writes the uploaded bytes with the default file mode. Under a common `022` umask this produces a `0755` directory and `0644` file in the shared system temporary directory, allowing other host users or colocated processes to list and read sensitive material while the external scan runs.
- **Action:** Create the directory with mode `0700`, write the input with mode `0600`, verify the effective permissions where supported, and run the scanner under a dedicated restricted identity. Add a regression that checks modes before the mock scanner exits.

### R120 · Low · Concurrent bridge setup can create duplicate Discord webhooks

- **Location:** `server/backend/src/services/discordBridge/discordBridgeWebhookEnsure.ts:11-64`; caller at `server/backend/src/services/discordBridge/discordBridgeApply.ts:256-293`.
- **Evidence:** Bridge setup reads the stored bridge, lists Discord webhooks, and creates a new webhook through separate uncoordinated operations. Two requests enabling outbound sync for the same channel can both see no stored URL and no matching remote hook, then both create an `Echo bridge` webhook. Only one URL is ultimately persisted, leaving the other live webhook orphaned in Discord.
- **Action:** Serialize bridge enablement per Discord channel, recheck persisted and remote state inside the critical section, and delete a newly created webhook if the local compare-and-set loses. Add a concurrent setup regression.

### R121 · Medium · Scheduled-job advisory locks can leak on pooled connections

- **Location:** `server/backend/src/jobs/imageBrowseCategoriesRefresh.ts:26-57`; `server/backend/src/jobs/statusPageProbe.ts:28-61`; `server/backend/src/jobs/metricsWeeklyDigest.ts:37-87`.
- **Evidence:** All three jobs issue session-scoped `pg_try_advisory_lock` and `pg_advisory_unlock` calls through separate `pool.query` operations. The pool can run the unlock on a different connection, where it does nothing, while the original idle connection keeps the lock. Later ticks on other replicas then skip indefinitely; ticks that reacquire it on the same session increase PostgreSQL's reentrant lock count and the single unlock still leaves the original hold behind.
- **Action:** Check out one `PoolClient` per job, acquire and release the session lock on that client in `finally`, then release the client. Alternatively use transaction-scoped advisory locks around database-coordinated job state. Add multi-connection pool regressions proving each lock is available after every tick.

### R122 · Low · A spoofed Host header bypasses the local-only diagnostics gate

- **Location:** `server/backend/src/api/routes/devDiagnostics.ts:9-66`.
- **Evidence:** Outside production, diagnostics ingest accepts a request when either the client IP is local or the untrusted `Host` header merely contains `localhost`, `127.0.0.1` or `[::1]`. A remote caller can send `Host: localhost.evil` and append arbitrary diagnostic events to the current session log. The substring checks also classify unrelated hostnames and IP suffixes as local.
- **Action:** Bind the diagnostics listener to loopback or require a verified local peer address. If proxied development access is needed, authenticate it with an explicit secret and parse exact hostnames rather than using substring tests. Add spoofed Host and suffix-address regressions.

### R123 · Medium · MIME parameters bypass the inline SVG block

- **Location:** `server/backend/src/services/uploads/echoUploadContentTypePolicy.ts:6-47`; serving callers at `server/backend/src/api/routes/echo/uploads.ts:385-402,466-483`.
- **Evidence:** The sanitizer lowercases the complete header value and blocks only exact strings such as `image/svg+xml`. A value such as `image/svg+xml;charset=utf-8` is not in the blocklist and then matches the broad `^(image|video|audio)/` allow rule. At serve time it is therefore returned as a non-coerced inline media type instead of `application/octet-stream` with attachment disposition, defeating the stated protection against poisoned metadata and enabling active SVG content when such metadata exists.
- **Action:** Parse the media type before parameters, use a positive allowlist of exact normalized types, and always force active XML/SVG aliases to attachment or octet-stream. Add parameterized, mixed-case and whitespace variants to presign, registration and serving tests.

### R124 · Medium · The inactive-guest purge has no inactivity window

- **Location:** `server/backend/src/scripts/purgeInactiveGuests.ts:15-30,63-75`.
- **Evidence:** The candidate query checks only that a guest has no messages, DM or thread participation, connection request, or pending email. It never checks `guest_minted_at`, creation/update time, an active session, or any last-activity signal. Running the script with `--execute` can therefore hard-delete a newly minted guest who is still browsing but has not performed one of those persisted actions, despite the command describing its targets as inactive.
- **Action:** Require a documented minimum age using the guest-mint or creation timestamp, exclude active sessions and recent activity, and re-evaluate the complete predicate atomically at deletion time. Show candidate age in dry-run output and add fresh-versus-old guest regressions.

### R125 · Medium · Game-service failures escape as unhandled promise rejections

- **Location:** `server/backend/src/services/gameServerForwardClient.ts:22-47`; callers at `server/backend/src/sockets/gameTunnelHandler.ts:151-254`.
- **Evidence:** `postGameServer` awaits `fetch` without a deadline or a catch, so connection failures and other transport errors reject. The join, action and leave listeners await these helpers inside detached async IIFEs with no rejection handler, and disconnect cleanup invokes `void forwardGameLeave(...)` without a catch. An unavailable or stalled game service can therefore leave socket operations hanging indefinitely or generate unhandled rejections; under Node's default unhandled-rejection behavior a rejected request can terminate the backend process.
- **Action:** Add a bounded abort deadline and catch transport failures inside the forward client, returning a distinct unavailable result. Attach final rejection handlers to every detached socket task, emit a stable service-unavailable error, and add refused-connection, timeout and disconnect-cleanup regressions.

### R126 · Medium · One reaction conflict makes a Discord shadow merge delete every shadow reaction

- **Location:** `server/backend/src/domain/discord/discordShadowMerge.ts:41-56,90-100`; constraints at `server/backend/src/db/echoTables.ts:330-336`.
- **Evidence:** The merge updates every reaction from a shadow user to the canonical user in one statement. If the canonical user already has even one matching `(message_id, emoji)` reaction, the primary-key conflict aborts the entire update; the catch silently ignores that error. The routine later deletes the shadow `auth_users` row, whose cascading foreign key deletes all reactions that the failed update left behind, including every non-conflicting reaction. The surrounding multi-step merge is also not transactional, so later failures can leave only part of a shadow migrated.
- **Action:** Merge reactions conflict by conflict with `INSERT ... ON CONFLICT DO NOTHING` followed by deletion of the source rows, and run each shadow migration in a transaction before deleting its user. Add a case containing one duplicate and multiple unique reactions and assert the unique reactions survive under the canonical account.

### R127 · Medium · Detached socket and gateway handler failures become unhandled rejections

- **Location:** `server/backend/src/sockets/messageReactionHandler.ts:32-104`; `server/backend/src/sockets/pollVoteHandler.ts:35-104`; `server/backend/src/sockets/messagePinHandler.ts:35-118`; `server/backend/src/sockets/typingHandler.ts:55-130`; `server/backend/src/sockets/channelHandlers.ts:33-82,84-159`; `server/backend/src/sockets/paperWatchHandler.ts:221-247`; `server/backend/src/sockets/paperCollabHandler.ts:379-558`; `server/backend/src/sockets/messageEditDeleteHandler.ts:65-259,262-357,359-427`; main chat message handler at `server/backend/src/sockets/chatMessageHandler.ts:79-81,101-704,714-718`; connection bootstrap at `server/backend/src/sockets/handlers.ts:224-250`; Discord gateway message listener at `server/backend/src/api/routes/discordApi/gateway/index.ts:423-541`.
- **Evidence:** These event listeners launch async work with `void` and no terminal rejection handler. Store lookup, permission queries, reaction, pin, edit, delete or typing-profile persistence, moderation, poll lookup and broadcast preparation can all reject on a database or adapter failure. The typing handler catches only its final profile lookup, leaving store, channel, access and timeout queries exposed. Channel recovery and join do the same for store, existence, permission and server lookup calls, and also discard rejected room-join/leave promises. Paper watch and unwatch likewise expose store, access, visibility, profile and room-adapter failures. The chat message listener's async body has no catch around authorization, slowmode, moderation, persistence and follow-up work; its `finally` only stops the timer, so those failures reject the detached promise. The connection bootstrap starts another detached task whose store and last-seen-IP calls occur outside its inner catch. The WebSocket gateway registers an async `message` callback whose token, install and guild-payload queries can reject without a catch. Those errors escape their event callbacks as unhandled promise rejections instead of producing the existing failure event; under Node's default behavior they can terminate the backend process.
- **Action:** Wrap each detached listener body in a common error boundary or attach a final catch that logs the failure and emits a stable persistence error. Await and handle adapter room operations, add database and adapter rejection regressions for every named handler, and audit the remaining detached socket listeners for the same pattern.

### R128 · Medium · Concurrent image-slot fills both succeed and silently overwrite one another

- **Location:** `server/backend/src/domain/imageSlotFillOps.ts:61-103`; update helper at `server/backend/src/domain/echoMessagesDal.ts:1539-1585`.
- **Evidence:** A fill reads the current JSON, verifies the slot is empty in application memory, then performs an unconditional update. Two concurrent requests can both patch the same empty snapshot and both return success; the later update replaces the first image, while the losing upload can remain orphaned and its client has already been told the fill succeeded.
- **Action:** Make the fill a compare-and-set using the prior document/version or lock the message row in a transaction, and return `slot_already_filled` to the loser. Add a deterministic two-fill concurrency regression and verify losing storage is released or made reclaimable.

### R129 · Medium · Concurrent sends bypass the server spam filter

- **Location:** `server/backend/src/domain/echoStore/servers/serverSpamFilter.ts:49-106`; socket caller at `server/backend/src/sockets/chatMessageHandler.ts:444-476`; REST caller at `server/backend/src/api/routes/echo/messages.ts:1120-1148`; webhook caller at `server/backend/src/services/channelWebhooks/echoChannelWebhookExecute.ts:338-361`.
- **Evidence:** The filter counts already-persisted burst and duplicate messages, returns an admission decision, and leaves each caller to persist later. Concurrent sends from one or several sockets, REST requests, or webhooks can all observe the same below-limit history and then insert, exceeding both the five-message burst threshold and duplicate threshold. No reservation, per-user serialization, or database constraint bridges the check and write.
- **Action:** Reserve spam-filter capacity atomically before persistence, or serialize check and insert per server/user in shared storage, with rollback for failed writes. Add concurrent burst and duplicate regressions across socket and HTTP paths.

### R130 · Medium · Webhook delivery IDs are burned before durable processing

- **Location:** `server/backend/src/api/routes/discordBotHook.ts:45-88`; the same ordering appears in `server/backend/src/api/routes/discordBridgeHook.ts:78-103`, `server/backend/src/api/routes/discordPresenceHook.ts:35-69`, `server/backend/src/api/routes/discordVoiceMirrorHook.ts:33-63`, and the LiveKit receiver at `server/backend/src/api/routes/livekitWebhook.ts:159-530`.
- **Evidence:** Each signed Discord route inserts the delivery ID into replay storage before validating the body, checking database availability, or committing its side effects. If validation, pool acquisition, or any later database operation fails, retrying that same legitimate delivery returns `409 WEBHOOK_REPLAYED` for the full replay TTL even though processing never completed. The bot deliberately reuses one delivery ID across transport retries, so an ambiguous lost response after early consumption has the same failure mode. LiveKit similarly records the signed body in its replay cache before all participant, track, audit and E2EE mutations; a database failure burns the event and a retry returns successful `duplicate: true` without completing it.
- **Action:** Track delivery state transactionally as processing/completed, allow safe retries after pre-commit failure, and mark completion only with the durable mutation. Make handler effects idempotent for ambiguous post-commit retries and add failures before validation, before commit, and after commit to the webhook contract tests.

### R131 · Low · The room-finished E2EE regression never calls the room-finished handler

- **Location:** `server/backend/src/tests/voice/echo.voiceE2eeRoomFinished.integration.ts:30-101`.
- **Evidence:** The test inserts a participant and MLS group, then merely reads both and asserts the group still exists. Its comment says the `room_finished` handler must skip purge, but no webhook handler or equivalent production cleanup function is invoked. It later deletes the participant and calls `resetMlsGroupForChannel` directly, so the test passes regardless of whether a stale LiveKit `room_finished` event would wipe an active joiner's MLS state.
- **Action:** Invoke the real signed LiveKit webhook path, or extract and call the exact production room-finished routine, for both participant-present and empty-channel cases. Assert the production side effects rather than reproducing the intended branch manually.

### R132 · Medium · Stage speak requests are checked and resolved non-atomically

- **Location:** `server/backend/src/domain/echoStore/voice/stageSpeak.ts:14-48,79-110`; response side effects at `server/backend/src/api/routes/echo/voice.ts:1270-1330`.
- **Evidence:** Request creation selects for an existing row and later inserts, so simultaneous requests can both pass the check and one fails with an uncaught primary-key error instead of `already_requested`. Resolution likewise selects the pending row, separately promotes the participant, and only then deletes the request. Concurrent approve and reject operations can both return success while approval still promotes a request another moderator rejected; concurrent approvals can both return `ok` and each write an audit entry, publish a roster delta, and invoke LiveKit synchronization.
- **Action:** Claim/delete a pending request atomically with `DELETE ... RETURNING` inside a transaction, then apply the single winning decision and its side effects through an idempotent outbox. Use `INSERT ... ON CONFLICT DO NOTHING RETURNING` for creation and add simultaneous request, approve/approve and approve/reject regressions.

### R133 · Medium · Google unlink can destroy YouTube state while leaving Google linked

- **Location:** `server/backend/src/api/routes/meGoogle.ts:80-115`.
- **Evidence:** The route stops every active stage stream, deletes the YouTube channel link, and deletes the saved stream key before it calls `deleteGoogleUserLink`. If that final database operation fails, or simply finds no Google link, the request returns an error after the earlier destructive work has committed. The user can therefore remain Google-linked while all YouTube broadcast credentials and active streams are gone, with no transaction or recovery record describing the partial unlink.
- **Action:** Check that the Google link exists before destructive cleanup, delete the related database rows in one transaction, and coordinate external stream stopping through an idempotent outbox or explicit retry state. Add injected failures at every step and assert the resulting account state is either fully linked or fully disconnected.

### R134 · Medium · The custom client-IP resolver bypasses configured proxy-hop trust

- **Location:** `server/backend/src/net/clientIp.ts:28-101`; hop-aware Fastify setup at `server/backend/src/bootstrap/createFastify.ts:5-15`; security-sensitive callers include `server/backend/src/api/routes/auth/login.ts:63-69,217-223`, `server/backend/src/api/globalRateLimitKey.ts:24-31`, and `server/backend/src/sockets/resolveSocketIdentity.ts:50-59`.
- **Evidence:** Fastify computes `req.ip` with `ECHO_TRUST_PROXY_HOPS`, but whenever `ECHO_TRUST_PROXY=true` this helper ignores that result in favor of raw `CF-Connecting-IP` or the rightmost `X-Forwarded-For` address. It never uses `trustProxyHops`. In the documented Cloudflare-to-Caddy-to-Node chain, a missing Cloudflare header makes the rightmost address the proxy rather than the client, collapsing IP limits and bans; a forwarded Cloudflare header can override Fastify's validated chain unless every edge separately strips it. Socket resolution has the same Boolean-only trust model.
- **Action:** Use Fastify's already resolved `req.ip` for HTTP requests and apply the same hop-aware trusted-proxy function to socket handshakes. Accept Cloudflare-specific headers only when the immediate trusted peer is an explicitly configured Cloudflare hop. Add one-hop, two-hop, direct-access and spoofed-header regressions.

### R135 · Low · Official-server resolution caches stale hits and misses forever

- **Location:** `server/backend/src/domain/echoStore/servers/officialServerOnboarding.ts:13-46`.
- **Evidence:** The first lookup stores either a server ID or `null` in a process-global variable with no TTL or runtime invalidation. If the configured server or vanity is created after a miss, every signup and membership backfill on that process continues treating onboarding as unconfigured until restart. If the cached server is deleted or the vanity moves, callers keep using the stale ID; best-effort signup then repeatedly logs failures and the workspace official-server marker can remain wrong.
- **Action:** Use a short bounded cache with positive and negative expiry, invalidate it on relevant server and vanity mutations, and revalidate a cached ID before membership writes. Add create-after-miss, delete-after-hit and vanity-reassignment tests.

### R136 · Medium · Concurrent joins bypass the per-user server membership cap

- **Location:** `server/backend/src/domain/echoPlanEntitlements.ts:105-143`; join callers at `server/backend/src/domain/echoStore/servers/servers.ts:1170-1192,1266-1294`, official onboarding at `server/backend/src/domain/echoStore/servers/officialServerOnboarding.ts:82-100`, and server creation at `server/backend/src/api/routes/echo/servers.ts:145-187`.
- **Evidence:** The cap helper counts current memberships and returns before a separate insert. Join transactions lock only the target server row, so concurrent joins to different servers do not serialize on any shared user row; all can observe one remaining slot and commit. Server creation performs the same count before calling a separate create routine. A user can therefore exceed the plan maximum through concurrent invite, directory, official-onboarding, or create requests.
- **Action:** Serialize cap admission per user by locking the account or a dedicated entitlement row inside the same transaction as membership/server creation, then recount and insert. Add concurrent joins to distinct servers and join-versus-create regressions that permit only the remaining number of slots.

### R137 · Low · Any authenticated user can inflate the global VC activity ranking

- **Location:** `server/backend/src/api/routes/echo/vcActivities.ts:39-56`; counter at `server/backend/src/domain/echoStore/voice/vcActivityPopularity.ts:13-29`.
- **Evidence:** Each POST to an activity's `open` endpoint unconditionally increments one global count. The route validates only that the key exists and the caller is authenticated; it has no route-specific rate limit, per-user dedupe, launch proof, or time bucket. Replaying requests for one key can therefore move that activity to the top of the popularity-ordered library for every user without opening it.
- **Action:** Record bounded per-user/day opens or deduplicate launches within a window, add a route-specific rate limit, and derive the ranking from distinct or capped users rather than unlimited raw events. Test repeated calls from one account versus opens from distinct accounts.

### R138 · Low · Concurrent reaction toggles collapse into one state change

- **Location:** `server/backend/src/domain/echoStore/messages/messageReactionPersistence.ts:60-71`; helpers at `server/backend/src/domain/echoMessagesDal.ts:615-654`.
- **Evidence:** Toggle first selects whether the user's reaction exists, then separately inserts with `ON CONFLICT DO NOTHING` or deletes it. Two simultaneous toggles can both observe the same initial state and take the same branch, so toggling twice from two tabs leaves the reaction changed once instead of returning it to its original state. Both requests report success and can broadcast inconsistent snapshots depending on timing.
- **Action:** Implement toggle as one serialized database operation, such as a transaction that locks a stable message/user key before rechecking and mutating. Return the committed aggregate snapshot and add absent-to-two-toggles and present-to-two-toggles concurrency regressions.

### R139 · Medium · A message can be edited after a concurrent delete

- **Location:** `server/backend/src/domain/echoStore/messages/messageOps.ts:53-92`; SQL helpers at `server/backend/src/domain/echoMessagesDal.ts:1512-1585`; prevalidated socket path at `server/backend/src/sockets/messageEditDeleteHandler.ts:150-228`.
- **Evidence:** Edit authorization and the deleted flag are read before moderation and body preparation, then the final update matches only message and channel IDs. A moderator or the author can delete the message during that window; the edit still rewrites the retained content and returns `ok`, and the socket path broadcasts `message:updated` for the already-deleted row. This also lets an author race moderation deletion to change evidence retained in the soft-deleted record.
- **Action:** Add `deleted_at IS NULL` to both update statements, return and check the affected row count, and report a lost race as not found or forbidden. Add a deterministic edit-versus-delete regression for legacy and JSON bodies.

### R140 · Low · Failed realtime eviction leaves removed users subscribed to typing pulses

- **Location:** `server/backend/src/platform/echoRealtimeMembership.ts:13-42`; direct typing fan-out at `server/backend/src/sockets/typingHandler.ts:55-129`; membership-removal caller at `server/backend/src/api/routes/echo/servers.ts:370-384`.
- **Evidence:** After membership removal, eviction must query every server channel before it can leave those rooms. Any database failure is swallowed after leaving only the server room, so the user's sockets remain in all channel rooms. Normal message fan-out reauthorizes recipients, but typing pulses use `socket.to(channelId).emit` directly and do not recheck recipients; the removed user therefore continues receiving sender identity, display name, avatar and typing activity until disconnect or successful eviction.
- **Action:** Evict all channel rooms without depending on a post-removal database query, or retain a reliable membership-to-room index and retry failed cleanup. Route typing through the authorization-aware fan-out path or validate every recipient, and add an injected-query-failure regression after a leave or ban.

### R141 · Medium · Concurrent ringtone registrations bypass the plan limit

- **Location:** `server/backend/src/api/routes/echo/userRingtones.ts:117-199`; persistence at `server/backend/src/domain/echoStore/emoji/userRingtones.ts:44-100`; schema at `server/backend/src/db/echoTables.ts:624-636`.
- **Evidence:** Registration counts a user's saved ringtones, compares the count with the plan maximum, and later inserts a row with no shared lock or database constraint. Concurrent requests can all observe the same remaining slot and commit, exceeding the monetized plan entitlement. The per-user HTTP rate limit allows enough requests for this race and does not make count plus insert atomic.
- **Action:** Serialize admission per user inside one transaction and recount immediately before insert, or enforce slots with a database-backed allocation constraint. Add concurrent registrations with one remaining slot and assert exactly one succeeds.

### R142 · Medium · Global upload hashes make identical uploads unusable for later users

- **Location:** `server/backend/src/services/uploads/echoUploadDedupe.ts:33-139`; schema at `server/backend/src/db/echoTables.ts:2327-2349`; Watch Together lookup at `server/backend/src/api/routes/echo/uploads.ts:1744-1755`.
- **Evidence:** `sha256_hex` is the table's global primary key and registration silently ignores every conflict, but all lookup and ownership checks require the row's `uploader_id` and often its storage key. Once one user registers a hash, a second user's byte-identical upload cannot create its own row and cannot retrieve the first user's row. Watch Together then returns `Upload not found` for the second user's newly uploaded object, leaving it unusable and potentially orphaned.
- **Action:** Key owned registrations by uploader and storage key, with a separate content hash index for dedupe candidates, or explicitly create an ownership reference to the canonical object. Add two-user identical-hash coverage through registration and Watch Together library admission.

### R143 · Low · The RBAC integration test reads outside its own transaction

- **Location:** `server/backend/src/tests/permissions/echo.rbac.integration.test.ts:13-16,23-75,91-124`.
- **Evidence:** Fixture rows are inserted through a checked-out `PoolClient` inside an uncommitted transaction, but every `evaluatePermissionSet` call receives the pool. PostgreSQL therefore runs those reads on another connection that cannot see the fixtures, so the test fails before exercising the intended category, channel, owner and administrator behavior (or can accidentally inspect colliding stale rows). The final rollback guarantees the setup is never visible outside the client.
- **Action:** Pass the transaction client through permission evaluation by accepting a common queryable type, or commit isolated uniquely named fixtures and delete them in `finally`. Add this test to the required database suite so the regression cannot silently remain skipped.

### R144 · Medium · Moderation actions can commit without an audit record or workspace event

- **Location:** `server/backend/src/domain/echoStore/safety/moderation.ts:57-140`; orchestration at `server/backend/src/services/echoModerationOps.ts:64-146`.
- **Evidence:** Ban, kick, timeout and unban mutations commit through independent pool queries before the service inserts its audit record and publishes the workspace event. Ban also performs IP-ban changes, membership removal, realtime eviction, optional message purging and LiveKit removal in separate steps. If any later database operation rejects, the route reports failure even though some or all enforcement already took effect, and an audit insert failure leaves that action permanently unaudited and without the event clients use to refresh authorization state.
- **Action:** Put the database mutation, audit record and durable workspace outbox row in one transaction, then perform external cleanup idempotently from the committed event. Record retryable state for message purge and LiveKit removal, and add injected failures between every stage.

### R145 · Medium · An embedded first occurrence hides a later banned-word match

- **Location:** `server/backend/src/domain/echoStore/bannedWords/matcher.ts:92-113`.
- **Evidence:** For each banned term the matcher calls `indexOf` once and checks word boundaries only around that first occurrence. If it is embedded in a larger word, the code moves to the next term instead of searching again. For example, a configured term `bad` does not match `badminton bad`: the first `bad` fails the trailing boundary and the later standalone occurrence is never inspected, allowing messages that visibly contain a blocked term.
- **Action:** Iterate through every occurrence until one satisfies both boundaries, or tokenize normalized text once and compare tokens. Add regressions for embedded-then-standalone, repeated embedded occurrences, punctuation and Unicode-adjacent text.

### R146 · Low · The realtime status probe reports a stalled NATS connection as healthy

- **Location:** `server/backend/src/services/statusPage/probe.ts:117-135`.
- **Evidence:** When NATS is configured, the probe only checks that the local connection object exists and is not closed. It performs no flush, request or round trip, and computes latency from that in-memory check, so a disconnected, stalled or partitioned connection can remain `ok` with near-zero latency while realtime fan-out is unavailable. The degraded threshold can never measure broker performance as labeled.
- **Action:** Issue a bounded NATS flush or request against a probe responder and measure its completion time. Treat timeout, draining and reconnecting states as unavailable or degraded, and test a live object whose network path no longer responds.

### R147 · Medium · Concurrent Watch Together uploads bypass the per-session byte quota

- **Location:** `server/backend/src/services/watchTogether/vcWatchTogetherSessions.ts:55-111`; upload callers at `server/backend/src/api/routes/echo/uploads.ts:755-762,1271-1277,1769-1789`.
- **Evidence:** Quota admission reads `bytes_used` and returns success without reserving bytes. Registration later calls a separate unconditional `bytes_used = bytes_used + n` update, and the presign path can be separated from it by the entire upload duration. Concurrent uploads can all observe enough remaining space and then all increment, taking the session beyond `ECHO_WATCH_TOGETHER_MAX_SESSION_BYTES`; even the final update has no maximum predicate.
- **Action:** Reserve bytes atomically with `UPDATE ... WHERE bytes_used + n <= max RETURNING`, tie reservations to upload intents, and release abandoned or failed reservations. Make registration consume its reservation idempotently and add concurrent near-cap uploads.

### R148 · Low · Browser test harnesses expose live session credentials in shared temporary files

- **Location:** `server/backend/src/tests/helpers/imageSlotFillHarness.ts:9-11,124-136`; `server/backend/src/tests/helpers/messageListLayoutHarness.ts:11-12,134-145`.
- **Evidence:** Both long-running harnesses write an authenticated session ID and CSRF token to predictable `/tmp` paths with `writeFileSync` defaults, which are commonly world-readable under a `022` umask. They also print the complete credential payload to stdout. Another local account or colocated process can reuse those credentials against the still-running localhost server and mutate the test account's data.
- **Action:** Create a mode-`0600` file inside a mode-`0700` random directory, avoid printing secrets, reject pre-existing symlinks, and delete the credential artifact during shutdown. Add a permissions assertion before launching the browser.

### R149 · Medium · Welcome-notice enrichment failures become unhandled rejections

- **Location:** `server/backend/src/services/echoMemberJoinWelcomeNotice.ts:127-161`; detached callers at `server/backend/src/domain/echoStore/servers/servers.ts:31-43` and `server/backend/src/domain/echoStore/servers/officialServerOnboarding.ts:108-119`.
- **Evidence:** The helper catches configuration, channel, label and insert failures, but after inserting the system message it awaits message reload and author-label enrichment outside any catch. Both production callers invoke the helper with `void` and no terminal rejection handler. A database failure in either post-insert query therefore escapes as an unhandled promise rejection after the join has succeeded and the notice has been persisted; under Node's default behavior it can terminate the backend process.
- **Action:** Put a terminal error boundary around the entire best-effort helper or attach a catch at each detached caller. Log post-insert delivery failures with the message ID and add rejected reload and enrichment regressions.

### R150 · Medium · One HTTP presence update performs a serial query per connected user

- **Location:** `server/backend/src/services/echoSocialOps.ts:35-67`; batch equivalent at `server/backend/src/domain/echoStore/social/social.ts:102-151`; route at `server/backend/src/api/routes/echo/social.ts:399-420`.
- **Evidence:** After persisting status, the HTTP path loops over every connected user and awaits `filterVisibleEchoUserIds` once per viewer. That helper runs a database query, making one presence change O(number of connected accounts) sequential round trips and holding the request open for their combined latency. The socket path already calls `filterEchoViewersWhoCanSeeSubject` once for the complete viewer set, demonstrating the intended single-query operation.
- **Action:** Reuse the batch subject-to-viewers query, emit after the one result returns, and cap or chunk exceptionally large viewer sets. Add a query-count regression with many connected viewers.

### R151 · Medium · YouTube Watch Together usage enforcement trusts optional client reports and fails open

- **Location:** `server/backend/src/api/routes/echo/vcActivities.ts:59-124`; `server/backend/src/services/watchTogether/youtubeWatchTogetherUsageBudget.ts:82-130`.
- **Evidence:** The authenticated client chooses every billed `elapsedSec` value from 1 to 600 and can omit the usage request altogether, so it can watch without consuming its own daily allowance. Conversely, one account can repeatedly report 600 seconds without proving playback and exhaust the global daily counter for every user. Redis absence, command failure, and even a malformed Lua response all return `ok: true` with zero usage; the POST response nevertheless reports `redisAvailable: true` whenever a URL string is configured, including when that Redis connection is failing.
- **Action:** Meter active playback from server-owned session state with bounded heartbeats and idempotent intervals, cap each user's contribution to global exhaustion, and fail closed when production budgets are enabled but the atomic counter is unavailable. Report actual Redis success and add missing-report, forged-report, outage and malformed-response regressions.

### R152 · Low · Invalid HTTP presence values silently set the user online

- **Location:** `server/backend/src/domain/echoPresenceAuthority.ts:34-68`; route at `server/backend/src/api/routes/echo/social.ts:396-417`.
- **Evidence:** HTTP signals replace any failed normalization with `online`. The route then tests whether the returned state is absent, but that branch is unreachable for arbitrary strings: a value such as `away` becomes a successful `204` update to `online` instead of `400 INVALID_STATUS`. This hides client errors and can unexpectedly expose a user as online.
- **Action:** Distinguish a missing or blank status, if that default is intentional, from a nonempty invalid value. Validate before applying the default and add unknown, whitespace, alias and canonical status route tests.

### R153 · High · The message-ID backfill can duplicate IDs and leave references dangling

- **Location:** `server/backend/src/scripts/backfillMessageUuidToSnowflake.ts:25-43,92-148`; omitted references at `server/backend/src/db/echoTables.ts:539,548-563,2431-2453`.
- **Evidence:** Once more than 4,096 messages share one millisecond, the generator increments only its local `ms`; the original timestamp's counter remains over the limit, so every later row repeats sequence zero in the same next millisecond and collides. The migration also disables foreign-key triggers and updates only reactions, pins, poll votes, read state, replies and forwards. It omits `echo_user_reports.message_id`, `echo_message_reports.message_id`, and the foreign-key-backed Discord import mirror queue. Restoring `session_replication_role` does not retroactively validate those changed rows, so a successful run can retain report IDs and queued jobs that point at messages that no longer exist.
- **Action:** Generate and persist a complete old-to-new mapping with sequence carry across dense timestamps, update every schema reference from that mapping in one migration transaction, and keep or explicitly revalidate constraints. Add a schema-driven reference audit plus more-than-4,096-same-millisecond, report, and mirror-queue migration tests.

### R154 · Medium · The stale-presence sweep can overwrite a concurrent heartbeat

- **Location:** `server/backend/src/domain/echoStore/members/presence.ts:7-36`; heartbeat path at `server/backend/src/sockets/presenceHandler.ts:68-107`.
- **Evidence:** The sweep first selects stale user IDs and then performs a separate unconditional update. A heartbeat can refresh `updated_at` between those statements and still be overwritten to offline. Subsequent heartbeats call `touchEchoPresence`, see that the row exists, and return without restoring its status, so the actively connected user can remain offline until another explicit presence-set event.
- **Action:** Mark rows offline in one `UPDATE` whose `WHERE` clause includes the stale cutoff and return only rows actually changed. Use database time consistently, and make a heartbeat resolve an existing offline row back to the authenticated active status. Add a deterministic sweep-versus-heartbeat race test.

### R155 · High · The test-cleanup script can delete legitimate servers and accounts

- **Location:** `server/backend/src/scripts/cleanupTestServers.ts:21-50,60-84,87-135`.
- **Evidence:** Applying the script classifies persistent data using broad, user-controlled names. Any server whose name starts with `Layout`, `Slot`, or `e2e`, or merely contains `E2EE`, can be deleted; accounts with ordinary prefixes such as `csrf_`, `layout_`, `slot_`, or `mls_` are candidates for hard deletion. The command connects to the configured database with no nonproduction assertion, creation-age check, durable test marker, exact ID manifest, or confirmation beyond `--apply`; only one hardcoded server ID is protected.
- **Action:** Select only rows bearing an immutable test-run marker or exact generated-ID manifest, refuse production-shaped databases, require a reviewed two-step deletion plan, and perform revalidation and deletion transactionally. Test legitimate matching names and stale manifests before permitting apply mode.

### R156 · Low · Older Discord presence snapshots overwrite newer state

- **Location:** `server/backend/src/domain/discord/discordPresenceRepo.ts:23-50`.
- **Evidence:** The conflict update always replaces status, activities, online state and timestamp, even when `EXCLUDED.snapshot_at` predates the stored snapshot. Delayed or retried signed deliveries can therefore regress a user from a newer presence state to an older one until another snapshot arrives.
- **Action:** Add a conflict-update predicate requiring the incoming timestamp to be at least the stored timestamp, define the equal-timestamp tie rule, and test new-then-old delivery order.

### R157 · Medium · Service-driven message edits bypass authorized cluster fan-out

- **Location:** `server/backend/src/services/echoMessageEditDeleteOps.ts:76-97`; authorized transport at `server/backend/src/sockets/channelBroadcast.ts:7-25`; callers at `server/backend/src/api/routes/echo/messages.ts:1479-1499` and `server/backend/src/api/routes/discordApi/rest/messages.ts:375-395`.
- **Evidence:** The REST and Discord API edit service emits `message:updated` with raw `io.to(channelId).emit`, while socket edits and deletes use `broadcastToEchoChannel`. The raw path neither reauthorizes each local room member nor publishes through the repository's cross-node fan-out transport. Clients connected to other gateway nodes can miss edits, while a stale or incorrectly retained local room membership can receive the edited message body and attachments without a current access check.
- **Action:** Send service-driven edits through `broadcastToEchoChannel`, as the socket edit and delete paths do. Add a two-node edit-delivery regression and a revoked-member test proving edited content is not disclosed.

### R158 · Medium · Image-search quotas fail open during a configured Redis outage

- **Location:** `server/backend/src/services/search/serperGlobalUsageBudget.ts:41-51,92-160`; `server/backend/src/services/search/serperUserSearchQuota.ts:75-146`; enforcement at `server/backend/src/api/routes/serperImageSearch.ts:327-381`.
- **Evidence:** Production global limits fail closed only when the Redis URL is absent. If the URL is configured but Redis is unreachable, the catch returns an allowed reservation with zero usage; malformed Lua output is also accepted. The per-user daily plan quota independently returns an allowed, uncounted search for Redis errors or malformed output. During an outage every cold request can therefore bypass both the paid upstream global cap and each account's plan limit while still invoking Serper.
- **Action:** Treat Redis command and response failures as quota-service unavailability whenever production caps are enabled, and return a service-unavailable response distinct from a consumed quota. Use one validated reservation result across the request and add configured-but-refused, timeout, malformed-response and recovery regressions for global and per-user counters.

### R159 · Low · Giphy transport failures skip the configured Klipy fallback

- **Location:** `server/backend/src/services/search/gifProviders.ts:102-131,133-190`; route handling at `server/backend/src/api/routes/giphy.ts:41-90`.
- **Evidence:** The provider helpers convert non-OK responses and JSON errors to `null`, but do not catch `fetch` rejection or timeout. When Giphy is configured as primary and its connection fails, the rejection escapes immediately; the Klipy branch is never reached and the route returns `502` despite a healthy configured fallback.
- **Action:** Catch bounded transport failures inside each provider attempt, log them, and continue to the next configured provider. Add rejected-fetch and timeout tests for both trending and search, including fallback success and all-providers-failed cases.

### R160 · Low · Discord-compatible updates silently ignore advertised fields

- **Location:** `server/backend/src/api/routes/discordApi/rest/channels.ts:121-196`; member update at `server/backend/src/api/routes/discordApi/rest/guilds.ts:352-423`.
- **Evidence:** Channel PATCH explicitly accepts `topic` and `position`, but the update builder processes only `name` and `nsfw`. Member PATCH similarly advertises `mute` and `deaf` yet reads only nickname and roles. Requests containing only these fields return `200` with unchanged state rather than applying them or rejecting them as unsupported, so bot callers cannot distinguish a successful mutation from a no-op.
- **Action:** Implement topic and position updates with the same validation and ordering semantics as native channel mutations, or reject unsupported fields with a clear Discord-compatible validation error. Add one-field and mixed-field route regressions.

### R161 · High when enabled · Honcho memory routes accept unowned sessions and peers

- **Location:** `server/backend/src/api/routes/honchoMemory.ts:83-204`; forwarding helpers at `server/backend/src/services/honcho/memory.ts:17-102`.
- **Evidence:** Login is required, but callers choose an arbitrary session ID and peer map when creating sessions, can write as themselves into any supplied session, and can pass arbitrary session and target peer IDs to chat. None of the routes checks channel access, stored session ownership, or target visibility. Echo also syncs messages under raw channel IDs in the same shared Honcho workspace, making a known private channel ID a meaningful cross-account target. This defect was independently reproduced by the repository's targeted security review with a recording SDK stub.
- **Action:** Persist and enforce each session's audience. Check current channel access for channel-backed sessions, derive the calling peer from authentication, restrict peer additions and targets to the authorized audience, and namespace personal sessions by account. Bound all forwarded IDs, maps, metadata and content, and add attacker/victim route tests.

### R162 · Medium · Linked roles bypass assignment permission and hierarchy checks

- **Location:** `server/backend/src/domain/echoStore/roles/roleLinks.ts:19-69`; assignment callers at `server/backend/src/domain/echoStore/roles/selfAssignableRoles.ts:451-483` and `server/backend/src/domain/echoStore/roles/roles.ts:1010-1037`.
- **Evidence:** Direct self-assignment and moderator assignment validate only the selected seed role, then `applyEchoRoleLinksAfterAssignment` recursively inserts every linked role without checking its permissions or position. A low self-selectable role linked to a role that later gains `ADMINISTRATOR`, or a low role assigned by a limited moderator, therefore grants the elevated linked role while bypassing the checks that reject direct assignment. Link creation currently checks both endpoints, but later permission and hierarchy changes can make a previously valid graph unsafe.
- **Action:** Resolve the complete linked-role closure before mutation and apply the same grant-set, hierarchy and self-assignment policy to every implied role in one transaction. Revalidate or reject role-link and role-permission changes that would make existing assignment paths unsafe, and add elevated-link and post-link-permission-change regressions.

### R163 · Low · Concurrent safety reports bypass the 24-hour duplicate guard

- **Location:** `server/backend/src/domain/echoStore/safety/safetyReports.ts:39-65,105-145,154-219`.
- **Evidence:** User and message reports each query for a recent duplicate and then insert in a separate statement with no lock or uniqueness constraint. Concurrent requests from the same reporter can all observe no prior row and create duplicate moderation cases within the intended 24-hour cooldown; every successful insert can also trigger a separate support email.
- **Action:** Claim the cooldown atomically, for example with a dedicated reporter/target bucket key and `INSERT ... ON CONFLICT`, or serialize and recheck inside a transaction. Add simultaneous user-report and message-report regressions asserting one row and one notification.

### R164 · Low · Invite voice previews ignore retained legacy permission denies

- **Location:** `server/backend/src/domain/echoStore/community/invites.ts:164-216`; legacy fallback in `server/backend/src/domain/permissions/echoPermissionEvaluate.ts:164-231`.
- **Evidence:** The public invite preview decides whether to expose a requested voice channel by checking the `@everyone` base role and normalized overwrite rows only. The permission evaluator still supports legacy category and channel JSON overrides when no normalized rows exist. A channel denied by one of those retained legacy blobs can therefore have its ID and name disclosed in an unauthenticated invite preview even though the effective access calculation denies it.
- **Action:** Evaluate the requested channel through the same global or pre-join permission plan used for real access, including normalized rows and legacy fallback, rather than reproducing part of RBAC in SQL. Add category-legacy, channel-legacy and normalized-row preview tests.

### R165 · Low · Concurrent Paper share reads can return an immediately invalid token

- **Location:** `server/backend/src/domain/echoStore/paper/paperShare.ts:54-65`; route callers at `server/backend/src/api/routes/echo/paper.ts:137-161,215-235`.
- **Evidence:** Token creation reads the row, generates a token, performs an unconditional update and returns its locally generated value. Two first reads of a global Paper can both observe no token and write different values; the earlier request returns a URL containing its losing token, which stops resolving as soon as the later write commits.
- **Action:** Create the token with a compare-and-set update and return the persisted winner, or use one `UPDATE ... WHERE token IS NULL RETURNING` followed by a reload. Add a deterministic concurrent first-read regression proving all returned links resolve.

### R166 · Medium · Discord import voice setup commits partial mirror state

- **Location:** `server/backend/src/services/discordImport/discordImportPostSetup.ts:151-179`.
- **Evidence:** For each imported voice channel the post-setup routine separately enables the voice-mirror row, marks the channel mirror-only, and applies a deny-connect overwrite. A failure after either earlier statement is caught and reported while those mutations remain committed. The server can therefore advertise a partially enabled mirror, or mark a channel mirror-only without the permission deny that prevents ordinary Echo joins.
- **Action:** Apply the three local database mutations in one transaction and invalidate permission state only after commit. Make retries idempotent and add injected failures after each statement that assert the channel remains wholly unchanged or wholly configured.

### R167 · Medium · A role mention launches unbounded per-recipient push queries and snapshots

- **Location:** `server/backend/src/services/echoMessagePushNotify.ts:89-159,161-232`.
- **Evidence:** Server-message push first loads role assignments for the whole server, then uses unbounded `Promise.all` across every member of a mentioned role. Each recipient independently performs access, preferences, channel-override and server-level queries; APNs badge users additionally rebuild their full attention snapshot. One allowed role mention in a large server can therefore launch thousands of concurrent database operations and full workspace scans from a single message, exhausting the pool and delaying unrelated requests.
- **Action:** Resolve eligible recipients and their notification settings in bounded bulk queries, compute unread badge data in batches or asynchronously, and feed a rate-limited durable push queue. Add query-count and concurrency regressions for a large mentioned role.

### R168 · Medium · Permission cache retry exhaustion stores a stale authorization result

- **Location:** `server/backend/src/domain/permissions/echoPermissionCache.ts:211-244`.
- **Evidence:** A cache miss retries computation four times when the server generation changes during a database fold. If the fourth attempt also overlaps an invalidation, `computeConsistent` returns that known-inconsistent result anyway, and the following continuation unconditionally caches it for five minutes. Despite the module's stated generation guarantee, a burst of role, membership or overwrite mutations can therefore repopulate access permissions calculated across stale state after the invalidations have already run.
- **Action:** Return the generation alongside a successful stable computation and cache only that case. After retry exhaustion, return an uncached result or fail closed and force a fresh request. Add a controlled invalidation on every attempt and assert no stale value enters the cache.

### R169 · Medium · Forum post creation can leave an empty channel with uncopied permissions

- **Location:** `server/backend/src/services/channelWebhooks/echoChannelWebhookRouting.ts:126-171`; webhook execute path at `server/backend/src/services/channelWebhooks/echoChannelWebhookExecute.ts:276-308,396-479`; authenticated route at `server/backend/src/api/routes/echo/channels.ts:194-317`.
- **Evidence:** Creating a new forum post first commits a child text channel and then copies the forum hub's permission overwrites in a separate operation. If the copy fails, the request rejects but the child channel remains with its creation defaults. Both the webhook and authenticated route create the channel before validating or persisting the first message, so invalid content, moderation denial, attachment rejection or storage failure leaves an empty post; persisted files can be orphaned in the webhook path as well. A retry creates another channel rather than repairing the first one.
- **Action:** Create the post channel and copy every normalized and legacy permission layer in one database transaction, then return the channel only after commit. Delete or reuse a reserved child on downstream message failure, and add an injected overwrite-copy failure regression that proves no visible channel remains.

### R170 · Medium · Discord role resync can revoke a manually retained assignment

- **Location:** `server/backend/src/domain/discord/discordImportParity.ts:52-100`.
- **Evidence:** Imported grants are tracked separately, but the resync removes rows from the provenance-free `echo_member_roles` table by role ID before rebuilding the imported set. If an administrator manually assigns or retains the same imported role for the linked Echo user after Discord removes it, the next forced member import includes that role in `tracked`, deletes the only assignment row, and omits it from `desired`. The code cannot distinguish removing the previous Discord grant from revoking an independently intended Echo assignment.
- **Action:** Store grant provenance in the assignment model, or otherwise preserve explicit local grants, and add a resync regression where a tracked role is also locally retained.

### R171 · Medium · Forum posts cannot be unarchived through the advertised patch contract

- **Location:** `server/backend/src/domain/echoStore/community/forums.ts:187-225`; route forwarding at `server/backend/src/api/routes/echo/channels.ts:334-382`.
- **Evidence:** The patch type and HTTP route explicitly accept `archivedAt: null` to clear the archive timestamp. The DAL converts that value to SQL `NULL` and assigns `forum_post_archived_at = COALESCE($5, forum_post_archived_at)`, so PostgreSQL keeps the old timestamp instead. The request reports success while the post remains archived and excluded from ordinary forum listings.
- **Action:** Pass a separate “field present” flag and use a `CASE` expression, or build the update dynamically so explicit `NULL` clears the column while omission leaves it unchanged. Add archive, unarchive and omitted-field regressions through the route.

### R172 · Low · Rejected Paper watch IDs accumulate forever in a process-wide map

- **Location:** `server/backend/src/sockets/paperWatchHandler.ts:36-40,103-125,257-260`.
- **Evidence:** Every authenticated `paper:watch` payload writes the user/channel pair into `joinRate` before checking whether the channel exists. Entries have no expiry and are not removed on unwatch or disconnect; only the test reset clears the map. A connected account can therefore send unbounded unique strings, all of which fail the existence check but remain resident for the life of the backend process.
- **Action:** Validate and bound the identifier before admission, use a bounded TTL limiter keyed by user, and remove expired state independently of socket cleanup. Add a regression that floods nonexistent IDs and verifies bounded retained state.

### R173 · Medium · The durable workspace outbox marks failed fan-out as delivered

- **Location:** `server/backend/src/platform/echoPlatformEvents.ts:83-112`; recovery contract in `server/backend/src/domain/echoStore/platform/workspaceEventOutbox.ts:16-82`.
- **Evidence:** Immediate dispatch and outbox persistence are launched as unrelated detached promises. The persistence chain marks its new processing row delivered as soon as the insert succeeds, without awaiting or observing `dispatchEchoWorkspaceEvent`. If socket enumeration, permission evaluation or adapter fan-out rejects, the dispatch branch only logs while the outbox row is already terminal and cannot be claimed by the recovery drain. A process exit before the detached insert also loses the supposedly durable event entirely.
- **Action:** Persist a pending outbox row as part of the state-changing transaction, have one delivery owner claim and dispatch it, and mark it delivered only after that dispatch succeeds. Add rejection and process-interruption regressions proving the drain reclaims the row.

### R174 · Medium · Concurrent channel moves can commit a mixed, duplicate ordering

- **Location:** `server/backend/src/domain/echoStore/channels/channelTreeMove.ts:162-244`.
- **Evidence:** Placement reads the source and destination buckets without locking their rows or serializing moves for the server, then updates every sibling one statement at a time. Two transactions can calculate different permutations from the same initial order and interleave per-row writes; the final positions can be a mixture of both permutations, including duplicate indices and a lost move. Reading the original category before the transaction also lets a concurrent move apply against stale bucket identity.
- **Action:** Start the transaction before reading placement state and serialize affected buckets with row or advisory locks, then write positions atomically. Add same-bucket and cross-bucket concurrent move regressions that assert one deterministic permutation with contiguous unique positions.

### R175 · Medium · Toggling voice mirror destroys permissions and disabling it does not restore access

- **Location:** `server/backend/src/api/routes/echo/discordVoiceMirrorSettings.ts:295-315`; `server/backend/src/domain/discord/discordVoiceMirrorRepo.ts:429-452`.
- **Evidence:** Enabling mirror mode deletes every normalized channel overwrite, replaces them with one `CONNECT: false` everyone row, and clears the legacy permission object. Disabling removes only the mirror configuration row and flag; it leaves that deny in place and has no saved copy of the deleted settings. A routine on/off toggle therefore irreversibly erases administrator-defined permissions and leaves the voice channel inaccessible. Neither branch invalidates the permission cache, so enforcement can also lag the reported setting.
- **Action:** Preserve and restore prior permission state or represent mirror denial in a separate policy layer, mutate the mode atomically, and invalidate permission caches after commit. Add a toggle round-trip regression with role and member overwrites.

### R176 · Medium · Deleting an active Discord voice channel leaves its spawned Echo mirror forever

- **Location:** `bot/src/voiceMirrorRelay.ts:42-102`; `server/backend/src/services/discordBridge/discordVoiceMirrorIngest.ts:149-205`.
- **Evidence:** The relay unions previously active IDs into the next snapshot, but skips an ID when the Discord channel no longer exists in the guild cache. It then replaces its previous-ID set with the current active set, so that tombstone is never retried. The backend reconciles only channels present in the payload and has no absent-map sweep. If a previously active mirrored channel is deleted, its spawned Echo channel, map and last roster remain persisted indefinitely.
- **Action:** Send explicit channel tombstones, or make snapshots authoritative and sweep mapped IDs absent from a successfully delivered full snapshot. Retain deleted IDs until their removal is acknowledged, and add deletion-after-activity coverage across relay and ingest.

### R177 · Medium · Join applications trust forged attachment metadata and arbitrary public URLs

- **Location:** `server/backend/src/domain/echoStore/onboarding/applicationForm.ts:220-271`; persistence and reviewer projection at `server/backend/src/domain/echoStore/servers/serverApplications.ts:96-115,146-191`.
- **Evidence:** Attachment validation checks only that the client-supplied key begins with the applicant's textual prefix and that `publicUrl` starts with HTTP. It never verifies that the object exists, belongs to a completed upload intent, matches the URL, or has the claimed size and content type. An applicant can persist an arbitrary external URL alongside a fabricated in-prefix key and understated size; the unmodified object is then returned to server managers reviewing applications.
- **Action:** Accept an opaque upload intent or storage key only, verify ownership and object metadata server-side at submission, derive the serving URL and metadata from that record, and reject unregistered or missing objects. Add forged URL, missing object, size mismatch and cross-user attachment regressions.

### R178 · Medium · Concurrent application decisions can reject an application after admitting its user

- **Location:** `server/backend/src/domain/echoStore/servers/serverApplications.ts:246-323`.
- **Evidence:** Approval and rejection both read the pending state before their guarded update. Approval admits the applicant before attempting that update, neither path checks the update's row count, and membership, resolution and audit writes are not one transaction. If rejection wins the update while approval is joining the user, the application remains rejected but the applicant becomes a member; both reviewers receive success and both audit events may be written. A later failure can likewise leave a pending application whose user was already admitted.
- **Action:** Claim or lock the pending application before performing membership side effects, commit membership, resolution and audit atomically, and treat a zero-row guarded update as a lost decision. Add deterministic approve-versus-reject and post-join-failure regressions.

### R179 · Medium · Paper documents accept arbitrary media URLs that every viewer loads

- **Location:** `server/backend/src/domain/contentJsonValidation.ts:254-314`; rendering at `clients/web/src/features/paper/editor/paperShapeUtils.ts:152-153` and the Paper image and shape node views.
- **Evidence:** Paper image nodes require only a nonempty string and shape `imageSrc` accepts any string or null. The renderer places these values into image sources and CSS background images, so an editor can persist an arbitrary external tracking URL that each viewer's browser requests, exposing network metadata. This bypasses the HTTP and media-host policy already applied to message image slots. Shape fill, border color and border width are also accepted as unrestricted strings before being written to styles.
- **Action:** Validate Paper media with the shared media URL policy or store upload object identifiers and derive serving URLs. Restrict style attributes to explicit color and width grammars, and add regressions for script/data schemes, non-policy hosts, external tracking URLs and malformed style values.

### R180 · Low · A failed YouTube stream cleanup skips broadcast deletion

- **Location:** `server/backend/src/services/integrations/youtubeApiClient.ts:296-303,317-324`.
- **Evidence:** Both the missing-ingestion and bind-failure paths delete the stream and broadcast sequentially inside one `try`. If stream deletion rejects, control jumps to the catch and the broadcast delete is never attempted, leaving an orphaned broadcast and consuming the user's YouTube resources.
- **Action:** Attempt the two deletions independently with separate error handling or `Promise.allSettled`, report both cleanup failures, and add a regression where stream deletion rejects but broadcast deletion is still called.

### R181 · Medium · A forbidden role-category update is committed before authorization finishes

- **Location:** `server/backend/src/domain/echoStore/roles/roleCategories.ts:232-275`.
- **Evidence:** The category row is updated first. The function then reloads the merged defaults and can return `forbidden` when the actor may not grant the resulting permission set or enable elevated join defaults. Those checks do not roll back the already committed update, so the API reports failure after mutating the category; propagation and permission-cache invalidation are skipped as well.
- **Action:** Load and validate the complete proposed category state before writing, then update the category, propagate synchronized roles and commit in one transaction. Add a regression proving a rejected mixed/default patch leaves the row and dependent roles unchanged.

### R182 · Medium · Instance-ban creation can partially commit without its audit or session revocation

- **Location:** `server/backend/src/domain/echoStore/safety/instanceBans.ts:240-307`.
- **Evidence:** A user, IP and hardware ban are inserted as separate autocommitted statements, followed by a separate audit insert and session deletion. Failure on any later statement leaves earlier active ban rows in place while the caller receives an error; audit insertion failure creates an unaudited ban, and session-revocation failure leaves the newly banned user's existing sessions active.
- **Action:** Insert the complete ban family and audit record in one database transaction, then use a durable post-commit revocation job or surface and retry session invalidation. Add injected-failure regressions at each boundary.

### R183 · High · A Discord mention silently enrolls the mentioned account into the Echo server

- **Location:** `server/backend/src/services/translateDiscordSyncedMentions.ts:360-406`; callers at `server/backend/src/services/discordBridge/discordBridgeInbound.ts:180-202` and `server/backend/src/services/discordImport/discordMessageImport.ts:410-422`; low-level insert at `server/backend/src/domain/echoStore/servers/servers.ts:199-210`.
- **Evidence:** Mention translation resolves every linked or shadow Discord identity and calls `addEchoServerMember` for each translated user mention. That helper directly inserts membership and default roles. An inbound Discord message or historical import can therefore add another person's Echo account without their action while bypassing bans, applications, invites, member caps and normal join auditing; the comment says this is done only so mention entities survive filtering.
- **Action:** Never create membership while rendering a mention. Preserve nonmember mention text without an active entity, or use a nonmembership identity projection. Add inbound and import regressions proving mentions cannot change server membership or roles.

### R184 · High · Channel managers can bridge arbitrary Discord guilds reached by the shared bot

- **Location:** `server/backend/src/services/discordBridge/discordBridgeApply.ts:201-293`; `server/backend/src/services/discordBridge/discordBridgeWebhookEnsure.ts:31-48`; active inbound lookup at `server/backend/src/domain/discord/discordBridgeRepo.ts:252-279,302-327`; public route at `server/backend/src/api/routes/echo/discordBridgeSettings.ts:458-493`.
- **Evidence:** The route accepts client-supplied Discord guild and channel IDs and the apply service never proves they belong to the Echo server's import state or an authorized Discord guild. For outbound sync the shared bot lists or creates a webhook in the supplied channel; for inbound sync the arbitrary pair enters the bot allowlist and resolver. An Echo channel manager can consequently read mirrored traffic from, or create a webhook and send traffic into, another Discord guild anywhere the instance bot has access.
- **Action:** Bind every bridge to a server-owned, server-verified Discord guild and validate the selected channel through a fresh bot API lookup before persisting or creating a webhook. Require an authorized Discord guild binding for manual bridges and add cross-guild inbound and outbound rejection tests.

### R185 · Low · Discord API serialization encodes PIN_MESSAGES as MANAGE_MESSAGES

- **Location:** `server/backend/src/api/routes/discordApi/serializers.ts:27-79`.
- **Evidence:** `PIN_MESSAGES` is assigned bit 13, the same bit as `MANAGE_MESSAGES`, while the installed Discord API type definitions assign `PinMessages` to bit 51 and `BypassSlowmode` to bit 52. Roles with only pin permission are advertised to Discord-compatible clients as able to manage messages, and clients cannot observe the actual pin bit.
- **Action:** Encode `PIN_MESSAGES` as `1n << 51n`, source the table from the maintained Discord permission constants where possible, and add bitfield regressions for every Echo extension bit.

### R186 · Medium · Role updates can attach a role to another server's category

- **Location:** `server/backend/src/domain/echoStore/roles/roleCategories.ts:386-397`; update caller at `server/backend/src/domain/echoStore/roles/roles.ts:803-810`; schema at `server/backend/src/db/echoTables.ts:961-993`.
- **Evidence:** `resolveRoleCategoryIdForAssignment` ignores its database and server arguments and returns any nonempty string. Role creation separately checks category ownership, but role update does not. Because the foreign key references only the globally unique category ID, a manager can set a role's category to a valid category from another server, producing cross-tenant references and inconsistent ordering/default behavior.
- **Action:** Resolve only a category whose `server_id` matches the role's server, reject unknown or foreign IDs on every mutation path, and add a composite database constraint or equivalent tenant-integrity guard. Add a cross-server role-update regression.

### R187 · Low · Concurrent category creation bypasses the per-server category cap

- **Location:** `server/backend/src/domain/echoStore/roles/roleCategories.ts:103-131`.
- **Evidence:** Creation counts categories and calculates `MAX(position) + 1` in separate statements before inserting. Concurrent requests can all observe a count below 32, insert beyond the advertised cap and reuse the same position.
- **Action:** Serialize category creation per server or enforce the cap in a transaction under a server-scoped lock; assign positions under the same lock. Add a concurrent last-slot regression.

### R188 · Medium · A partial WebP backfill cannot recover and can strand inconsistent references

- **Location:** `server/backend/src/services/uploads/rasterImageWebpBackfill.ts:191-263,281-374`.
- **Evidence:** After writing the destination object, the job rewrites message, profile and intent references across many autocommitted statements, separately deletes and inserts content-type metadata, updates retention, and finally deletes the source. Any failure leaves a mixed database state. On retry, the first destination-object existence check returns `webp_key_exists` and skips all remaining repair, so partial references or missing retention metadata are never reconciled. Different source extensions sharing a basename also map to one destination key and make every later source silently skip.
- **Action:** Serialize each source migration and commit all database rewrites and metadata changes in one transaction with a durable migration state. Treat an existing destination as a resume/reconcile case after verifying its content identity, and disambiguate colliding target keys. Add failures after each step and a same-basename multi-extension regression.

### R189 · Medium · Retention purge can delete an upload that was referenced again after claim

- **Location:** `server/backend/src/services/uploads/chatUploadRetention.ts:110-176,194-219,312-381`; worker at `server/backend/src/jobs/chatUploadRetention.ts:18-33`; message registration at `server/backend/src/services/echoPersistedMessageCreate.ts:350-373`.
- **Evidence:** The worker commits an expired row as `purging`, then deletes the object outside the transaction. A concurrent message can validate and reference that object, but registration uses `ON CONFLICT DO NOTHING` and touch updates only `active` rows, so neither operation cancels the in-flight purge. The worker then deletes a now-live attachment and unconditionally marks it purged.
- **Action:** Claim with a version and revalidate reference/liveness state immediately before deletion, make registration atomically reactivate or reject a purging object, and mark purged only with the claimed version. Add a deterministic claim-versus-new-message regression.

### R190 · Low · Ticket configuration persists malformed nested values that break ticket operations

- **Location:** `server/backend/src/api/routes/echo/tickets.ts:44-110`; persistence and use at `server/backend/src/domain/echoStore/community/tickets.ts:67-126,144-163`.
- **Evidence:** The route casts arbitrary arrays to handler roles, form fields and ticket categories, and casts channel/category values without checking their type, membership or shape. The store writes the values directly. For example, a manager can persist `ticketCategories: [null]`; later ticket creation evaluates `c.id` for each entry and throws instead of returning a validation error. Oversized or malformed forms and foreign channel/role IDs are likewise accepted into shared configuration.
- **Action:** Validate the complete configuration against a bounded schema, verify referenced channels, categories and roles belong to the server, and reject malformed patches before merging or writing. Add null entry, wrong scalar, foreign ID, length and size regressions.

### R191 · Medium · Server create and leave can commit before their audit and response succeed

- **Location:** `server/backend/src/api/routes/echo/servers.ts:173-211,341-418`.
- **Evidence:** Creation commits the new server and owner membership before inserting its audit. If that insert fails, the route returns an error while the server remains created, so a retry can create another server. Leave deletes membership first, then performs realtime eviction and inserts its audit; any failure after deletion returns an error even though the user has left, and may omit the audit and membership event. These steps have no transaction or durable post-commit delivery state.
- **Action:** Commit database state and audit atomically, then publish realtime effects from a durable outbox. Return a stable idempotency result for retried creation and leave requests, and add injected failures after each committed step.

### R192 · Low · Concurrent opposite-direction friend requests create duplicate relationships

- **Location:** `server/backend/src/domain/echoStore/social/social.ts:249-266`; schema at `server/backend/src/db/echoTables.ts:432-439`.
- **Evidence:** Friend creation checks both orientations and later inserts one directed row. The only unique constraint covers the ordered `(user_id, peer_id)` pair. If two users request each other concurrently, both checks see no row and both opposite-direction inserts succeed; same-direction concurrency instead exposes a unique-violation error rather than `already_related`. The pair can consequently have two pending and later two accepted relationship rows.
- **Action:** Store a canonical low/high user pair with a unique constraint and perform one atomic insert with conflict handling. Add opposite-direction and same-direction concurrent request regressions.

### R193 · Medium · Attention fan-out runs several serial queries for every unread member

- **Location:** `server/backend/src/domain/echoStore/social/attention.ts:358-456`; scheduled message fan-out at `server/backend/src/services/echoAttentionSnapshotScheduler.ts:42-68`.
- **Evidence:** The function initially batches read states, unread aggregates, notification levels and role assignments, but then awaits `buildEchoSingleChannelAttention` inside a loop for each unread user. Each call issues parallel mention and reply scans and then a profile query, so a message in a large channel creates roughly three query rounds per unread member in series. Fan-out latency and pool load therefore scale linearly with audience size despite the function's stated batched design.
- **Action:** Load mention/reply classification inputs and user profiles for all target users in bounded batch queries, classify in memory, and add a query-count regression whose database calls remain constant as recipients increase.

### R194 · Medium · A failed Discord message import leaves a partial channel that cannot be retried

- **Location:** `server/backend/src/services/discordImport/discordMessageImport.ts:339-470`.
- **Evidence:** The importer requires an empty channel only once, then creates shadow users, messages, bridge claims, media jobs and timestamps one message at a time through autocommitted statements. Any malformed timestamp, insert conflict, queue failure or database outage after the first message leaves a partial import. A retry immediately rejects because the channel is no longer empty, and no import record identifies which subset committed.
- **Action:** Stage and validate the complete bot response, import database state transactionally or maintain a resumable per-message checkpoint, and make side queues idempotent after commit. Add injected failures after each message step and verify retry reaches the same complete result.

### R195 · Medium · Most Discord API calls have no transport deadline

- **Location:** `server/backend/src/services/integrations/discordApiClient.ts:10-149,226-337`.
- **Evidence:** Guild membership/name/channel calls, webhook listing and creation, message posting, guild counting and paginated user/bot guild and connection requests call `fetch` without an abort signal. OAuth token and scheduled-event helpers define deadlines, showing the intended pattern, but these paths can wait indefinitely on a stalled upstream connection while holding an HTTP request or import workflow open.
- **Action:** Route every Discord call through one bounded fetch initializer, distinguish timeout from Discord rejection, and add never-resolving transport tests for each public helper class.

### R196 · Medium · Voice reconciliation can delete a participant during the normal LiveKit join window

- **Location:** `server/backend/src/services/echoVoiceLiveKitReconcile.ts:207-317,380-456`.
- **Evidence:** Reconciliation snapshots database participants, then lists LiveKit rooms and participants and deletes any identity absent from that later snapshot. Voice join records the database participant before the client can use its returned token to connect to LiveKit, so a periodic or disconnect-triggered reconciliation in that interval sees the fresh row as stale and deletes it. A participant connecting just after a room or participant list was read has the same outcome, producing a live media participant with no Echo roster state or associated audit semantics.
- **Action:** Give newly joined rows a bounded grace period or reconcile against a versioned join state, then confirm absence across a second observation before deletion. Guard deletion with the observed row version and add deterministic joins between the DB, room-list and participant-list snapshots.

### R197 · Low · The link-unfurl budget does not bound elapsed work

- **Location:** `server/backend/src/services/linkUnfurl/linkUnfurl.ts:378-434`.
- **Evidence:** `budgetMs` is converted to a deadline and checked only before starting each URL. The actual oEmbed and HTML work receives its independent timeout rather than the remaining budget, so a request that begins just before the deadline can run well beyond it; cached work can also outlive the caller's budget. The option therefore behaves as a start-admission hint rather than the documented total work budget.
- **Action:** Pass an abort signal or remaining duration through every oEmbed, cache and HTML fetch, stop awaiting when the shared deadline expires, and add a stalled-fetch regression that asserts wall-clock completion stays within the configured budget plus a small scheduling margin.

### R198 · High · The Snowflake migration omits most foreign references and can corrupt the data graph

- **Location:** `server/backend/src/scripts/migrateEchoIdsToSnowflake.ts:261-369`; reference-bearing schema in `server/backend/src/db/echoTables.ts`.
- **Evidence:** Channel IDs are updated in only messages, voice participants and normalized permission overwrites; role IDs in only member roles and overwrite targets; and server IDs in a twelve-table allowlist. The schema has many additional references, including role links, webhook and bridge records, tickets, read state, notification settings, Paper, E2EE, applications and safety data. The migration sets `session_replication_role = replica`, so it can update each parent ID while silently leaving those child values at the old UUID. Restoring constraint enforcement does not retroactively validate the dangling rows.
- **Action:** Derive and review a complete reference manifest from the live catalog, update every relational and structured-data reference in one migration plan, validate zero old IDs and every foreign-key relationship before commit, and add a representative full-schema migration fixture.

### R199 · Medium · The Snowflake migration leaves stale channel and role IDs inside message JSON

- **Location:** `server/backend/src/scripts/migrateEchoIdsToSnowflake.ts:55-112,138-160`.
- **Evidence:** Mention rewriting maps `channelId` but maps the generic mention `id` only through the message map and never rewrites `roleId`; channel and role mention entities therefore retain their old UUID identity. Reply snapshots rewrite `messageId` but leave `channelId` unchanged. These embedded identifiers no longer resolve after the corresponding channel and role rows receive Snowflake IDs.
- **Action:** Rewrite fields according to each entity discriminator, including generic `id`, `channelId`, `roleId` and reply snapshot channel IDs, cover all persisted structured-content shapes, and reject commit if any migrated UUID remains in an ID-bearing field.

### R200 · Low · Concurrent self-role setup can create duplicate widget channels

- **Location:** `server/backend/src/domain/echoStore/roles/selfAssignableRoles.ts:73-141,201-256`.
- **Evidence:** Widget provisioning selects for an existing `selfRoles` channel and later inserts one without a lock or uniqueness constraint. Two concurrent enable or update requests can both see no channel, create separate channels, and race the single configuration pointer; one visible built-in channel is then orphaned. The category creation path has the same check-then-insert shape and can also duplicate the fallback category.
- **Action:** Serialize provisioning per server and enforce the singleton channel invariant in the database. Upsert or reselect the winning row before saving the configuration, remove losing artifacts, and add a concurrent-enable regression.

### R201 · Low · The upload presign integration test permanently accumulates fixtures

- **Location:** `server/backend/src/tests/uploads/echo.uploads.presign.integration.ts:81-485`.
- **Evidence:** Every run registers two timestamp-named users and creates a server, categories and channels. The `finally` block only closes the test app and never deletes those rows. Repeated runs against the configured integration database therefore accumulate accounts and workspace data, can affect caps and uniqueness assumptions, and make failures leave even more partial fixtures.
- **Action:** Track created IDs and remove the server and users in a failure-safe cleanup block, or run the suite in a transaction that always rolls back. Add a post-run assertion that no generated username remains.

### R202 · Low · YouTube search transport failures skip the configured fallback

- **Location:** `server/backend/src/api/routes/echo/youtubeSearch.ts:60-97,389-435`.
- **Evidence:** The official search helper does not catch fetch timeouts, network errors or JSON parsing failures. Those exceptions escape the route and return a server error instead of trying the configured Invidious mirrors, although empty and non-OK official responses do fall back. When fallback does run, the response still labels its source as `youtube` solely because an API key is configured, so clients cannot tell which provider produced the data.
- **Action:** Contain official-provider transport and parse failures, continue to Invidious, and carry the provider that actually returned the result into the response and cache. Add timeout, malformed-JSON and fallback-source regressions.

### R203 · Medium · Discord bridge ingestion burns its durable claim before fallible processing

- **Location:** `server/backend/src/services/discordBridge/discordBridgeInbound.ts:166-241`.
- **Evidence:** Inbound processing inserts the `(channel,message)` claim before user provisioning, attachment parsing, mention translation, reply resolution and message persistence. Only a missing author or an exception from the final message insert removes the claim. Any exception in the earlier asynchronous work leaves the claim permanently present, so delivery retry returns `duplicate` although no Echo message exists. This is an inner idempotency record independent of the webhook delivery record described in R130.
- **Action:** Commit the claim and message side effects in one transaction, or track processing and completed states with safe retry takeover. Clear or retry failed pre-insert claims and add injected failures at every step between claim and message insert.

### R204 · Low · Marketing poll countries can be forged with request headers

- **Location:** `server/backend/src/api/routes/echo/public.ts:431-478,484-502`.
- **Evidence:** The public poll stores its country from `cf-ipcountry`, `x-vercel-ip-country` or `x-appengine-country` on any request. A direct client can supply any of these headers, so submissions can attach arbitrary flags and corrupt the public leaderboard metadata without traversing the named CDN.
- **Action:** Accept location metadata only from a verified trusted proxy path, strip client-supplied copies at the edge, or resolve country server-side from the trusted client address. Add direct-request and trusted-proxy tests.

### R205 · Medium · Discord-compatible message edits run as the human installer instead of the bot

- **Location:** `server/backend/src/api/routes/discordApi/rest/messages.ts:234-399`; edit authorization at `server/backend/src/domain/echoStore/messages/messageOps.ts:45-73`.
- **Evidence:** Messages created through the bot API are authored by `req.botApp.id`, but PATCH passes `access.installerId` as the editor. The edit primitive permits only the message author or linked twin. A bot therefore cannot edit the message it just created, while it can edit an unrelated message authored by its human installer; the response then falsely serializes that human-authored row with the bot as author.
- **Action:** Execute edits as the bot identity, verify the target message belongs to that bot, and serialize the persisted author. Add create-then-edit, installer-message rejection and author-serialization regressions.

### R206 · Medium · Any voice participant can replace the E2EE epoch while excluding current peers

- **Location:** `server/backend/src/domain/echoStore/voice/voiceE2ee.ts:158-188,259-393`.
- **Evidence:** Epoch creation checks that every supplied recipient is currently allowed, but it does not require any recipients or compare the set with current voice participants and their devices. Every current participant may supersede the active epoch. A malicious or broken client can therefore submit an empty or selective envelope list, invalidate the working epoch, and prevent the omitted participants from obtaining a key or joining until another rotation succeeds.
- **Action:** Authorize epoch rotation according to the group protocol, derive the required participant/device audience server-side, and reject a commit missing any required envelope except peers explicitly removed by the same serialized transition. Add empty-set, omitted-peer and concurrent-membership regressions.

### R207 · Medium · Concurrent ticket creation bypasses the per-user open-ticket cap

- **Location:** `server/backend/src/domain/echoStore/community/tickets.ts:144-228,480-498`.
- **Evidence:** Creation counts the author's open tickets, then separately chooses `COUNT(*) + 1`, creates a channel, and inserts the ticket. Concurrent requests can all observe capacity below `maxOpenPerUser` and proceed, exceeding the configured cap. They can also choose the same display number because numbering has no reservation or uniqueness boundary.
- **Action:** Serialize ticket admission per server and author inside a transaction, reserve a server-scoped sequence atomically, and commit the ticket and channel together. Add simultaneous creation tests at one below the configured limit.

### R208 · Medium · Failed ticket creation can expose an orphan channel

- **Location:** `server/backend/src/domain/echoStore/community/tickets.ts:175-210,393-463`.
- **Evidence:** Ticket creation commits the text channel before installing its deny-by-default permission overwrites, then inserts each overwrite and the ticket row through separate autocommitted statements. A failure after channel creation can leave a normally visible channel carrying the ticket subject, or a partially private channel with no ticket record. Retry creates another channel.
- **Action:** Create the channel, complete every overwrite and insert the ticket in one transaction, or reliably compensate before returning an error. Add injected failures after channel creation, each overwrite class and ticket insertion, asserting no channel remains visible.

### R209 · Low · Reopening a closed ticket leaves its author unable to send

- **Location:** `server/backend/src/domain/echoStore/community/tickets.ts:282-320,465-478`.
- **Evidence:** The transition table permits `closed -> open`. Closing merges `SEND_MESSAGES: false` into every member overwrite, but the reopening path only updates the ticket status and never restores the author's allow. The API reports the ticket open while its author remains locked out of the channel.
- **Action:** Restore the intended author and handler permissions as part of the same serialized status transition, preserve unrelated overwrite fields, and add close/reopen access regressions.

### R210 · Medium · Voice mute and stage moderation bypass role hierarchy

- **Location:** `server/backend/src/domain/echoStore/voice/voice.ts:12-30,312-455`.
- **Evidence:** Server mute, deafen, stage invite and audience moves reject targeting the owner and require the corresponding channel permission, but never compare the actor's highest role with the target's. The disconnect and channel-move path uses `canActorModerateTargetMember`, showing the intended hierarchy gate. A lower-ranked moderator with `MUTE_MEMBERS` or `DEAFEN_MEMBERS` can therefore control a higher-ranked non-owner.
- **Action:** Route every member-directed voice moderation action through the same owner and role-hierarchy predicate before mutation and before LiveKit side effects. Add higher-role target regressions for mute, deafen, stage invite and audience move.

**Remediation (2026-10-04):** The shared voice mute/deafen/stage predicate now calls `canActorModerateTargetMember` with the action's required permission before checking channel-effective permission. Backend TypeScript build passed. Database-backed higher-role target regressions for all four action classes remain to be run.

### R211 · Medium · Voice moves do not verify that the target may enter the destination

- **Location:** `server/backend/src/domain/echoStore/voice/voice.ts:479-545`.
- **Evidence:** Moving a participant validates the destination channel and checks that the actor has `VIEW_CHANNEL` and `CONNECT`, then directly changes the target's participant row. It never evaluates the target's destination permissions, ban/timeout state or destination user limit. A moderator can place someone into a private or full voice channel that the target could not join normally, creating roster and media-control state that violates channel access policy.
- **Action:** Apply the normal target join predicate and capacity admission under the destination-channel lock, with a narrowly documented moderator bypass only where intended. Add denied-destination, timeout and full-channel move regressions.

**Remediation (2026-10-04):** Voice moves now reject banned or timed-out targets, require the target's effective `VIEW_CHANNEL` and `CONNECT` permissions, and enforce destination capacity while holding a row lock on the destination channel in a transaction. Capacity bypass follows the target's existing `MANAGE_ROLES`/`MANAGE_GUILD` join bypass. Backend TypeScript build passed; database regressions for private, timeout and full-channel targets remain open.

### R212 · Low · Concurrent identical image searches charge only the first account

- **Location:** `server/backend/src/api/routes/serperImageSearch.ts:327-393,483-500`.
- **Evidence:** The cold-request in-flight map is keyed only by normalized query, result count and page. The first requester starts work that reserves that user's plan credit and the caller IP budget. Every other account requesting the same uncached key concurrently awaits that promise without reserving its own daily credit or IP allowance, then receives the result. Coordinated callers can repeatedly select fresh common queries and shift usage onto one account or network.
- **Action:** Coalesce only the upstream fetch while performing per-request quota admission for every caller, refund each reservation according to the shared outcome, and add two-user and two-IP concurrency regressions.

**Remediation (2026-10-04):** Each cold-cache request now reserves its own user query credit and IP budget before joining or creating the shared upstream promise; each request refunds its own reservations when the shared fetch fails. Backend TypeScript build passed. The image-search test command currently fails before reaching these tests with an existing `echoStore/index.ts` ↔ `echoAttentionSnapshotScheduler.ts` initialization cycle (`buildEchoAttentionSnapshot` undefined); concurrency regression coverage remains open.

### R213 · Medium · Repeated gateway identification leaks listeners and duplicates dispatches

- **Location:** `server/backend/src/api/routes/discordApi/gateway/index.ts:440-527,543-561`.
- **Evidence:** Every IDENTIFY replaces `session`, starts a new interval and registers the same event listener again without rejecting re-identification or clearing the prior resources. A client can send IDENTIFY repeatedly on one socket, causing each bot event to be dispatched multiple times and leaving intervals/listener registrations that cleanup does not reliably account for. The heartbeat timer also never tracks missed heartbeats, so an open but nonresponsive connection is retained indefinitely.
- **Action:** Permit one identification per connection, keep explicit timer and listener ownership outside the replaceable session, require heartbeat acknowledgement within the negotiated window, and idempotently remove all resources on failure or close. Add repeated-IDENTIFY and silent-client lifecycle tests.

**Remediation (2026-10-04):** Gateway connections now reject subsequent IDENTIFY frames, acknowledge server heartbeat requests within one heartbeat interval, close silent clients, and make cleanup idempotent. Backend TypeScript build passed. Dedicated WebSocket lifecycle regressions remain to be added; existing gateway tests cover bot security, not repeated identify or heartbeat expiry.

### R214 · Medium · Discord member role replacement can partially apply while reporting success

- **Location:** `server/backend/src/api/routes/discordApi/rest/guilds.ts:352-423`.
- **Evidence:** The route diffs the requested role list and performs each grant and removal as a separate mutation. It ignores `forbidden`, invalid-role and other non-success results from every operation, then always returns `200 {}`. A list containing one allowed and one disallowed role can therefore commit a partial replacement while the bot is told the whole desired set succeeded; concurrent membership changes further widen the mismatch.
- **Action:** Validate the complete target set and actor hierarchy before mutation, replace roles in one transaction with an expected current version, and surface precise Discord-compatible errors. Add mixed-validity and mid-replacement failure regressions asserting all-or-nothing behavior.

### R215 · Medium · Event feeds expose data outside their current audience

- **Location:** `server/backend/src/domain/echoStore/servers/serverEvents.ts:94-229`.
- **Evidence:** Upcoming events are selected for every current server without checking whether the user can view the event's associated channel, yet the payload includes that private channel's ID and name. The separate “my RSVPs” query does not constrain results to the supplied current `serverIds` or recheck membership at all. A removed member whose RSVP row remains can continue receiving future event, server, location and attendance details from a server they no longer belong to.
- **Action:** Apply current membership and effective channel visibility in both queries, omit inaccessible channel metadata if the event itself remains public, and delete or suppress RSVPs on member removal. Add private-channel and former-member bootstrap regressions.

**Remediation (2026-10-04):** Both bootstrap queries now recheck current server membership, and “my RSVPs” is constrained to the caller's supplied current server IDs. Event rows retain their public event details while channel ID/name are redacted unless the caller has effective `VIEW_CHANNEL`. Backend TypeScript build passed; DB-backed visibility and former-member regressions remain open.

### R216 · Low · Concurrent partial event-time edits can persist an invalid interval

- **Location:** `server/backend/src/domain/echoStore/servers/serverEvents.ts:379-490`.
- **Evidence:** Each update reads the current start and end, validates its merged in-memory pair, then updates only the submitted fields without a lock or version predicate. Concurrent requests that separately move the start later and the end earlier can each validate against the old opposite endpoint, both commit, and leave `ends_at <= starts_at` despite both reporting success.
- **Action:** Lock the event row and validate the final pair in the same transaction, or enforce the interval with a database check constraint and versioned update. Add the crossed partial-update interleaving.

**Remediation (2026-10-04):** Event updates now lock the event row with `FOR UPDATE`, merge partial times against the latest committed pair, validate the interval and update within one transaction. Backend TypeScript build and `git diff --check` passed. A DB interleaving regression remains open.

### R217 · Medium · Failed first-time Google login leaves an orphan Echo account

- **Location:** `server/backend/src/api/routes/googleOAuth.ts:365-483,502-561`.
- **Evidence:** When a Google subject has no link, the callback creates an Echo user before checking the final unique link ownership, encrypting tokens and upserting the Google link. A link race, encryption failure, database failure or other rejection after user creation returns an OAuth error but never removes the new account. Subjects without a stable unique email can race into multiple provisioned users, only one of which can win the unique Google link.
- **Action:** Provision the user and claim the Google subject in one transaction or reserve the subject before account creation, and compensate any external work on rollback. Add concurrent first-login and injected post-create failure regressions asserting one linked account and no orphan.

**Remediation (2026-10-04):** The callback now tracks a newly provisioned login account and deletes it on the known later rejection paths (Google-subject already linked, missing reloaded user, token encryption failure and link persistence failure). Official-server signup work starts only after Google-link persistence and now has a terminal rejection handler. This is compensating cleanup, not one transaction; unexpected failures between provisioning and link persistence and concurrent first-login tests remain to be covered.

### R218 · Low · Google login audit persistence is an unhandled detached promise

- **Location:** `server/backend/src/api/routes/googleOAuth.ts:563-589`.
- **Evidence:** After session issuance, the callback invokes `store.recordLoginEvent` with `void` and no rejection handler. A database failure rejects after the HTTP success path has continued and becomes an unhandled promise rejection, which can terminate the backend under the runtime's default policy.
- **Action:** Await the audit write under the login transaction policy or attach a terminal catch that records the loss without escaping. Add a rejected audit-store regression proving the session response and process remain controlled.

**Remediation (2026-10-04):** The login audit write is awaited after session issuance and its failure is logged with a terminal catch, so it cannot become an unhandled rejection or turn a successful session into a failed redirect. Backend TypeScript build is running; a rejected-audit regression remains open.

### R219 · Medium · Discord event mirroring can duplicate or lose track of listings

- **Location:** `server/backend/src/services/discordBridge/discordEchoServerEventMirror.ts:403-575`.
- **Evidence:** Location replacement attempts to delete the old Discord event, but even when deletion fails it clears the stored ID and creates a replacement. The old listing can remain alongside the new one with no local reference. If replacement creation then fails, the reference is already cleared and a retry creates yet another listing. Concurrent create syncs also both observe no ID, create separate Discord events and race to store the last response.
- **Action:** Serialize mirroring per Echo event, retain the old ID until confirmed deletion or reconciliation, and persist an explicit replacement operation/idempotency state before remote calls. Reconcile ambiguous failures against Discord and add delete-failure, create-failure and concurrent-create tests.

### R220 · Low · Failed media bookkeeping leaks stored import objects on every retry

- **Location:** `server/backend/src/services/discordImport/discordImportMediaMirrorProcessor.ts:177-267,432-459`.
- **Evidence:** The processor writes the transformed bytes to local disk or S3 before registering retention and building the public URL. A retention database failure or later URL-construction failure leaves the object behind, the outer catch marks the job failed, and a retry generates a new Snowflake object key and writes another copy. No cleanup path knows the unregistered prior key.
- **Action:** Reserve and register object ownership transactionally before or with publication, delete the object on every post-write failure, and reuse an idempotent job/object key across retries. Add injected retention and URL-build failures for local and S3 storage.

**Remediation (2026-10-04):** Mirror object keys now derive from the normalized Discord media URL, so retries reuse the same destination. Post-write retention/content-type/URL failures clean up newly created bookkeeping and the local or S3 object; pre-existing registered media is preserved. Backend TypeScript build and `git diff --check` passed. Local and S3 injected-failure regressions remain open.

### R221 · Low · One permanent media failure suppresses retries for other transient failures

- **Location:** `server/backend/src/services/discordImport/discordImportMediaMirrorProcessor.ts:482-617`.
- **Evidence:** A job can contain several URLs. After persisting successful mirrors, the final decision marks the whole job permanently failed whenever `permanentFailures > 0`, even if other URLs failed transiently and have retry budget left. A single unsupported attachment therefore prevents retry of an unrelated temporary CDN or storage failure, leaving that media on an expiring Discord URL.
- **Action:** Track completion and failure class per stable media key, continue retrying transient items independently, and mark the aggregate job terminal only when every item is mirrored or permanently classified. Add a mixed permanent/transient multi-attachment regression.

**Remediation (2026-10-04):** The aggregate job is now terminal only when remaining failures are permanent and none are transient; mixed outcomes continue retrying until transient items resolve or the attempt cap is reached. Backend TypeScript build passed. Mixed-attachment queue regression remains open; per-media retry state is still aggregate rather than independently persisted.

### R222 · Medium · Paper collaboration locks split across backend replicas

- **Location:** `server/backend/src/sockets/paperCollabHandler.ts:33-38,73-145,364-488`.
- **Evidence:** Locks, cursors and editing state live only in process-local maps, while their broadcasts use Socket.IO rooms that can span replicas. Editors connected to different backend instances consult different lock maps and can both claim the same block; each replica then broadcasts a contradictory snapshot. Restarting or rebalancing a connection also silently discards ownership before the idle period.
- **Action:** Store lock ownership and expiry in shared atomic storage keyed by channel and block, publish versioned snapshots from that source, and make claim/release compare-and-set operations. Add a two-replica simultaneous-claim test and reconnect ownership test.

### R223 · Medium · Paper collaboration trusts unbounded client identity and block keys

- **Location:** `server/backend/src/sockets/paperCollabHandler.ts:379-558`.
- **Evidence:** Authenticated authors may supply arbitrary-length and arbitrary-count `blockId` values, plus their own `displayName` and `color`. Claims retain every unique block for 45 seconds and dirty/preview maps retain every user/block key until a later serialization pass, with no event-specific rate limit. A client can consume memory and amplify broadcasts by flooding fresh keys, and can appear to collaborators under another person's display name or deceptive styling.
- **Action:** Derive display identity and permitted color server-side, validate block IDs against the current document with strict length limits, cap active entries per user/channel, and rate limit collaboration events. Add spoofed-identity and high-cardinality flood regressions.

**Remediation (2026-10-04):** Paper collaboration now rejects channel/block keys over 128 characters or containing controls, caps locks/dirty/previews at 32 entries per user and 512 per channel, and ignores client-supplied identity/style in the affected broadcasts. Backend TypeScript build passed. Document membership checks for block IDs and event-rate limiting remain open; targeted spoof/flood regressions remain to be added.

### R224 · High · Concurrent bundle fetches can reuse the same one-time prekeys

- **Location:** `server/backend/src/domain/echoStore/voice/e2ee.ts:161-285`.
- **Evidence:** Peer bundle delivery starts a transaction, selects each device's one-time-prekey array without `FOR UPDATE`, returns the first key and writes back the remainder. Two concurrent fetches can both read the same snapshot, return the same one-time key to different sessions and then store the same remainder. Reusing a Signal one-time prekey defeats its one-use security property and can undermine session establishment guarantees.
- **Action:** Atomically claim each prekey with a locked row or a single update that removes and returns one element, and serialize all devices consistently. Add a deterministic concurrent fetch proving every delivered prekey ID is unique.

**Remediation (2026-10-04):** Bundle reads now lock all active device rows in deterministic protocol-device order with `FOR UPDATE` inside the existing transaction, serializing one-time-key removal across concurrent fetches. Backend TypeScript build and `git diff --check` passed; concurrent-delivery coverage remains open.

### R225 · Medium · Concurrent pairing polls can both consume and receive the ciphertext

- **Location:** `server/backend/src/domain/echoStore/voice/e2ee.ts:323-365`.
- **Evidence:** A poll reads a `ready` pairing row, then separately updates it to `consumed`, but returns the ciphertext without checking whether its conditional update won. Concurrent authenticated sessions for the account can both read `ready`; one changes the state and both still receive the pairing ciphertext, violating the advertised single-consumption state machine.
- **Action:** Claim and return a ready payload in one `UPDATE ... WHERE status = 'ready' RETURNING ciphertext`, distinguish a lost claim as consumed, and add simultaneous polling coverage.

**Remediation (2026-10-04):** Polling now atomically transitions a non-expired ready row to consumed and returns ciphertext only to the request that won `UPDATE ... RETURNING`; later polls observe consumed. Backend TypeScript build and `git diff --check` passed; simultaneous poll coverage remains open.

### R226 · Low · Concurrent E2EE device registration collides on protocol device IDs

- **Location:** `server/backend/src/domain/echoStore/voice/e2ee.ts:58-106`; unique index setup at `server/backend/src/db/echoTables.ts:1125-1150`.
- **Evidence:** A new device chooses `MAX(protocol_device_id) + 1` in its insert expression without locking the user's device set. Concurrent registrations can select the same number; the unique `(user_id, protocol_device_id)` index rejects one request even though its distinct `device_id` is valid. The API exposes this avoidable database conflict instead of registering both devices.
- **Action:** Allocate protocol IDs under a per-user lock or sequence and retry unique conflicts within a bounded transaction. Add simultaneous registration for two new device IDs.

**Remediation (2026-10-04):** Device registration now serializes protocol-ID allocation with a per-user transaction advisory lock around the existing MAX+1 upsert. Backend TypeScript build and `git diff --check` passed; concurrent registration coverage remains open.

### R227 · Medium · Failed first-time Discord login leaves an orphan guest account

- **Location:** `server/backend/src/api/routes/discordOAuth.ts:439-487,489-589`.
- **Evidence:** When no Echo account is linked to the Discord subject, the callback creates a guest account before checking link ownership, merging the Discord profile, encrypting OAuth tokens and persisting the link. Any later error redirects to a failure page without deleting or recovering that guest. The account has no established credential and the next login attempt can provision another guest, leaving inaccessible accounts behind.
- **Action:** Atomically reserve the Discord subject and create/link the guest, or compensate failed callbacks by removing the newly created guest and its dependent state. Add concurrent first-login and injected post-create failure regressions that assert one linked account and no orphan.

**Remediation (2026-10-04):** Newly minted Discord-login guests are now tracked immediately and deleted on guest setup, link-owner, user reload, profile merge, token encryption and link persistence failures. Official-server join work begins after the Discord link commits and has a terminal rejection handler. This remains compensating cleanup rather than atomic subject reservation; concurrent first-login and injected failure tests remain open.

### R228 · Medium · Concurrent group DM additions can exceed the plan member cap

- **Location:** `server/backend/src/domain/echoStore/social/dmThreads.ts:974-1002`; request mapping at `server/backend/src/api/routes/echo/dm.ts:463-526`.
- **Evidence:** Each transaction locks the group’s existing member rows, counts those rows and checks the entitlement cap before inserting. Two concurrent additions can both start their `SELECT ... FOR UPDATE` while the same old rows exist; the second waits on those rows but its statement snapshot does not include the first transaction’s newly inserted member rows. Both therefore count the same old membership and can commit distinct additions beyond the cap.
- **Action:** Serialize additions on a stable per-group row/advisory lock, then recount membership after acquiring it. Add a concurrent test where each request fits alone but their combined additions exceed the group cap.

**Remediation (2026-10-04):** Group-member additions now lock the stable `echo_channels` group row before locking and recounting member rows, so concurrent additions to the same group serialize before cap evaluation. Backend TypeScript build and `git diff --check` passed; concurrent cap regression remains open.

### R229 · Medium · MLS commit accepts an unbounded welcome list and multiplies database work

- **Location:** `server/backend/src/api/routes/echo/mls.ts:174-198,302-370`; validation and persistence at `server/backend/src/domain/echoStore/voice/mlsDelivery.ts:380-435,470-487`.
- **Evidence:** `parseWelcomes` accepts every element in a request array without a count limit. The handler then runs multiple authorization and device ownership queries sequentially for each recipient, and the transaction inserts every welcome separately before broadcasting one event per entry. A single authenticated MLS writer can submit a very large list and hold the database connection while producing unbounded query and event fan-out; each individual payload is capped, but the aggregate list is not.
- **Action:** Bound welcome count to the supported number of recipient devices, enforce the limit in both route and domain entry points, and cap aggregate payload bytes. Add a request that exceeds the recipient limit and assert it is rejected before any queries or inserts.

**Remediation (2026-10-04):** Route parsing and the domain entry point now both cap welcomes at 100 entries and 5 MB aggregate payload characters (while retaining the 1 MB per-payload cap), rejecting oversized commits before recipient authorization queries or inserts. Backend TypeScript build and `git diff --check` passed; route/domain rejection regression remains open.

### R230 · Low · MLS message-fetch endpoints omit the configured read rate limit

- **Location:** `server/backend/src/api/routes/echo/mls.ts:578-588,649-659`.
- **Evidence:** Both DM and guild MLS `messages` routes perform membership and voice-presence checks plus a database query, but unlike the adjacent `group-info` routes they have no `MLS_READ_RATE` configuration. Each response is row-bounded, yet an authenticated user can repeatedly issue these calls without the endpoint's intended read throttle and amplify database work across channels.
- **Action:** Apply `MLS_READ_RATE` to both message-fetch routes and add route coverage that verifies the shared limiter is configured.

**Remediation (2026-10-04):** Both DM and guild MLS message-fetch routes now use the shared `MLS_READ_RATE` configuration. Backend TypeScript build passed; route limiter coverage remains open.

### R231 · Medium · Stage stream persistence failure leaves a permanent start claim and orphan broadcast

- **Location:** `server/backend/src/services/stage/stageYoutubeStream.ts:267-296,374-435`.
- **Evidence:** Both start modes first create a durable `starting` claim. OAuth mode then creates a YouTube broadcast and stream before persisting their IDs with `upsertStageYoutubeBroadcast`; stream-key mode also upserts after claiming. These upserts are outside cleanup guards. If persistence fails, the claim remains `starting` with empty or stale resource IDs, so later start attempts return `ALREADY_LIVE`; in OAuth mode the newly created YouTube resources also remain undiscoverable locally and cannot be cleaned up by the stop path.
- **Action:** Make claim finalization and resource persistence recoverable: compensate the claim and complete any created YouTube broadcast when persistence fails, while preserving enough durable state to retry cleanup if compensation also fails. Add injected database failures after claim and after YouTube session creation.

**Remediation (2026-10-04):** Stream-key persistence failure now clears the start claim. OAuth broadcast persistence failure now attempts to complete the just-created YouTube broadcast and clears the claim, preserving the original database error if compensation fails. Backend TypeScript build and `git diff --check` passed; injected DB/YouTube failure regressions remain open. If both persistence and claim cleanup fail during a DB outage, durable remote cleanup still requires operator reconciliation.

### R232 · Medium · Message acknowledgment can succeed before realtime fanout fails permanently

- **Location:** `server/backend/src/services/echoPersistedMessageCreate.ts:431-453,539-541,575-596`; duplicate retry path at `490-535`.
- **Evidence:** After insertion, the service acknowledges the sender, then awaits author, DM-recipient and channel lookups before emitting the channel message. If a lookup fails, the row remains stored and the sender has already received success, but no channel event is emitted. Retrying with the same message ID follows the duplicate path, which only acknowledges the stored row and never replays the missed room broadcast, leaving other connected clients stale until they reload history.
- **Action:** Persist delivery intent with the message in a transactional outbox or otherwise make duplicate retries safely replay missing fanout. Add an injected post-insert lookup failure and assert other clients eventually receive the stored message exactly once.

**Remediation (2026-10-04):** The sender is now acknowledged only after the channel message event is emitted. A retry that finds the already-persisted message replays the room event under the same message ID before acknowledging, allowing clients to deduplicate an at-least-once replay. Backend TypeScript build passed; injected lookup-failure/retry coverage remains open.

### R233 · Medium · Channel patches can return failure after earlier fields already commit

- **Location:** `server/backend/src/domain/echoStore/roles/permissionOverwrites.ts:655-677,758-779`.
- **Evidence:** `patchEchoChannel` applies category placement first, then updates ordinary channel fields, and only afterward calls `updateEchoChannelPermissionOverrides`. A caller with `MANAGE_CHANNELS` but without `MANAGE_ROLES` can submit a combined name/permission patch: the name update commits before the overwrite helper returns `forbidden`. Invalid overwrite data or a database failure in the final phase likewise leaves earlier committed changes while the API reports the whole request failed.
- **Action:** Validate all fields and required permissions before mutation, then apply placement, channel fields and overwrites atomically in one transaction. Add a combined-patch regression proving a denied overwrite leaves all channel fields unchanged.

**Remediation (2026-10-05):** `patchEchoChannel` now performs placement, channel field updates, and permission-overwrite replacement using one PostgreSQL transaction client. Permission checks and input validation happen before writes; target checks and database errors during overwrite replacement roll back the earlier placement and field changes. Nested placement now leaves transaction rollback to its caller when given a shared client. Added an integration regression that injects an overwrite-table insert failure and asserts the channel name remains unchanged. Backend compilation and `git diff --check` pass. The channel-settings integration test type-checks but cannot execute because PostgreSQL is unavailable at `localhost:5433`; runtime confirmation remains pending.

### R234 · Medium · Simultaneous messages bypass channel slowmode

- **Location:** `server/backend/src/domain/echoStore/roles/permissionOverwrites.ts:784-817`; socket send path at `server/backend/src/sockets/chatMessageHandler.ts:398-404`.
- **Evidence:** Slowmode reads the actor's most recent message timestamp and compares it in application code, separately from message insertion. Concurrent sends from the same user can both observe the same old timestamp, both pass this check, and persist within the configured interval; the per-socket message limiter is not a serialized slowmode claim across sockets or replicas.
- **Action:** Atomically reserve each user's channel slowmode window with the message write or a conditional database update. Add concurrent sends across two sockets and assert at most one message persists inside the interval.

### R235 · Low · Message validation accepts an unbounded mention array

- **Location:** `server/backend/src/sockets/messageValidation.ts:219-276`; message persistence and fan-out at `server/backend/src/services/echoPersistedMessageCreate.ts:384-388,433-453`.
- **Evidence:** `sanitizeMentions` filters entries by shape and by whether each range fits the short message content, but imposes no maximum entry count or uniqueness rule. Repeated overlapping ranges are valid, so one bounded socket payload can carry thousands of mentions, persist an oversized JSON value and amplify mention processing and downstream work from a message whose text is otherwise within the 4,000-character limit.
- **Action:** Enforce a conservative maximum mention count and reject or canonicalize duplicate/overlapping spans before persistence. Add boundary tests for the maximum and repeated-range overflow.

**Remediation (2026-10-04):** Message validation now rejects mention arrays above 100 and canonicalizes valid spans into start order while dropping overlaps. The message-validation suite now covers 101-item rejection and overlapping ranges; both message validation and E2EE wire validation suites passed.

### R236 · Medium · Role changes can commit without their audit or graph event

- **Location:** `server/backend/src/api/routes/echo/roles.ts:712-767,809-843,883-919,1005-1057,1071-1132`.
- **Evidence:** Role, link and member-assignment helpers commit their database changes before these route handlers insert the audit row and publish the role-graph or permission-invalidated event. If audit persistence fails, the request returns an error after the authorization change has committed, leaving it unaudited and without the event clients use to refresh role and permission state. The same gap exists for role deletion and member grant/removal paths.
- **Action:** Commit each role mutation and its audit/outbox record in one transaction, then publish from the durable event. Add injected audit failures for role permission edits, link replacement and member assignment/removal and assert either the whole operation commits with an event or no mutation persists.

**Partial remediation (2026-10-05):** Role permission/type edits, role deletion, role-link replacement, and member-role grant/removal now share a transaction with their audit row and durable workspace-event outbox row. Publication uses the already-staged outbox ID after commit, and permission-cache invalidation runs after commit. Added a route-level failure-injection integration test for role-link replacement, role permission edits, and member-role grants/removals; it asserts each authorization mutation rolls back on audit failure and no associated outbox row persists. Backend TypeScript compilation, the focused workspace-event publisher suite (8 tests), and `git diff --check` pass. The integration test type-checks but cannot reach setup because PostgreSQL at `localhost:5433` refuses connections. Other role mutation paths outside these handlers still need review before this finding can be closed.

### R237 · Low · Invalid event time fields are silently ignored during updates

- **Location:** `server/backend/src/api/routes/echo/serverScoped.ts:883-890`.
- **Evidence:** When `startsAt` or `endsAt` is supplied as a nonempty string that does not parse to a valid date, the route simply omits that field from the patch and continues. A request can therefore return success for its other changes while silently retaining the old event time the caller intended to replace.
- **Action:** Reject malformed nonempty date fields with `400 INVALID_BODY` and add update-route cases for invalid start and end values, including a mixed patch proving no partial update occurs.

**Remediation (2026-10-04):** Nonempty `startsAt` and `endsAt` strings that parse to invalid dates now return `400 INVALID_BODY` before building or applying the patch. Backend TypeScript build passed; route-level mixed-patch tests remain open.

### R238 · Low · Any server member can poison global voice QoS metrics

- **Location:** `server/backend/src/api/routes/echo/voice.ts:577-605`.
- **Evidence:** The QoS endpoint checks only server membership. It does not verify that the channel belongs to the supplied server or that the caller currently participates in that voice channel, then records the client-provided values in process-wide Prometheus histograms and a counter. A member can submit fabricated samples to skew operational voice-quality metrics.
- **Action:** Require a matching server/channel and active voice-participant row before observing a sample. Add route tests for a non-participant and a channel outside the server, and retain a valid participant case.

**Remediation (2026-10-04):** The QoS route now requires a matching server/channel row joined to the caller's active voice-participant row before observing metrics. Backend TypeScript build passed; route regressions remain open.

### R239 · Medium · Concurrent role creation exceeds the server role cap

- **Location:** `server/backend/src/domain/echoStore/roles/roles.ts:1240-1245,1298-1334`.
- **Evidence:** `createEchoRole` counts existing roles and checks the 512-role cap before inserting, but neither the count nor insertion is serialized in a transaction. Concurrent authorized requests can observe the same below-cap count and each insert, taking a server beyond its configured role limit.
- **Action:** Serialize role creation per server while checking the count and inserting, or enforce the cap through an equivalent database-safe admission mechanism. Add a concurrent boundary regression.

**Remediation (2026-10-04):** Role creation now acquires a server-scoped transaction advisory lock before recounting roles and keeps the lock through the insert, preventing simultaneous requests from exceeding the cap. Backend TypeScript build and `git diff --check` passed; concurrent boundary coverage remains open.

### R240 · Medium · Concurrent emoji additions bypass pack and library caps

- **Location:** `server/backend/src/domain/echoStore/emoji/emojiLibrary.ts:704-725,805-828,1294-1327`.
- **Evidence:** Market import and custom-pack creation count the server's packs before inserting without serializing the count-and-insert. Custom emoji addition similarly counts pack entries before inserting. Concurrent requests can exceed the six-pack library cap or 64-expression pack cap, including through authorized API calls.
- **Action:** Serialize each admission check with its corresponding insert (or enforce equivalent database-safe limits). Add concurrent tests at both caps.

**Remediation (2026-10-05):** Market-pack imports and custom-pack creation now serialize server pack count/position checks and inserts with a server-scoped transaction advisory lock. Custom emoji additions lock the pack row while recounting and inserting. Backend TypeScript build and `git diff --check` passed; cap-boundary concurrency tests remain open.

### R241 · Medium · Stage-channel creation can omit its audience speak denial

- **Location:** `server/backend/src/domain/echoStore/channels/categoriesWorkspace.ts:1889-1903`.
- **Evidence:** The stage channel row is inserted before its default `everyone` overwrite (`CONNECT: true, SPEAK: false`) and these writes are not in one transaction. If the overwrite insert fails, the API operation fails but leaves the stage channel persisted without its audience speak restriction, so effective role permissions may let audience members publish audio.
- **Action:** Create the stage channel and required overwrite atomically; add a failure injection test proving neither row is left partially configured.

**Remediation (2026-10-05):** Stage channel row creation and its default audience overwrite now share one transaction and connection, rolling back both on failure. Backend TypeScript build and `git diff --check` passed; injected overwrite-failure coverage remains open.

### R242 · Medium · Watch Together add-bytes can claim a channel host before authorization

- **Location:** `server/backend/src/api/routes/echo/uploads.ts:1714-1757`.
- **Evidence:** The endpoint checks only that the supplied library storage key belongs to the caller, then calls `claimVcWatchTogetherChannelHost` with caller-controlled `channelId` and `sessionId`. It does not check channel access or upload permission before that durable claim, and performs the Echo+ entitlement check only after claiming. A free user or a user with an unrelated owned library item can therefore reserve a host slot for an arbitrary channel and then receive an error, blocking legitimate Watch Together hosting until the stale-claim timeout.
- **Action:** Validate current channel upload authorization and entitlement before creating the host claim; bind the claim to a valid session/library entry. Add route tests proving unauthorized channels and free users leave no host row behind.

**Verification (2026-10-05):** The current route checks library ownership, Echo+ entitlement, channel upload permission, registered upload/byte length, and session quota before calling `claimVcWatchTogetherChannelHost`; the ledger's previously observed claim-before-authorization order is already corrected in the checkout. Route regression coverage remains open.

### R243 · Medium · Discord channel refresh can leave a partial layout marked complete

- **Location:** `server/backend/src/services/discordImport/discordImport.ts:2061-2066,2097-2367`.
- **Evidence:** Channel replacement deletes the existing channels and categories in separate autocommitted queries, then recreates categories, channels, overwrites and forum posts through many independent writes. The completion timestamp is only updated at the end, but a forced refresh begins from a state whose `channels_imported_at` is already set; if any later operation fails, `recordImportFailure` updates only the error fields and leaves that timestamp intact. The database can therefore contain an empty or partial replacement while the UI still reports channel import complete.
- **Action:** Explicitly clear the completion marker before destructive writes and restore it only after the whole layout is rebuilt, or make replacement and state update atomic. Add injected failures after deletion and midway through channel/overwrite creation and verify the state cannot report completion for a partial layout.

**Verification (2026-10-05):** The current refresh clears `channels_imported_at` before deleting/recreating channels and categories, and only the successful completion path restores the marker. Failures therefore leave the import marked incomplete. Injected mid-rebuild failure coverage remains open.

### R244 · Low · Channel settings integration test reads message-format fields from the wrong API

- **Location:** `server/backend/src/tests/channels/echo.channelSettings.test.ts:185-207`.
- **Evidence:** The test patched `messageFormatTemplate` and `messageFormatHard`, then read them from `listEchoChannels`, whose return type and query intentionally omit those metadata fields. TypeScript rejected all four property accesses, so the `test:echo:channelSettings` script stopped before executing any regression assertions.
- **Action:** Read the patched values through `getEchoChannelMeta` and retain the existing persistence assertions.

**Verification (2026-10-04):** The current test reads `messageFormatTemplate` and `messageFormatHard` through `getEchoChannelMeta`; the recorded compile failure is already corrected in the checkout.

### R245 · Low · Opportunistic socket warm-up can reject without a handler

- **Location:** `clients/web/src/features/layout/realtime/echoSocketWarmConnect.ts:10-12`; registered callback in `clients/web/src/features/layout/composables/realtime/useAppLayoutRealtimeSocketBinding.ts:65`.
- **Evidence:** The warm-up callback returns `connectSocket()`'s promise, but the wrapper discards it with `void`. The socket lifecycle can reject when importing or initializing Socket.IO fails, leaving an unhandled promise rejection from an opportunistic Paper mount.
- **Action:** Handle warm-up failures locally while leaving recovery to the normal realtime lifecycle.

**Remediation (2026-10-04):** Warm-connect rejection is now caught locally. Its rejecting-hook regression passed.

### R246 · Medium · Local upload path recognition preserves attacker-controlled origins

- **Location:** `clients/web/src/features/chat/localUploadReadUrl.ts:4-14`, used by `clients/web/src/features/chat/mediaCdn.ts:228,286`.
- **Evidence:** The helper tested only whether the parsed pathname began with the local upload prefix, then returned the original URL. A remote URL such as `https://attacker.example/api/v1/echo/uploads/files/key.webp` therefore passed the check and was used as an external image URL instead of a same-origin cookie-authenticated route.
- **Action:** Return only the validated path for recognized local upload URLs and add a regression for foreign origins.

**Verification (2026-10-04):** `localUploadReadUrl` returns only the same-origin route path after recognizing the upload prefix, and its current test covers a foreign origin carrying that path.

### R247 · Low · Accepting a message request can reject as an unhandled promise

- **Location:** `clients/web/src/features/dm/createHandleAcceptMessageRequestOpener.ts:8-12`; `clients/web/src/features/layout/composables/controller/createAppLayoutActionsFromRegistry.ts:8`.
- **Evidence:** These UI callbacks discard promises from message-request acceptance, DM selection and DM navigation. A network rejection therefore becomes an unhandled promise rejection from a user action.
- **Action:** Catch the detached operations' rejections, provide an optional error callback where callers need details, and add a rejection regression.

**Remediation (2026-10-04):** The accept/open callback catches detached failures and reports them through optional `onError`; registry DM navigation also handles rejection. Its rejecting-accept regression passed.

### R248 · Medium · Missing channel metadata defaults stage media permission to allow

- **Location:** `clients/web/src/features/voice/stage/stagePublishMedia.ts:7-14`; caller at `clients/web/src/features/channel-panel/GuildVoiceConnectionStrip.vue:373-375`.
- **Evidence:** The helper returned `true` when its current channel lookup returned `null`, before checking whether the user is a stage speaker. A stage connection whose channel metadata had not loaded could therefore briefly enable camera or screen publication for an audience member.
- **Action:** Fail closed until channel metadata is present and add a null-channel regression.

**Verification (2026-10-04):** `canPublishStageMedia` now denies when channel metadata is absent, with an existing null-channel regression.

### R249 · Low · Discord attachment serialization discards known document sizes

- **Location:** `server/backend/src/api/routes/discordApi/serializers.ts:272-280`; source field at `contracts/types/message.ts:63-74`.
- **Evidence:** `MessageAttachmentPayload.fileSize` carries the original byte length for documents, but `serializeMessage` returned `size: 0` for every attachment. Discord-compatible clients consequently see valid nonempty documents as zero-byte files despite the stored metadata being available.
- **Action:** Preserve a valid nonnegative integer `fileSize` in the serialized attachment and add a serializer regression for known and missing sizes.

**Verification (2026-10-04):** The serializer now maps finite nonnegative attachment `fileSize` values to Discord `size` and defaults missing sizes to zero. `server/backend/src/tests/discord/permissionBits.test.ts` asserts `[123, 0]` for known and absent sizes.

## Coverage

### Remediation update (2026-10-04)

- **R174 (partially addressed):** `applyEchoChannelPlacement` now acquires a per-server transaction advisory lock before reading ordering buckets, rechecks both the source channel and destination category, and computes omitted append positions under the lock. A move whose source bucket changed while waiting returns `invalid_body` for a fresh retry. The database-backed same-bucket and cross-bucket concurrency regression remains to be added and run.
- **R181 (partially addressed):** `updateEchoRoleCategory` now checks the merged proposed default permissions and `defaultOnJoin` policy before issuing the category update, preventing the normal forbidden-patch path from mutating first. Defaults propagation remains outside a transaction, and concurrent changes during validation have not been tested.
- **R180 (addressed):** YouTube Live cleanup now uses `Promise.allSettled` for stream and broadcast deletion, so either attempt runs even if the other fails. Added `src/tests/integrations/youtubeLiveCleanup.test.ts` to verify a failed stream deletion still attempts broadcast deletion.
- **R182 (partially addressed):** Creation of the user/IP/HWID ban rows and their audit record now shares one SQL transaction. Session deletion remains a post-commit Redis/in-memory operation; a durable retry/outbox for revocation is still needed if that operation fails.
- **R183 (addressed in production path):** `resolveDiscordSyncedContentMentions` no longer inserts membership for translated user mentions; mention resolution is now read-only. A database-backed inbound/import regression proving memberships and roles remain unchanged is still needed.
- **R186 (partially addressed):** Role updates now reject non-string, unknown, or foreign-server category IDs before constructing the update while preserving an empty string as the existing clear-to-uncategorized form. The schema still lacks a composite tenant-integrity constraint, and a cross-server DB regression remains outstanding.
- **R187 (partially addressed):** Role-category creation now serializes the per-server cap check and position allocation with a transaction advisory lock. The advertised last-slot concurrency regression still needs to run against PostgreSQL.
- **R192 (partially addressed):** Friend-request creation now takes a canonical pair advisory lock around the duplicate check and insert, returning `already_related` for concurrent same- or opposite-direction requests through this DAL. A database uniqueness constraint for canonical pairs and concurrent PostgreSQL regressions remain open.
- **R185 (addressed):** `PIN_MESSAGES` now encodes Discord bit 51 instead of aliasing `MANAGE_MESSAGES` bit 13. Added focused bitfield assertions for both flags.
- **R249 (addressed):** Discord attachment serialization now preserves available nonnegative integer `fileSize` metadata (missing size remains zero); the serializer regression is included with the permission bit tests.
- **R193 (partially addressed):** Channel attention fan-out now batches unread mention rows, reply-to-self detection, and profile hydration for unread viewers, then classifies pings in memory. Per-viewer mention scan limits are preserved. The database query-count regression for large recipient sets remains open.
- **R195 (partially addressed):** Discord API helpers now pass a 20-second abort deadline to guild, channel, webhook, message, guild-count, and connection calls; OAuth helpers already used a deadline and scheduled-event calls retain their 25-second timeout. Added a regression asserting the deadline signal is present on each formerly unbounded helper. Never-resolving transport/timeout behavior still needs an explicit test.
- **R202 (addressed):** Official YouTube search, popular and related provider failures now fall back to Invidious; malformed official JSON is contained, and responses/cache report the provider that actually supplied results. Added a regression for empty/throwing official providers and actual source attribution.
- **R203 (partially addressed):** Inbound bridge claims are now inserted only after author provisioning, parsing, mention translation/filtering, and reply lookup succeed. Existing claims older than five minutes can be reclaimed, covering a process crash between claim and message insert; the message ID remains the idempotency guard. Database failure-injection and claim-takeover tests remain open.
- **R204 (partially addressed):** Public poll country headers are now ignored unless `config.trustProxy` is enabled; deployments enabling it still rely on the documented proxy requirement to strip client-supplied country headers. A trusted-proxy/direct-request regression remains to be added.
- **R205 (partially addressed):** Discord-compatible message edits now require the persisted message author to equal the bot application ID and call the edit primitive as that bot. The response’s bot author is now consistent with the validated persisted row. Route-level create/edit, installer-authored rejection and serialization regressions remain open.
- **R207 (addressed in DAL):** Ticket creation now holds a server-scoped transaction advisory lock across the open-ticket count, ticket-number allocation, and insert, preventing concurrent per-user cap bypass and duplicate number allocation through this path.
- **R208 (addressed in DAL):** Ticket channel insertion, deny/allow overwrites, ticket row insertion, and commit now share one database transaction; failures roll back the channel and permissions together. PostgreSQL injected-failure and concurrent admission regressions remain to be added.
- **R209 (addressed in DAL):** Ticket status transitions now lock the ticket row and update status/author permissions in one transaction. Closing denies only the ticket author's send permission; reopening restores that permission and clears closed metadata. Database round-trip and concurrency regressions remain open.

The review target is authored source and operational configuration. Binaries, vendored/generated bundles, lockfile entries, and narrative documentation are outside the line-by-line code target. They may be consulted to verify findings. The target inventory and file hashes still need to be recorded before claiming full coverage.

### Reviewed in full

Additional full-file review performed in this continuation: **8 files, 324 lines**.

- `bot/src/voiceSnapshotScheduler.ts`
- `bot/src/exporter/serializedExport.ts`
- `bot/src/exporter/serializedExport.test.ts`
- `server/media/src/hls/boundedObjectDownload.ts`
- `server/media/src/hls/boundedObjectDownload.test.ts`
- `contracts/marketingPollScoring.ts`
- `contracts/marketingPollScoring.test.ts`
- `contracts/attentionPing.test.ts`

Additional source and regression files fully reviewed in this continuation: **4 files, 1,121 lines**.

- `server/backend/src/api/routes/echo/youtubeSearch.ts`
- `server/backend/src/services/integrations/discordApiClient.ts`
- `server/backend/src/tests/integrations/discordApiDeadline.test.ts`
- `server/backend/src/tests/integrations/youtubeSearchFallback.test.ts`

Additional source reviewed during remediation: 248 files, 2,664 lines.

- `clients/web/src/features/layout/components/server-rail/styles/ServerRailServerIcons.scss`
- `clients/web/src/features/layout/components/server-rail/styles/_EchoRailCorner-shared.scss`
- `clients/web/src/features/server-events/echoServerEventCovers.ts`
- `clients/web/src/audio/echoSoundEvents.ts`
- `clients/web/src/features/chat/composerModel.ts`
- `clients/web/src/features/chat/composerTextualMarks.ts`
- `clients/web/src/audio/echoVoiceMicTestBridge.ts`
- `clients/web/src/features/chat/echoContentJsonMarkdown.ts`
- `clients/web/src/features/chat/ChatInput.ts`
- `clients/web/src/features/chat/MessageList.ts`
- `clients/web/src/features/voice/voiceChannelKinds.ts`
- `clients/web/src/features/voice/ticTacToe/ticTacToeCore.ts`
- `clients/web/src/features/layout/composables/controller/createPromptSignInHandler.ts`
- `clients/web/src/features/layout/composables/dm/createIsPersistedEchoDmThreadChecker.ts`
- `clients/web/src/features/layout/composables/dm/createResolveEchoDmPeerFromMap.ts`
- `clients/web/src/features/layout/composables/realtime/useLiveChannelCapabilitiesRefreshKey.ts`
- `clients/web/src/features/layout/composables/shell/createIsChannelActive.ts`
- `clients/web/src/features/auth/components/styles/LoginRegisterModal.scss`
- `clients/web/src/features/auth/styles/InlineAuthPanel.scss`
- `clients/web/src/features/auth/styles/MobileAuthExperience.scss`
- `clients/web/src/features/chat/components/styles/ChatInputComposerBar.scss`
- `clients/web/src/features/chat/composerMarkdownDecorations.ts`
- `clients/web/src/features/dm/components/styles/DmNotificationsView.scss`
- `clients/web/src/features/layout/components/server-rail/styles/EchoRailCorner.scss`
- `clients/web/src/features/paper/components/styles/PaperDocChrome.scss`
- `clients/web/src/features/voice/codenames/styles/VcCodenamesGame.scss`
- `clients/web/src/features/voice/styles/CallView.scss`
- `clients/web/src/features/chat/emoji/pollOptionEmojiDisplay.ts`
- `clients/web/src/features/layout/composables/profiles/buildAppLayoutProfileSliceDeps.ts`
- `clients/web/src/features/layout/composables/controller/createToggleBooleanRef.ts`
- `clients/web/src/features/layout/composables/controller/useComputedRefAlias.ts`
- `clients/web/src/features/layout/composables/dm/useAppLayoutDmUiContext.ts`
- `clients/web/src/features/voice/components/styles/VcActivityStage.scss`
- `clients/web/src/i18n/locales/en-US/bootstrap.json`
- `clients/web/src/observability/echoDevTrace.ts`
- `clients/apple/Resources/iOS/EchoiOS.entitlements`
- `clients/web/src/dev/echoDevTools.ts`
- `clients/web/src/features/auth/totpQrDataUrl.ts`
- `clients/web/src/features/chat/composables/useContextMenuPosition.ts`
- `clients/web/src/features/chat/composables/useReplyPreview.ts`
- `clients/web/src/features/chat/markdown/useMarkdown.ts`
- `clients/web/src/features/dm/components/styles/_DmNotificationsView-2.scss`
- `clients/web/src/features/layout/composables/controller/createVoidingInvoker.ts`
- `clients/web/src/features/layout/composables/controller/useMockDataModeOffComputed.ts`
- `clients/web/src/features/voice/components/styles/VcWatchTogetherStage.scss`
- `clients/web/src/features/chat/composables/channelMentionLabel.ts`
- `clients/web/src/features/google/googleSsoUiEnabled.ts`
- `clients/web/src/features/layout/composables/moderation/usePreviewCanModerateMembersComputed.ts`
- `clients/web/src/features/member-profile/components/styles/MemberProfileHeader.scss`
- `clients/web/src/features/server-settings/echoServerApplicationsTypes.ts`
- `clients/web/src/features/voice/components/styles/VcWatchTogetherLobby.scss`
- `server/ops/scripts/code-placement-allowlist.json`
- `server/ops/scripts/dependency-audit-allowlist.json`
- `server/ops/scripts/feature-boundaries-allowlist.json`
- `server/ops/scripts/feature-boundaries-config.json`
- `clients/web/src/assets/themes/_avatar-colors.scss`
- `clients/web/src/features/chat/domain/warmChannelCache.ts`
- `clients/web/src/features/chat/echoHistoryFetchTimeouts.ts`
- `clients/web/src/features/dm/filterDmPanelInboxUserEntries.ts`
- `clients/web/src/features/layout/composables/messaging/createCanModerateMessageAuthorAdapter.ts`
- `clients/web/src/features/layout/composables/realtime/createBumpLiveChannelCapabilitiesKey.ts`
- `clients/web/src/features/layout/composables/shell/isEchoAppActivelyFocused.ts`
- `clients/web/src/features/layout/composables/workspace/useAppLayoutWorkspaceReadyComputed.ts`
- `clients/web/src/features/layout/normalizeModerateMessageAuthorTarget.ts`
- `clients/web/src/features/paper/fonts/lohit-devanagari.css`
- `clients/web/src/assets/branding.ts`
- `clients/web/src/echoMode.ts`
- `clients/web/src/features/layout/composables/controller/buildAppLayoutContextCore.ts`
- `clients/web/src/features/layout/composables/controller/useComputedOptionalRefAlias.ts`
- `clients/web/src/features/layout/composables/controller/useMockDataModeOffComputed.test.ts`
- `clients/web/src/features/layout/composables/dm/createBeforeOpenGroupDmModal.ts`
- `clients/web/src/features/layout/composables/members/useEchoRolePreviewStateComputed.ts`
- `clients/web/src/features/layout/composables/server/createIsServerUnread.ts`
- `clients/web/src/features/layout/composables/server/createOpenCreateChannelOnServer.ts`
- `clients/web/src/features/layout/composables/shell/useHasGuildChannelChromeComputed.ts`
- `clients/web/src/features/layout/createPersistedEchoDmChannelPredicate.ts`
- `clients/web/src/features/layout/fetchInvitePreview.ts`
- `clients/web/src/features/layout/realtime/socketTransport.ts`
- `clients/web/src/features/paper/paperFeatureToggle.ts`
- `clients/web/src/features/server-settings/serverSettingsEventExpand.ts`
- `clients/web/src/features/voice/livekit/echoKrispTypes.ts`
- `clients/web/src/features/voice/livekit/livekitE2eeWorker.ts`
- `clients/web/src/features/voice/wordline/wordlineDailyCalendar.ts`
- `clients/web/src/i18n/locales/en-US/legal.json`
- `clients/web/src/features/chat/chatComposerContext.ts`
- `clients/web/src/features/chat/ingest/postDiscordChannelImportMessages.ts`
- `clients/web/src/features/dm/peerDisplayPlaceholder.ts`
- `clients/web/src/features/layout/composables/shell/createNavigateToChannelActiveOnly.ts`
- `clients/web/src/features/layout/createSelectServerFromStore.ts`
- `clients/web/src/features/paper/editor/paperMarkdownRenderState.ts`
- `clients/web/src/features/safety/echoModerationLimits.ts`
- `clients/web/src/features/voice/composables/streamVideoTileTrack.ts`
- `clients/web/src/i18n/locales/en-US/time.json`
- `clients/web/src/features/channel-panel/channelVoiceParticipantUi.ts`
- `clients/web/src/features/chat/markdown/rafCoalesce.ts`
- `clients/web/src/features/dm/mapGroupDmsToPanelList.ts`
- `clients/web/src/features/layout/composables/controller/createPromptSignInHandler.test.ts`
- `clients/web/src/features/layout/composables/controller/createUpdateCurrentUserStatusCaster.test.ts`
- `clients/web/src/features/layout/composables/messaging/createPinToggleHandlers.ts`
- `clients/web/src/features/layout/composables/messaging/useAppLayoutMessagingSurfaceAdapters.test.ts`
- `clients/web/src/features/layout/echoWorkspace/storedMessageTimestamp.ts`
- `clients/web/src/features/layout/ids/echoClientDebug.test.ts`
- `clients/web/src/features/navigation/messageNavigator.ts`
- `clients/web/src/features/server-events/echoServerEventsHttp.ts`
- `clients/web/src/features/server-settings/domain/serverSettingsPatchReducer.ts`
- `clients/web/src/features/settings/composables/useAccountLock.ts`
- `clients/web/src/features/voice/voiceE2eeActiveState.ts`
- `clients/web/src/features/voice/voiceErrorMapper.ts`
- `server/backend/crypto/package.json`
- `clients/web/src/api/echo/guild.ts`
- `clients/web/src/features/dm/createEchoDmActivityHandler.ts`
- `clients/web/src/features/layout/composables/controller/createUpdateCurrentUserStatusCaster.ts`
- `clients/web/src/features/layout/composables/rail/serverRailPinFeedback.ts`
- `clients/web/src/features/layout/composables/server/useServerNotificationLevelsMapComputed.test.ts`
- `clients/web/src/features/layout/composables/shell/createNavigateToChannelActiveOnly.test.ts`
- `clients/web/src/features/layout/echoWorkspace/workspaceFriendIdsByUserId.ts`
- `clients/web/src/features/layout/failures/voiceJoinUserMessage.ts`
- `clients/web/src/features/layout/incomingChatToastDmDismiss.ts`
- `clients/web/src/features/member-profile/widgets.ts`
- `clients/web/src/features/paper/PaperEditorPanel.vue`
- `clients/web/src/features/pdf/configurePdfWorker.ts`
- `clients/web/src/features/server-notifications/buildServerNotificationLevelsMap.test.ts`
- `clients/web/src/features/settings/components/SettingsLegal.vue`
- `clients/web/src/features/settings/contactMasking.ts`
- `clients/web/src/i18n/locales/en-US/auth.json`
- `server/ops/perf/tsconfig.json`
- `clients/web/src/audio/incomingChatMessageNotifyDetail.ts`
- `clients/web/src/features/layout/realtime/echoSocketWarmConnect.ts`
- `clients/web/src/features/chat/composables/channelMentionLabel.test.ts`
- `clients/web/src/features/chat/composables/messageListScrollGestureKeys.ts`
- `clients/web/src/features/layout/composables/controller/useComputedRefAlias.test.ts`
- `clients/web/src/features/layout/composables/dm/createIsPersistedEchoDmThreadChecker.test.ts`
- `clients/web/src/features/layout/composables/dm/createResolveEchoDmPeerFromMap.test.ts`
- `clients/web/src/features/layout/composables/dm/useAppLayoutDmPeerSelectionOpen.ts`
- `clients/web/src/features/layout/composables/workspace/useAppLayoutWorkspaceFriendshipQueries.ts`
- `clients/web/src/features/layout/composables/workspace/useAppLayoutWorkspaceReadyComputed.test.ts`
- `clients/web/src/features/layout/createSelectServerFromStore.test.ts`
- `clients/web/src/features/layout/ids/echoClientSnowflake.ts`
- `clients/web/src/features/paper/editor/applyPaperMarkdownToEditor.ts`
- `clients/web/src/features/server-notifications/buildServerNotificationLevelsMap.ts`
- `clients/web/src/features/voice/codenames/styles/_VcCodenamesGame-2.scss`
- `clients/web/src/i18n/locales/en-US/common.json`
- `clients/web/src/features/chat/composables/useMessageLinkActions.ts`
- `clients/web/src/features/chat/emoji/emojiTokenResolve.ts`
- `clients/web/src/features/chat/localUploadReadUrl.ts`
- `clients/web/src/features/layout/actions/wireMessageIntoAppActionRegistryDraft.ts`
- `clients/web/src/features/layout/components/CompactStackShellFrame.vue`
- `clients/web/src/features/layout/composables/realtime/createBumpLiveChannelCapabilitiesKey.test.ts`
- `clients/web/src/features/layout/composables/shell/createIsChannelActive.test.ts`
- `clients/web/src/features/layout/createChatSoundMemberRoleIdsGetter.ts`
- `clients/web/src/features/layout/echoWorkspace/echoOutboundPresenceClient.ts`
- `clients/web/src/features/paper/editor/paperExport.test.ts`
- `clients/web/src/features/voice/wordline/wordlineConstants.ts`
- `clients/web/src/features/voice/wordline/wordlineServerGameRoundMessage.ts`
- `server/ops/scripts/tsconfig.json`
- `clients/web/src/assets/document-canvas.scss`
- `clients/web/src/features/auth/guestWelcomeLayout.ts`
- `clients/web/src/features/chat/composables/imageSearchSeedKeywords.test.ts`
- `clients/web/src/features/chat/send/sendOrchestration.ts`
- `clients/web/src/features/forums/postDiscordForumImportMessages.ts`
- `clients/web/src/features/chat/localUploadReadUrl.test.ts`
- `clients/web/src/features/layout/composables/controller/createAppLayoutActionsFromRegistry.ts`
- `clients/web/src/features/layout/composables/controller/createAppLayoutController.ts`
- `clients/web/src/features/layout/composables/dm/useAppLayoutDmUiContext.test.ts`
- `clients/web/src/features/layout/composables/dm/useDmCallWithUserIdShellLogMirror.ts`
- `clients/web/src/features/layout/composables/messaging/createPinToggleHandlers.test.ts`
- `clients/web/src/features/layout/composables/moderation/usePreviewCanModerateMembersComputed.test.ts`
- `clients/web/src/features/layout/composables/server/useCanDeleteCurrentEchoServerComputed.ts`
- `clients/web/src/features/layout/composables/server/useServerNotificationLevelsMapComputed.ts`
- `clients/web/src/features/layout/display/domFullscreen.test.ts`
- `clients/web/src/features/layout/instancePolicyClient.ts`
- `clients/web/src/features/paper/editor/setPaperMarkdownRenderInline.ts`
- `clients/web/src/features/settings/formattingGuideDocs.ts`
- `clients/web/src/features/voice/components/styles/_VcActivityStage-shared.scss`
- `clients/web/src/features/voice/stage/stagePublishMedia.ts`
- `clients/web/src/i18n/locales/en-GB.json`
- `server/ops/scripts/echo-routes-sql-allowlist.json`
- `clients/apple/Resources/macOS/EchoMacOS.entitlements`
- `clients/web/src/audio/voiceData/ticTacToe.ts`
- `clients/web/src/features/chat/markdown/discordEmbedMarkdown.ts`
- `clients/web/src/features/dm/createHandleAcceptMessageRequestOpener.ts`
- `clients/web/src/features/dm/mapGroupDmsToPanelList.test.ts`
- `clients/web/src/features/dm/mergeEchoResolvedPeersIntoWorkspace.test.ts`
- `clients/web/src/features/layout/actions/wireNavigationIntoAppActionRegistryDraft.ts`
- `clients/web/src/features/layout/composables/controller/createVoidingInvoker.test.ts`
- `clients/web/src/features/layout/composables/controller/useAppLayoutController.ts`
- `clients/web/src/features/dm/createHandleAcceptMessageRequestOpener.test.ts`
- `clients/web/src/features/voice/stage/stagePublishMedia.test.ts`
- `clients/web/src/features/layout/composables/dm/createBeforeOpenGroupDmModal.test.ts`
- `clients/web/src/features/layout/composables/members/useAppLayoutMemberSurfaceSwitchLoading.ts`
- `clients/web/src/features/member-profile/index.ts`
- `clients/web/src/features/navigation/chatMessageNavBridge.ts`
- `clients/web/src/features/pdf/withTimeout.test.ts`
- `clients/web/src/features/server-settings/serverSettingsEventExpand.test.ts`
- `clients/web/src/features/voice/voiceProcessingInjection.ts`
- `contracts/attentionMentionIdentity.ts`
- `contracts/rolePermissionPairs.ts`
- `clients/web/src/features/chat/domain/messageListScrollPolicy.ts`
- `clients/web/src/features/dm/createEchoDmActivityHandler.test.ts`
- `clients/web/src/features/dm/workspaceFriendshipQueries.ts`
- `clients/web/src/features/layout/boot/appLayoutChunkPrefetch.ts`
- `clients/web/src/features/layout/composables/dm/useAppLayoutDmGroupFriendsComputed.ts`
- `clients/web/src/features/layout/echoWorkspace/echoUserSearch.ts`
- `clients/web/src/features/paper/editor/paperMarkdownRenderState.test.ts`
- `clients/web/src/features/voice/voiceRouting.ts`
- `server/ops/scripts/lib/composeProjectName.test.mjs`
- `clients/web/src/api/echo/bugReports.ts`
- `clients/web/src/features/chat/composables/media/useExclusiveMediaPlayback.ts`
- `clients/web/src/features/chat/composables/mediaFavoriteStarBtnClass.ts`
- `clients/web/src/features/chat/send/sendOrchestration.test.ts`
- `clients/web/src/features/dm/filterVisibleDmInbox.ts`
- `clients/web/src/features/games/gameRoomSessionConnection.ts`

Bot authored source is complete: 25 TypeScript files, 3,438 lines. Four bot configuration files were also reviewed. The 29 reviewed files total 3,508 lines.

- `.env.example`
- `.env.perf.example`
- `.gitattributes`
- `.gitignore`
- `.gitlab-ci.yml`
- `.node-version`
- `.nvmrc`
- `.prettierignore`
- `.prettierrc`
- `.github/workflows/codeql.yml`
- `.github/workflows/dependency-review.yml`
- `.github/workflows/echo-backend-ci.yml`
- `.github/workflows/echo-e2e-ci.yml`
- `.github/workflows/echo-format-ci.yml`
- `.github/workflows/echo-web-ci.yml`
- `.github/workflows/echo-workspaces-ci.yml`
- `.github/workflows/secret-scan.yml`
- `.github/workflows/security-audit.yml`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/codeql/codeql-config.yml`
- `.github/codeql/echo-link-unfurl-ssrf-models/link-unfurl-ssrf.yml`
- `.github/codeql/echo-link-unfurl-ssrf-models/qlpack.yml`
- `.github/dependabot.yml`
- `docker-compose.yml`
- `echo.instance.example.json`
- `ecosystem.config.cjs`
- `package.json`
- `server/voice/package.json`
- `server/voice/src/adapter/livekitTypes.ts`
- `server/voice/src/config.ts`
- `server/voice/src/index.ts`
- `server/voice/src/jobs/diffEmitter.ts`
- `server/voice/src/jobs/policyEvaluator.ts`
- `server/voice/src/jobs/stateBuilder.ts`
- `server/voice/src/metrics.ts`
- `server/voice/src/pipeline.ts`
- `server/voice/src/tests/config.test.ts`
- `server/voice/src/tests/run.ts`
- `server/voice/src/tests/verifyEchoForwardSignature.test.ts`
- `server/voice/src/types.ts`
- `server/voice/src/verifyEchoForwardSignature.ts`
- `server/voice/tsconfig.json`
- `server/media/package.json`
- `server/media/src/cachePolicy.ts`
- `server/media/src/config.ts`
- `server/media/src/hls/jobs/drain.ts`
- `server/media/src/hls/jobs/listen.ts`
- `server/media/src/hls/jobs/notify.ts`
- `server/media/src/hls/jobs/scheduler.ts`
- `server/media/src/hls/objectStore.ts`
- `server/media/src/hls/processor.ts`
- `server/media/src/hls/worker.ts`
- `server/media/src/index.ts`
- `server/media/src/localOrigin.ts`
- `server/media/src/metrics.ts`
- `server/media/src/objectBuffer.ts`
- `server/media/src/rasterImageTransform.ts`
- `server/media/src/routes/objectGet.ts`
- `server/media/src/s3Origin.ts`
- `server/media/src/tests/hls/echoVideoHls.golden.test.ts`
- `server/media/src/tests/hls/videoHlsNotify.test.ts`
- `server/media/src/tests/run.ts`
- `server/media/src/tokenGate.ts`
- `server/media/src/uploadBackend.ts`
- `server/media/tsconfig.json`
- `server/activities/cores/games/codenames/core.ts`
- `server/activities/cores/games/codenames/index.ts`
- `server/activities/cores/games/codenames/types.ts`
- `server/activities/cores/games/hangman/index.ts`
- `server/activities/cores/games/index.ts`
- `server/activities/cores/games/skriggles/core.ts`
- `server/activities/cores/games/skriggles/guess.ts`
- `server/activities/cores/games/skriggles/index.ts`
- `server/activities/cores/games/skriggles/scoring.ts`
- `server/activities/cores/games/ticTacToe/holyc/build-engine.sh`
- `server/activities/cores/games/ticTacToe/index.ts`
- `server/activities/cores/games/wordline/index.ts`
- `server/activities/package.json`
- `server/activities/src/auth/verifyEchoForwardSignature.ts`
- `server/activities/src/auth/verifyGameToken.ts`
- `server/activities/src/config/productionGates.ts`
- `server/activities/src/core/tickScheduler.ts`
- `server/activities/src/games/registry.ts`
- `server/activities/src/metrics.ts`
- `server/activities/src/realtime/compositeEmitter.ts`
- `server/activities/src/realtime/connectNats.ts`
- `server/activities/src/realtime/echoRelayPoster.ts`
- `server/activities/src/realtime/membership.ts`
- `server/activities/src/realtime/tunneledMembership.ts`
- `server/activities/src/tests/fixtures/holycMalformedEngine.js`
- `server/activities/src/tests/holycEngine.test.ts`
- `server/activities/src/tests/holycTicTacToeContract.test.ts`
- `server/activities/src/tests/productionConfigGates.test.ts`
- `server/activities/src/tests/run.ts`
- `server/activities/tsconfig.json`
- `server/activities/cores/games/codenames/board.ts`
- `server/activities/cores/games/codenames/roster.ts`
- `server/activities/cores/games/protocol.ts`
- `server/activities/cores/games/skriggles/types.ts`
- `server/activities/cores/games/ticTacToe/holyc/echo_ttt.HC`
- `server/activities/cores/games/wordline/core.ts`
- `server/activities/cores/vcActivityCatalog.ts`
- `server/activities/src/config.ts`
- `server/activities/src/core/GameModule.ts`
- `server/activities/src/core/RoomManager.ts`
- `server/activities/src/index.ts`
- `server/activities/src/tests/codenames.socket.test.ts`
- `server/activities/src/tests/fixtures/holycTicTacToeEngine.js`
- `server/activities/src/core/GameInstance.ts`
- `server/activities/src/realtime/socket.ts`
- `server/activities/src/http/internalGameRoutes.ts`
- `server/activities/cores/games/hangman/core.ts`
- `server/activities/cores/games/ticTacToe/core.ts`
- `server/activities/src/games/hangman/index.ts`
- `server/activities/src/games/ticTacToe/index.ts`
- `server/activities/src/games/wordline/index.ts`
- `server/activities/cores/games/codenames/reducer.ts`
- `server/activities/cores/games/codenames/wordBank.ts`
- `server/activities/cores/games/skriggles/guessing.ts`
- `server/activities/cores/games/skriggles/rounds.ts`
- `server/activities/cores/games/skriggles/wordBank.ts`
- `server/activities/cores/games/ticTacToe/holyc/echo_ttt_process.HC`
- `server/activities/cores/games/wordline/constants.ts`
- `server/activities/src/games/codenames/index.ts`
- `server/activities/src/games/skriggles/index.ts`
- `server/activities/src/games/ticTacToe/holyc.ts`
- `server/activities/src/games/ticTacToe/holycEngine.ts`
- `server/activities/src/tests/hangman.socket.test.ts`
- `server/activities/src/tests/roomLifecycle.test.ts`
- `server/activities/src/tests/ticTacToe.socket.test.ts`
- `marketing/package.json`
- `marketing/astro.config.mjs`
- `marketing/src/lib/canonicalUrl.ts`
- `marketing/src/lib/seo.ts`
- `marketing/src/lib/statusMonitor.ts`
- `marketing/src/components/LegalMarkdownArticle.astro`
- `marketing/src/components/SiteFooter.astro`
- `marketing/src/components/SiteHeader.astro`
- `marketing/src/env.d.ts`
- `marketing/src/i18n/en.json`
- `marketing/src/layouts/BaseLayout.astro`
- `marketing/src/layouts/MarketingShell.astro`
- `marketing/src/lib/i18n.ts`
- `marketing/src/lib/renderLegalMarkdown.ts`
- `marketing/src/pages/attributions.astro`
- `marketing/src/pages/community-guidelines.astro`
- `marketing/src/pages/message-formatting.astro`
- `marketing/src/pages/message-math.astro`
- `marketing/src/pages/privacy.astro`
- `marketing/src/pages/terms.astro`
- `marketing/src/site.ts`
- `marketing/tsconfig.json`
- `marketing/src/components/PrivacyIdWidget.astro`
- `marketing/src/components/VoiceCallWidget.astro`
- `marketing/src/components/ShareScreenWidget.astro`
- `marketing/src/pages/download.astro`
- `marketing/src/pages/status.astro`
- `marketing/src/pages/support.astro`
- `marketing/src/pages/index.astro`
- `marketing/src/pages/communities.astro`
- `marketing/src/lib/adelApprovalPoll/questions.ts`
- `marketing/src/lib/adelApprovalPoll/client.ts`
- `marketing/src/pages/poll.astro`
- `marketing/src/styles/_footer.scss`
- `marketing/src/styles/_header.scss`
- `marketing/src/styles/global.scss`
- `clients/apple/MlsBridge/build.mjs`
- `clients/apple/MlsBridge/shims/e2eeBase64.ts`
- `clients/apple/MlsBridge/shims/persistence.ts`
- `clients/apple/MlsBridge/shims/transport.ts`
- `clients/apple/MlsBridge/smoke-prepare.mjs`
- `clients/apple/MlsBridge/src/prepare.ts`
- `clients/apple/project.yml`
- `clients/apple/scripts/check-maintainability.mjs`
- `clients/apple/scripts/check-maintainability.test.mjs`
- `clients/apple/scripts/sync-sounds.sh`
- `clients/apple/Resources/iOS/Assets.xcassets/EchoLaunchBackground.colorset/Contents.json`
- `clients/apple/Resources/iOS/Assets.xcassets/AppIcon.appiconset/Contents.json`
- `clients/apple/Resources/iOS/Assets.xcassets/EchoLaunchWordmark.imageset/Contents.json`
- `clients/apple/Resources/iOS/Assets.xcassets/EchoLaunchLogo.imageset/Contents.json`
- `clients/apple/Resources/macOS/Assets.xcassets/AppIcon.appiconset/Contents.json`
- `clients/apple/Resources/macOS/Assets.xcassets/EchoLaunchWordmark.imageset/Contents.json`
- `clients/apple/Apps/iOS/EchoiOSApp.swift`
- `clients/apple/Apps/macOS/EchoMacOSApp.swift`
- `clients/apple/Modules/EchoDomain/Sources/EchoUserProfile.swift`
- `clients/apple/Modules/EchoDomain/Sources/EchoDirectMessage.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Authentication/EchoAccountSecuritySheet.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Authentication/EchoAppBadge.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Authentication/EchoAppleAuthorizationProvider.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Authentication/EchoBackgroundRefresh.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Authentication/EchoAuthenticationModel.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Authentication/EchoPasskeyLogin.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Authentication/EchoPasskeyRegistrationSheet.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Authentication/EchoPasskeyRegistration.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Authentication/EchoPushRegistration.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Authentication/EchoAuthenticationView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Authentication/EchoTotpSetupSheet.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Calling/EchoVoiceE2EEPrepare.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Calling/EchoMlsMediaKey.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Calling/EchoCallTransport.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Calling/EchoCallModel.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Calling/EchoMlsJsRuntime.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Calling/EchoCallView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Calling/EchoSystemCallCoordinator.swift`
- `clients/apple/Modules/EchoFeatures/Sources/EchoRootView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoInboxModel.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoHiddenDmInboxStore.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoMediaCollagePlan.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoHomeModel.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoInboxView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoConversationSearchFilters.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoConversationChrome.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoHomeView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoMessageSearchModel.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoConversationSearchView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoComposerModels.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoComposerPendingPreview.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoComposerPhotoLibrary.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoPollComposer.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoExpressionPicker.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoInlineMarkdownEditor.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/Composer/EchoMessageComposer.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoMessageMediaCollage.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoMessageReplyViews.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoPinnedMessagesView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoPollDisplay.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoRealtimeSession.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoInboxSections.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoAddFriendView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoMessageRow.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoMessageTimeline.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoMessageTimelineModel.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Home/EchoHomeChrome.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Profile/EchoFullProfileModel.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Profile/EchoProfileMenu.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Profile/EchoPublicBadgeID.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Profile/EchoFullProfileView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Profile/EchoProfileUserBadges.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Profile/EchoProfileEditView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoLocaleOptions.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingsAccountState.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingsAction.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSoundPlayback.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoCallRingtoneStore.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSoundOption.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingsSlider.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingsToggle.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoAccountRows.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingsPresentation.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingDetailModel.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingsView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingChoiceControls.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingsRow.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingsSheetSupport.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoRingtoneCatalog.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoRingtoneSettingsSection.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingAccountSheets.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoNativeSettingsPages.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingDetailView+Sections.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoThemePicker.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSoundPlayer.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSoundWidget.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Settings/EchoSettingDetailView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoCopy.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoScrollFriendlyButtonStyle.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoNetworkRecovery.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoAvatar.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoCustomEmojiCatalog.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoDensityMetrics.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoEmojiOnlySizing.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownModels.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoGifHostLinks.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoURLPolicy.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownDisplayStyle.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMediaCaches.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMediaImage.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoRemoteImage.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownBlockCache.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownCustomEmoji.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoGlassBackground.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoPresenceIndicator.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMediaViewerItem.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMediaViewer.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMediaPlayer.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownMath.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoDisplayPreferences.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoLetterboxMatte.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoZoomableScrollImage.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoProfileBanner.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoSwipeActionModifier.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoWelcomeView.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownInlineViews.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownParser.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoMarkdownBlockViews.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoTheme.swift`
- `clients/apple/Modules/EchoFeatures/Sources/Shared/EchoWelcomeScene.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoUserProfileCache.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoSettingsClient+Payloads.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoAPIConfiguration.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoNetworkPath.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoHTTPClient.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoHomeServing.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoCallingClient.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoMediaSignClient.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoRealtimeClient.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoMlsClient.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoAuthenticationClient.swift`
- `clients/apple/Modules/EchoPersistence/Sources/SessionStore.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoSettingsModels.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoHomeModels.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoRealtimePayloads.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoHomeClient.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoHomeClient+Payloads.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoSettingsClient.swift`
- `clients/apple/Modules/EchoNetworking/Sources/EchoSocketIORealtimeClient.swift`
- `clients/apple/Package.swift`
- `clients/apple/Tests/EchoDomainTests/EchoDomainModelTests.swift`
- `clients/apple/Tests/EchoPersistenceTests/EchoPersistenceTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoAuthenticationModelTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoBannerEffectsTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoComposerCustomEmojiTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoComposerStateTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoEmojiOnlySizingTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoGifHostLinksTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoInboxModelTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoLetterboxMatteTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoMediaCollagePlanTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoMediaViewerSessionTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoMlsBridgeSmokeTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoMlsJSTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoMlsMediaKeyTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoNotificationPolicyTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoPublicBadgeTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoReplyAndHiddenDmTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoRingtoneCatalogTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoSettingsAccountStateTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoSettingsAndCopyTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoURLPolicyTests.swift`
- `clients/apple/Tests/EchoNetworkingTests/EchoMutualServersTests.swift`
- `clients/apple/Tests/EchoNetworkingTests/EchoURLProtocolHarness.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoLocaleGlossaryTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoMessageSearchModelTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoMarkdownParserTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoAppearanceTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoHomeModelTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoCallModelTests.swift`
- `clients/apple/Tests/EchoNetworkingTests/EchoCallingNetworkingTests.swift`
- `clients/apple/Tests/EchoNetworkingTests/EchoNetworkingHomeRealtimeTests.swift`
- `clients/apple/Tests/EchoNetworkingTests/EchoNetworkingModelTests.swift`
- `clients/apple/Tests/EchoFeaturesTests/EchoMessageTimelineModelTests.swift`
- `clients/web/cypress.config.ts`
- `clients/web/index.html`
- `clients/web/stylelint.config.mjs`
- `clients/web/tailwind.config.js`
- `clients/web/tsconfig.json`
- `clients/web/tsconfig.node.json`
- `clients/web/vitest.config.ts`
- `clients/web/package.json`
- `clients/web/eslint.config.js`
- `clients/web/vite.config.ts`
- `clients/web/vite-plugins/spaSecurityHeadersPlugin.ts`
- `clients/web/vite-plugins/spaSeoPlugin.ts`
- `clients/web/vite-plugins/consoleLogDevPlugin.ts`
- `clients/web/vite-plugins/iconRenameDevPlugin.ts`
- `clients/web/vite-shims/node-builtin-stub.js`
- `clients/web/cypress/e2e/chat-shell.cy.ts`
- `clients/web/cypress/e2e/proxy-and-routes.cy.ts`
- `clients/web/cypress/e2e/server-rail-reorder.cy.ts`
- `clients/web/cypress/e2e/smoke.cy.ts`
- `clients/web/cypress/support/e2e.ts`
- `clients/web/scripts/verify-e2e-smoke.mjs`
- `clients/web/scripts/verify-image-slot-fill.mjs`
- `clients/web/scripts/verify-message-list-layout.mjs`
- `clients/web/scripts/run-image-slot-fill-verify.sh`
- `clients/web/scripts/run-message-list-layout-verify.sh`
- `clients/web/scripts/run-message-list-scroll-verify.sh`
- `clients/web/src/config/appLoadUi.ts`
- `clients/web/src/config/compactShell.ts`
- `clients/web/src/config/customEmojiDecisions.ts`
- `clients/web/src/config/echoGuestAccountsEnabled.ts`
- `clients/web/src/config/echoGuestAccountsRuntime.ts`
- `clients/web/src/config/echoIosNativeFeatures.ts`
- `clients/web/src/config/echoPasskeysEnabled.ts`
- `clients/web/src/config/echoPublicSupportContact.ts`
- `clients/web/src/config/emailVerificationDowntime.ts`
- `clients/web/src/config/screenShareUi.ts`
- `clients/web/src/platform/browserCompatibility.test.ts`
- `clients/web/src/platform/browserCompatibility.ts`
- `clients/web/src/platform/createEchoPlatform.ts`
- `clients/web/src/platform/desktopBridge.test.ts`
- `clients/web/src/platform/desktopBridge.ts`
- `clients/web/src/platform/keys.ts`
- `clients/web/src/platform/reloadEchoApp.test.ts`
- `clients/web/src/platform/reloadEchoApp.ts`
- `clients/web/src/platform/syncCapabilities.ts`
- `clients/web/src/platform/usePlatform.ts`
- `clients/web/src/platform/webglSupport.test.ts`
- `clients/web/src/platform/webglSupport.ts`
- `bot/.env.example`
- `bot/.gitignore`
- `bot/package.json`
- `bot/src/botHealth.ts`
- `bot/src/bridgeRelay.ts`
- `bot/src/config.ts`
- `bot/src/echoApi.ts`
- `bot/src/echoFetch.ts`
- `bot/src/exportCompleteness.ts`
- `bot/src/exportPermissions.ts`
- `bot/src/exporter/assets.ts`
- `bot/src/exporter/channelSerialize.ts`
- `bot/src/exporter/effectivePermissionsSample.ts`
- `bot/src/exporter/messages.ts`
- `bot/src/exporter/phaseMembers.ts`
- `bot/src/exporter/phaseOptional.ts`
- `bot/src/exporter/phaseGuild.ts`
- `bot/src/exporter/runFullExport.ts`
- `bot/src/index.ts`
- `bot/src/presenceRelay.ts`
- `bot/src/recoveryWatchdog.ts`
- `bot/src/server.ts`
- `bot/src/tests/numberParsing.test.ts`
- `bot/src/util/fs.ts`
- `bot/src/util/numberParsing.ts`
- `bot/src/util/rateLimitQueue.ts`
- `bot/src/uptimeMonitor.ts`
- `bot/src/voiceMirrorRelay.ts`
- `bot/tsconfig.json`
- `contracts/channelKinds.ts`
- `contracts/buttonRow.ts`
- `contracts/buttonRow.test.ts`
- `contracts/buttonRowContentJson.ts`
- `contracts/buttonRowContentJson.test.ts`
- `contracts/attentionPing.ts`
- `contracts/chatE2eePolicy.ts`
- `contracts/chatMediaRetention.ts`
- `contracts/clientEnvironment.ts`
- `contracts/diagnostics.ts`
- `contracts/discordBridgeSources.ts`
- `contracts/deployAnnouncement.ts`
- `contracts/discordEchoPermissions.ts`
- `contracts/discordEmbedApi.ts`
- `contracts/discordEmbedApi.test.ts`
- `contracts/discordEmbedMarkdown.ts`
- `contracts/discordEmbedMarkdown.test.ts`
- `contracts/discordMessageComponents.ts`
- `contracts/discordMessageComponents.test.ts`
- `contracts/echoContractV1.ts`
- `contracts/echoAccountBadges.ts`
- `contracts/echoAccountBadges.test.ts`
- `contracts/echoChannelLimits.ts`
- `contracts/echoEmojiCdn.ts`
- `contracts/echoExtendedPermissions.ts`
- `contracts/echoLocale.ts`
- `contracts/echoJumpEmbedErrors.ts`
- `contracts/echoJumpEmbedErrors.test.ts`
- `contracts/echoMarketingSeo.ts`
- `contracts/echoMarketingSeo.test.ts`
- `contracts/echoMessageFormatV2.ts`
- `contracts/echoMessageJumpPath.ts`
- `contracts/echoPlanLimits.ts`
- `contracts/echoReservedRoles.ts`
- `contracts/echoRoleScope.ts`
- `contracts/echoRoleTypes.ts`
- `contracts/echoS3ReadThrough.ts`
- `contracts/echoUploadStorageKey.ts`
- `contracts/echoWebhookHmac.ts`
- `contracts/exploreDirectoryExcludedNames.ts`
- `contracts/gifHostLinks.ts`
- `contracts/gifHostLinks.test.ts`
- `contracts/idTokens.ts`
- `contracts/imageSlot.ts`
- `contracts/imageSlot.test.ts`
- `contracts/imageSlotContentJson.ts`
- `contracts/imageSlotContentJson.test.ts`
- `contracts/integrationKillSwitches.ts`
- `contracts/instancePolicy.ts`
- `contracts/instancePolicySchema.json`
- `contracts/linkEmbedCandidates.ts`
- `contracts/linkEmbedCandidates.test.ts`
- `contracts/messageAutoDelete.ts`
- `contracts/messageChunkLimits.ts`
- `contracts/messageCreateWire.ts`
- `contracts/messageCreateWire.test.ts`
- `contracts/messageReactionsWire.ts`
- `contracts/messageReactionsWire.test.ts`
- `contracts/mediaCdn.ts`
- `contracts/mediaCdn.test.ts`
- `contracts/mediaCdnSigning.ts`
- `contracts/mediaCdnVariants.ts`
- `contracts/mediaCdnVariants.test.ts`
- `contracts/networkPayloadEstimate.test.ts`
- `contracts/package.json`
- `contracts/paperContentJson.ts`
- `contracts/profileBannerColor.ts`
- `contracts/richBlockToken.ts`
- `contracts/richBlockToken.test.ts`
- `contracts/richBlockContentJson.ts`
- `contracts/rolePermissionBridge.ts`
- `contracts/snowflakeIds.ts`
- `contracts/safetyReports.ts`
- `contracts/systemChannels.ts`
- `contracts/types/api.ts`
- `contracts/types/bannedWords.ts`
- `contracts/types/channel.ts`
- `contracts/types/discordImport.ts`
- `contracts/types/domains/api.ts`
- `contracts/types/domains/auth.ts`
- `contracts/types/domains/chat.ts`
- `contracts/types/domains/server.ts`
- `contracts/types/domains/socket.ts`
- `contracts/types/forumCreator.ts`
- `contracts/types/index.ts`
- `contracts/types/messageReactionOrder.ts`
- `contracts/types/message.ts`
- `contracts/types/paper.ts`
- `contracts/types/paperCollab.ts`
- `contracts/types/paperEmptyDocument.ts`
- `contracts/types/paperShare.ts`
- `contracts/types/pollRedaction.ts`
- `contracts/types/presence.ts`
- `contracts/types/selfAssignableRoles.ts`
- `contracts/types/server.ts`
- `contracts/types/socket.ts`
- `contracts/types/ticket.ts`
- `contracts/types/user.ts`
- `contracts/usernamePolicy.ts`
- `contracts/usernamePolicy.test.ts`
- `contracts/videoEmbedIds.ts`
- `contracts/voiceChannelBitrateLimits.ts`
- `contracts/voiceChannelKinds.ts`
- `contracts/voiceQosSample.ts`
- `server/backend/src/config/instancePolicy/validateInstancePolicy.ts`

- `server/backend/src/bootstrap/createFastify.ts`
- `server/backend/src/bootstrap/echoHttpObservability.ts`
- `server/backend/src/bootstrap/echoReadRateLimitPaths.ts`
- `server/backend/src/bootstrap/errorHandler.ts`
- `server/backend/src/bootstrap/gatewayWebsocket.test.ts`
- `server/backend/src/bootstrap/gatewayWebsocket.ts`
- `server/backend/src/bootstrap/httpPlugins.ts`
- `server/backend/src/bootstrap/socket.ts`
- `server/backend/src/bootstrap/startServer.ts`
- `server/backend/src/db/nats.ts`
- `server/backend/src/db/pgQueryContext.ts`
- `server/backend/src/db/pgErrors.ts`
- `server/backend/src/db/pg.ts`
- `server/backend/src/db/index.ts`
- `server/backend/src/db/ensureAppSchema.ts`
- `server/backend/src/db/echoMessageSearchIndexHealth.ts`
- `server/backend/src/db/echoSchemaMigration.ts`
- `server/backend/src/db/repairEchoVoiceChannelMigration.ts`
- `server/backend/src/db/botTables.ts`
- `server/backend/src/db/integrationTables.ts`
- `server/backend/src/db/serperImageSearchCacheTables.ts`
- `server/backend/src/db/authTables.ts`
- `server/backend/src/db/echoTables.ts`
- `server/backend/src/domain/cacheInvalidationBus.ts`
- `server/backend/src/sockets/channelFanoutTransport.ts`
- `server/backend/src/sockets/channelBroadcast.ts`
- `server/backend/src/tests/servers/echo.multinode.integration.ts`
- `server/backend/src/tests/voice/echo.voiceChannelMigrationRepair.test.ts`
- `server/backend/src/domain/echoStore/bootstrap.ts`
- `server/backend/src/constants/ioredisEchoClient.ts`
- `server/backend/src/auth/accountPolicy.ts`
- `server/backend/src/api/globalRateLimitKey.ts`
- `server/backend/src/shared/numberParsing.ts`
- `server/backend/src/auth/token.ts`
- `server/backend/src/auth/store.ts`
- `server/backend/src/auth/clipUserAgent.ts`
- `server/backend/src/auth/email.ts`
- `server/backend/src/auth/pkce.ts`
- `server/backend/src/auth/legacyBearer.ts`
- `server/backend/src/auth/gameToken.ts`
- `server/backend/src/auth/verifyEmailFlow.ts`
- `server/backend/src/auth/authUserLastSeenIp.ts`
- `server/backend/src/auth/authSessionResponse.ts`
- `server/backend/src/auth/revokeNativePushToken.ts`
- `server/backend/src/auth/federatedOAuthEncryptionGate.ts`
- `server/backend/src/auth/phoneE164.ts`
- `server/backend/src/auth/webauthnChallenge.ts`
- `server/backend/src/auth/oauthCookieIntegrity.ts`
- `server/backend/src/auth/loginAudit.ts`
- `server/backend/src/auth/totpVerify.ts`
- `server/backend/src/auth/recoveryCodes.ts`
- `server/backend/src/auth/store/index.ts`
- `server/backend/src/auth/store/helpers.ts`
- `server/backend/src/auth/smsOtpHmac.ts`
- `server/backend/src/auth/discordTokenCrypto.ts`
- `server/backend/src/auth/guestDisplayNames.ts`
- `server/backend/src/auth/oauthLoginOrigin.ts`
- `server/backend/src/auth/disposableEmailDomains.ts`
- `server/backend/src/auth/totpCrypto.ts`
- `server/backend/src/config/instancePolicy/index.ts`
- `server/backend/src/config/instancePolicy/instancePolicySchema.ts`
- `server/backend/src/config/instancePolicy/envOverrideHelpers.ts`
- `server/backend/src/config/corsAndUrls.ts`
- `server/backend/src/config/csamPrecompute.ts`
- `server/backend/src/config/envParsing.ts`
- `server/backend/src/api/routes/passkeyRoutes.ts`
- `server/backend/src/auth/issueBrowserSession.ts`
- `server/backend/src/auth/totpReplayCache.ts`
- `server/backend/src/auth/sessionClientContext.ts`
- `server/backend/src/auth/nativeBearer.ts`
- `server/backend/src/auth/defaultAvatarPfp.ts`
- `server/backend/src/auth/stepUpAuth.ts`
- `server/backend/src/auth/csrf.ts`
- `server/backend/src/auth/sessionCookies.ts`
- `server/backend/src/auth/types.ts`
- `server/backend/src/config/storage.ts`
- `server/backend/src/config/secrets.ts`
- `server/backend/src/config/loadEnv.ts`
- `server/backend/src/config/instancePolicy/resolveHttpRateLimit.ts`
- `server/backend/src/config/instancePolicy/loadInstancePolicy.ts`
- `server/backend/src/config/instancePolicy/hotReload.ts`
- `server/backend/src/config/instancePolicy/envOverrides.ts`
- `server/backend/src/config/productionGates.ts`
- `server/backend/src/config/validateConfig.ts`
- `server/backend/src/config.ts`
- `server/backend/src/tests/fixtures/permission-old-partial.json`
- `server/backend/src/tests/permissions/fixtures/permission-old-partial.json`
- `server/backend/src/services/sms/otpMessage.ts`
- `server/backend/src/sockets/sanitizeAttachmentStorageKey.ts`
- `server/backend/src/domain/permissions/aggregateServerRoles.ts`
- `server/backend/src/shared/safeCompare.ts`
- `server/backend/src/services/csamScan/types.ts`
- `server/backend/src/api/routes/echo/mutationRateLimits.ts`
- `server/backend/src/services/twemojiAssetUrl.ts`
- `server/backend/src/sockets/echoMessageFlow.ts`
- `server/backend/src/domain/echoMessagePollRedaction.ts`
- `server/backend/src/domain/emailVerificationUrls.ts`
- `server/backend/src/domain/permissions/permissionLayers.ts`
- `server/backend/src/api/rateLimitKeys.ts`
- `server/backend/src/constants/outboundHttp.ts`
- `server/backend/src/scripts/validateInstancePolicyCli.ts`
- `server/backend/src/api/routes/systemInstancePolicy.ts`
- `server/backend/src/services/channelWebhooks/echoChannelWebhookExecuteConstants.ts`
- `server/backend/src/sockets/echoChannelPinsBroadcast.ts`
- `server/backend/src/tests/uploads/videoHlsWorker.config.test.ts`
- `server/backend/src/services/csamScan/legalPrerequisites.ts`
- `server/backend/src/services/uploads/echoUploadServe.test.ts`
- `server/backend/src/sockets/echoMessageReactionsBroadcast.ts`
- `server/backend/src/tests/uploads/chatUploadRetention.service.test.ts`
- `server/backend/src/domain/echoChannelWebhookConstants.ts`
- `server/backend/src/domain/echoStore/messages/messageExports.ts`
- `server/backend/src/domain/permissions/echoTicketAccess.ts`
- `server/backend/src/domain/echoSnowflake.ts`
- `server/backend/src/tests/uploads/chatUploadRetentionOrphans.test.ts`
- `server/backend/src/tests/uploads/mediaCdnSign.test.ts`
- `server/backend/src/sockets/parseCookieHeader.ts`
- `server/backend/src/tests/auth/smsOtpHmac.test.ts`
- `server/backend/src/tests/auth/totpCrypto.test.ts`
- `server/backend/src/tests/platform/numberParsing.test.ts`
- `server/backend/src/services/linkUnfurl/readBoundedResponseBody.ts`
- `server/backend/src/sockets/presenceSocketRegistry.ts`
- `server/backend/src/auth/nativeBearer.test.ts`
- `server/backend/src/services/echoWebhookSignature.ts`
- `server/backend/src/tests/uploads/customEmojiSecurity.test.ts`
- `server/backend/src/tests/uploads/uploadReadToken.test.ts`
- `server/backend/src/tests/discord/discordReplySnapshot.test.ts`
- `server/backend/src/tests/platform/instancePolicy.public.test.ts`
- `server/backend/src/tests/servers/echo.routeUtils.test.ts`
- `server/backend/src/api/routes/statusPage.ts`
- `server/backend/src/services/uploads/echoUploadObjectBackend.ts`
- `server/backend/src/sockets/userSocketIndex.ts`
- `server/backend/src/tests/members/echoAttentionSnapshotScheduler.test.ts`
- `server/backend/src/tests/voice/echo.e2eeEnvelope.test.ts`
- `server/backend/src/auth/oauthCookieIntegrity.test.ts`
- `server/backend/src/api/routes/echo/guestWriteHook.ts`
- `server/backend/src/domain/discord/discordTwinMessageAuth.ts`
- `server/backend/src/jobs/discordImportMediaMirror.ts`
- `server/backend/src/tests/permissions/echo.mergeOverrideRows.presort.test.ts`
- `server/backend/src/tests/uploads/messagePlainTextProjectionImageSlot.test.ts`
- `server/backend/src/api/routes/auth.ts`
- `server/backend/src/domain/echoStore/roles/memberRoleAssignments.ts`
- `server/backend/src/services/auth/passwordResetActions.ts`
- `server/backend/src/tests/auth/botTokenHash.test.ts`
- `server/backend/src/tests/voice/youtubeRtmpIngest.test.ts`
- `server/backend/src/domain/echoStore/channels/messageFormatChannel.ts`
- `server/backend/src/auth/middleware.ts`
- `server/backend/src/auth/serverSession.ts`
- `server/backend/src/api/routes/auth/session.ts`
- `server/backend/src/api/routes/auth/password.ts`
- `server/backend/src/api/routes/auth/register.ts`
- `server/backend/src/api/routes/auth/login.ts`
- `server/backend/src/services/auth/hwidAccountProfile.ts`
- `server/backend/src/services/auth/absoluteInstanceRateLimiter.ts`
- `server/backend/src/services/auth/emailVerificationActions.ts`
- `server/backend/src/services/auth/officialEchoServerOnSignup.ts`
- `server/backend/src/auth/sessionCookies.test.ts`
- `server/backend/src/services/auth/officialEchoServerMembershipCache.ts`
- `server/backend/src/services/auth/phoneVerificationActions.ts`
- `server/backend/src/auth/sessionClientContext.test.ts`
- `server/backend/src/auth/revokeNativePushToken.test.ts`
- `server/backend/src/services/auth/socketSessionRevocation.ts`
- `server/backend/src/api/routes/auth/push.ts`
- `server/backend/src/auth/legacyBearer.security.test.ts`
- `server/backend/src/domain/smsSendAbuse.ts`
- `server/backend/src/api/routes/auth/echoPlusInterest.ts`
- `server/backend/src/services/auth/loginProtection.ts`
- `server/backend/src/services/auth/guestAbuseLimiter.ts`
- `server/backend/src/api/routes/auth/guest.ts`
- `server/backend/src/api/routes/auth/2fa.ts`
- `server/backend/src/api/routes/auth/me.ts`
- `server/backend/src/auth/store/types.ts`
- `server/backend/src/auth/store/memory/MemoryAuthStore.ts`
- `server/backend/src/auth/store/postgres/PostgresAuthStore.ts`
- `server/backend/src/index.ts`
- `server/backend/src/tests/uploads/echoUploadServe.security.test.ts`
- `server/backend/src/domain/echoStore/onboarding/bugHunterReports.ts`
- `server/backend/src/services/integrations/appleOidc.nonce.test.ts`
- `server/backend/src/jobs/loginEventsRetention.ts`
- `server/backend/src/services/email/echoBootStallAlertEmail.test.ts`
- `server/backend/src/domain/echoMessageIdPgCompare.ts`
- `server/backend/src/domain/youtube/youtubeOAuthRedirect.ts`
- `server/backend/src/services/email/verificationTemplates.ts`
- `server/backend/src/tests/auth/csrf.exemptPaths.test.ts`
- `server/backend/src/tests/auth/totpVerify.test.ts`
- `server/backend/src/services/botTokenHash.ts`
- `server/backend/src/tests/uploads/rasterImageWebpBackfill.test.ts`
- `server/backend/src/tests/voice/stageProgramRoom.test.ts`
- `server/backend/src/api/routes/discordApi/index.ts`
- `server/backend/src/domain/echoStore/onboarding/guestOnboarding.ts`
- `server/backend/src/services/email/passwordResetTemplates.ts`
- `server/backend/src/services/honcho/client.ts`
- `server/backend/src/services/integrations/turnstileVerify.ts`
- `server/backend/src/tests/auth/guestAbuseLimiter.test.ts`
- `server/backend/src/domain/echoStore/servers/serverMemberIds.ts`
- `server/backend/src/tests/uploads/probeImageDimensionsFromBuffer.test.ts`
- `server/backend/src/api/routes/imageBrowseCategories.ts`
- `server/backend/src/domain/echoStore/social/dmRealmPersistence.ts`
- `server/backend/src/observability/otel.ts`
- `server/backend/src/observability/voiceTraceLog.ts`
- `server/backend/src/tests/auth/youtubeOAuth.state.test.ts`
- `server/backend/src/domain/echoStore/social/mutualServers.test.ts`
- `server/backend/src/services/search/upstreamSearchCache.ts`
- `server/backend/src/tests/messages/echoMessageIdPgCompare.test.ts`
- `server/backend/src/tests/uploads/echoUploadContentTypePolicy.test.ts`
- `server/backend/src/tests/uploads/gifProviders.klipy.test.ts`
- `server/backend/src/domain/appleUserLinkRepo.ts`
- `server/backend/src/services/csamScan/purgeUploadObject.ts`
- `server/backend/src/services/livekit/webhookReplayCache.ts`
- `server/backend/src/tests/auth/recoveryCodes.test.ts`
- `server/backend/src/tests/permissions/echo.permission.cache.test.ts`
- `server/backend/src/tests/safety/echoWebhookSignature.test.ts`
- `server/backend/src/domain/googleOAuthRedirect.ts`
- `server/backend/src/services/echoChannelPinsOps.ts`
- `server/backend/src/api/routes/discordApi/rest/userBatch.ts`
- `server/backend/src/domain/permissions/mergeOverrideRows.ts`
- `server/backend/src/services/uploads/s3UploadPresign.security.test.ts`
- `server/backend/src/tests/auth/accountPolicy.profileSanitize.test.ts`
- `server/backend/src/tests/uploads/echoEmojiCdnUrlPolicy.test.ts`
- `server/backend/src/domain/permissions/echoWorkspaceEventAccess.ts`
- `server/backend/src/tests/uploads/localUploadTokenReplay.test.ts`
- `server/backend/src/services/echoUserProfileWorkspaceFanout.ts`
- `server/backend/src/services/httpRateLimitStore.ts`
- `server/backend/src/tests/auth/oauthLoginOrigin.test.ts`
- `server/backend/src/tests/discord/discordExportBundleReady.test.ts`
- `server/backend/src/services/uploads/webhookMediaUrl.ts`
- `server/backend/src/services/csamScan/scanner.ts`
- `server/backend/src/tests/platform/globalRateLimitKey.test.ts`
- `server/backend/src/tests/voice/vcWatchTogetherStorageKey.test.ts`
- `server/backend/src/domain/echoGuestPolicy.ts`
- `server/backend/src/domain/message-links/echoMessageLinkEmbed.test.ts`
- `server/backend/src/domain/discord/discordImportableGuilds.ts`
- `server/backend/src/domain/echoForwardResolution.ts`
- `server/backend/src/tests/platform/instancePolicy.merge.test.ts`
- `server/backend/src/tests/uploads/rasterImageTranscode.test.ts`
- `server/backend/src/platform/botEventBus.ts`
- `server/backend/src/services/uploads/echoUploadStoreBuffer.ts`
- `server/backend/src/tests/paper/paperCollabState.test.ts`
- `server/backend/src/tests/platform/pgQueryInstrumentation.test.ts`
- `server/backend/src/tests/voice/echo.e2eeDeviceOwned.test.ts`
- `server/backend/src/domain/echoStore/social/mutualServers.ts`
- `server/backend/src/services/linkUnfurl/safeFetchAgent.ts`
- `server/backend/src/shared/keyedCoalescer.ts`
- `server/backend/src/tests/safety/echoInviteSharePage.xss.test.ts`
- `server/backend/src/domain/discord/discordOAuthRedirect.ts`
- `server/backend/src/domain/echoMessageLinkEmbed.ts`
- `server/backend/src/domain/echoServerMembershipChecks.ts`
- `server/backend/src/domain/youtube/youtubeDeliveryMode.ts`
- `server/backend/src/tests/uploads/defaultAvatarPfp.test.ts`
- `server/backend/src/api/routes/discordApi/gateway/opcodes.ts`
- `server/backend/src/domain/echoStore/roles/memberRoleIds.ts`
- `server/backend/src/services/uploads/mediaUrlPolicy.ts`
- `server/backend/src/tests/messages/echo.messaging.integration.ts`
- `server/backend/src/tests/permissions/echo.rbac.reactionEveryone.test.ts`
- `server/backend/src/services/discordImport/discordExportBundleReady.ts`
- `server/backend/src/api/routes/discordApi/rest/gateway.ts`
- `server/backend/src/domain/permissions/permissionExplanation.ts`
- `server/backend/src/services/uploads/echoUploadSourceMetadata.ts`
- `server/backend/src/tests/platform/globalErrorHandler.test.ts`
- `server/backend/src/tests/platform/instancePolicy.hotReload.test.ts`
- `server/backend/src/domain/youtube/youtubeUserAccessToken.ts`
- `server/backend/src/jobs/workspaceEventOutbox.ts`
- `server/backend/src/tests/unfurl/translateDiscordSyncedMentions.test.ts`
- `server/backend/src/jobs/videoUploadOptimize.ts`
- `server/backend/src/services/csamScan/sha256Blocklist.ts`
- `server/backend/src/services/discordImport/discordImportQuota.ts`
- `server/backend/src/tests/permissions/echo.rbac.sparse.bench.ts`
- `server/backend/src/tests/uploads/echoLocalUploadDirConfig.test.ts`
- `server/backend/src/domain/discord/discordUserAccessToken.ts`
- `server/backend/src/domain/echoStore/safety/instanceBanOperators.ts`
- `server/backend/src/domain/echoStore/voice/vcActivityPopularity.ts`
- `server/backend/src/services/uploads/localUploadToken.ts`
- `server/backend/src/tests/auth/loginProtection.test.ts`
- `server/backend/src/tests/servers/echo.serverMemberIdsCache.test.ts`
- `server/backend/src/domain/echoStore/constants.ts`
- `server/backend/src/services/email/echoMetricsDigestEmail.test.ts`
- `server/backend/src/services/uploads/echoUploadPublicUrl.ts`
- `server/backend/src/tests/discord/discordBridgeSyncNotice.unit.test.ts`
- `server/backend/src/tests/uploads/chatRemoteImageImport.test.ts`
- `server/backend/src/api/routes/echo/mutualServers.ts`
- `server/backend/src/tests/channels/echoChannelWebhookExecute.unit.test.ts`
- `server/backend/src/services/discordBridge/discordReplySnapshot.ts`
- `server/backend/src/services/statusPage/types.ts`
- `server/backend/src/services/sms/sendSms.ts`
- `server/backend/src/tests/auth/googleOAuth.state.test.ts`
- `server/backend/src/services/channelWebhooks/echoChannelWebhookPollDiscord.ts`
- `server/backend/src/services/csamScan/externalScanCmd.ts`
- `server/backend/src/tests/paper/paperContentJsonValidation.test.ts`
- `server/backend/src/domain/echoStore/social/dmProfileVisibility.ts`
- `server/backend/src/services/statusPage/dayState.ts`
- `server/backend/src/tests/discord/discordOAuth.state.test.ts`
- `server/backend/src/domain/instanceBanEnforcement.ts`
- `server/backend/src/domain/permissions/echoPermissions.ts`
- `server/backend/src/scripts/backfillDefaultAvatarPfp.ts`
- `server/backend/src/scripts/purgeOrphanedChatUploadRetention.ts`
- `server/backend/src/tests/unfurl/googleTrendsImageCategories.test.ts`
- `server/backend/src/domain/echoStore/messages/discordImportMediaMirrorQueue.ts`
- `server/backend/src/domain/echoStore/social/userNotificationPreferences.ts`
- `server/backend/src/sockets/socketOpEnvelope.ts`
- `server/backend/src/tests/auth/idTokens.test.ts`
- `server/backend/src/tests/helpers/echoTestApp.ts`
- `server/backend/src/tests/members/echo.presenceAuthority.test.ts`
- `server/backend/src/api/routes/discordApi/rest/users.ts`
- `server/backend/src/domain/echoStore/roles/roleCategoryGlobals.ts`
- `server/backend/src/jobs/chatUploadRetention.ts`
- `server/backend/src/scripts/backfillRasterImagesToWebp.ts`
- `server/backend/src/scripts/softDeleteStaleGuests.ts`
- `server/backend/src/services/discordBridge/discordBridgeWebhookEnsure.ts`
- `server/backend/src/services/stage/stageProgramRoom.ts`
- `server/backend/src/services/webhookReplayGuard.ts`
- `server/backend/src/tests/discord/discordImportCdnRefresh.test.ts`
- `server/backend/src/tests/servers/echoContractV1.surfaces.test.ts`
- `server/backend/src/tests/uploads/gifAttachmentValidation.test.ts`
- `server/backend/src/bootstrap/socket.test.ts`
- `server/backend/src/domain/echoChannelServerCache.ts`
- `server/backend/src/domain/echoServerMemberIdsCache.ts`
- `server/backend/src/jobs/imageBrowseCategoriesRefresh.ts`
- `server/backend/src/jobs/voiceRosterReconcile.ts`
- `server/backend/src/services/channelWebhooks/echoChannelWebhooksPolicy.ts`
- `server/backend/src/tests/platform/clientEnvironment.test.ts`
- `server/backend/src/domain/echoPolicy.ts`
- `server/backend/src/tests/voice/echo.vcActivityPopularity.test.ts`
- `server/backend/src/domain/echoEventUserCache.ts`
- `server/backend/src/services/uploads/localUploadTokenReplay.ts`
- `server/backend/src/tests/discord/discordCdnUrls.test.ts`
- `server/backend/src/tests/members/echoPresenceAuthority.test.ts`
- `server/backend/src/services/csamScan/readUploadObjectBytes.ts`
- `server/backend/src/services/discordImport/discordImportPermissions.ts`
- `server/backend/src/services/statusPage/dayState.test.ts`
- `server/backend/src/api/routes/clientEnvironmentAnalytics.ts`
- `server/backend/src/domain/echoStore/members/memberAccessState.ts`
- `server/backend/src/jobs/statusPageProbe.ts`
- `server/backend/src/services/echoEmojiCdnUrlPolicy.ts`
- `server/backend/src/services/uploads/storedMediaUrl.ts`
- `server/backend/src/tests/unfurl/linkUnfurlUrlStubs.test.ts`
- `server/backend/src/tests/platform/instancePolicy.validation.test.ts`
- `server/backend/src/api/routes/devDiagnostics.ts`
- `server/backend/src/services/uploads/echoUploadKeyUtils.ts`
- `server/backend/src/tests/discord/discordMessageImportEmbeds.test.ts`
- `server/backend/src/domain/echoStore/messages/messageAutoDelete.ts`
- `server/backend/src/services/echoVoiceOfflineCleanup.ts`
- `server/backend/src/tests/platform/messageRateLimiter.test.ts`
- `server/backend/src/services/uploads/echoUploadObjectVerify.test.ts`
- `server/backend/src/domain/echoStore/servers/serverIpBans.ts`
- `server/backend/src/domain/youtube/youtubeStreamKeyRepo.ts`
- `server/backend/src/tests/unfurl/honchoMemoryRoute.test.ts`
- `server/backend/src/tests/safety/csamScan.test.ts`
- `server/backend/src/api/routes/echo/tickets.security.test.ts`
- `server/backend/src/services/uploads/rasterImageTranscode.ts`
- `server/backend/src/domain/echoStore/emoji/stickerResolver.ts`
- `server/backend/src/domain/echoStore/servers/serverNotificationPreferences.ts`
- `server/backend/src/services/uploads/echoUploadContentTypePolicy.ts`
- `server/backend/src/sockets/messageRateLimiter.ts`
- `server/backend/src/tests/auth/loginLogAudit.test.ts`
- `server/backend/src/tests/discord/discordImportAvatarPfpBackfill.test.ts`
- `server/backend/src/api/routes/agentNetworkDiagnostics.ts`
- `server/backend/src/domain/echoMessageAuthorLabels.ts`
- `server/backend/src/scripts/backfillDiscordImportAvatarPfp.ts`
- `server/backend/src/services/echoImageSlotFillBroadcast.ts`
- `server/backend/src/tests/platform/snowflakeIds.test.ts`
- `server/backend/src/tests/voice/echo.e2eeWire.validation.test.ts`
- `server/backend/src/domain/echoStore/members/memberHighlights.ts`
- `server/backend/src/services/echoAttentionRealtime.ts`
- `server/backend/src/api/meLinkRouteRateLimits.ts`
- `server/backend/src/domain/echoPollVotesDal.ts`
- `server/backend/src/domain/echoStore/channels/channelReadState.ts`
- `server/backend/src/jobs/messageAutoDeleteRetention.ts`
- `server/backend/src/services/email/echoMetricsDigestHighlights.test.ts`
- `server/backend/src/tests/unfurl/unfurlCache.test.ts`
- `server/backend/src/services/email/sendMail.ts`
- `server/backend/src/sockets/paperWatchState.ts`
- `server/backend/src/tests/paper/paperShare.visibility.test.ts`
- `server/backend/src/tests/permissions/echo.rbac.goldens.test.ts`
- `server/backend/src/domain/discord/discordProfileMerge.ts`
- `server/backend/src/domain/echoMemberRoleIdsCache.ts`
- `server/backend/src/domain/echoStore/channels/channelMeta.ts`
- `server/backend/src/services/csamScan/index.ts`
- `server/backend/src/services/uploads/echoUploadReadAccess.ts`
- `server/backend/src/tests/platform/echoReadRateLimitPaths.test.ts`
- `server/backend/src/tests/servers/echoPlusInterest.test.ts`
- `server/backend/src/domain/echoSearchChannelCache.ts`
- `server/backend/src/domain/echoStore/bannedWords/messageEval.ts`
- `server/backend/src/domain/echoStore/members/blocks.ts`
- `server/backend/src/tests/discord/discordBotWebhook.contract.test.ts`
- `server/backend/src/tests/unfurl/stageYoutubeBroadcast.claim.test.ts`
- `server/backend/src/api/routes/systemDeployCountdown.ts`
- `server/backend/src/services/discordImport/discordImportMediaMirrorScheduler.ts`
- `server/backend/src/tests/discord/discordImportMediaMirrorQueue.test.ts`
- `server/backend/src/services/discordBridge/discordWebhookExecuteSerialization.ts`
- `server/backend/src/services/discordImport/discordImportJson.ts`
- `server/backend/src/tests/members/echo.userPublicProfileDetail.test.ts`
- `server/backend/src/api/routes/echo/routeUtils.ts`
- `server/backend/src/api/routes/internal/gameOutbound.ts`
- `server/backend/src/domain/paper/paperTypographySchema.ts`
- `server/backend/src/sockets/echoLinkEmbeds.ts`
- `server/backend/src/tests/discord/discordNormalized.mapper.test.ts`
- `server/backend/src/services/marketingPollLiveOverlay.ts`
- `server/backend/src/tests/members/echo.officialServerOnboarding.test.ts`
- `server/backend/src/tests/members/echoEventUserCache.test.ts`
- `server/backend/src/scripts/purgeInactiveGuests.ts`
- `server/backend/src/services/uploads/uploadReadToken.ts`
- `server/backend/src/tests/voice/vcWatchTogetherSessions.test.ts`
- `server/backend/src/jobs/presenceSweep.ts`
- `server/backend/src/scripts/backfillBugReportSupportEmails.ts`
- `server/backend/src/api/routes/giphy.ts`
- `server/backend/src/services/echoWebPush.ts`
- `server/backend/src/jobs/metricsWeeklyDigest.ts`
- `server/backend/src/domain/echoStore/channels/channelAudit.ts`
- `server/backend/src/domain/echoStore/messages/echoMessageSearchFlags.test.ts`
- `server/backend/src/api/errors.ts`
- `server/backend/src/domain/echoMemberStateCache.ts`
- `server/backend/src/services/gameServerForwardClient.ts`
- `server/backend/src/services/echoMessageReactionOps.ts`
- `server/backend/src/services/echoPollVoteOps.ts`
- `server/backend/src/services/linkUnfurl/linkUnfurlFetch.security.test.ts`
- `server/backend/src/db/schemaReviewRemediation.test.ts`
- `server/backend/src/domain/youtube/youtubeOAuthState.ts`
- `server/backend/src/services/livekit/livekitEgress.ts`
- `server/backend/src/services/watchTogether/vcWatchTogetherChannelHost.ts`
- `server/backend/src/tests/members/echo.memberNickname.test.ts`
- `server/backend/src/tests/platform/socketOpEnvelope.test.ts`
- `server/backend/src/domain/permissions/echoPermissionPrimitivesSparse.ts`
- `server/backend/src/tests/servers/echo.serverAggregateCache.test.ts`
- `server/backend/src/tests/uploads/chatMediaRetention.test.ts`
- `server/backend/src/api/routes/health.ts`
- `server/backend/src/services/uploads/localUploadDisk.ts`
- `server/backend/src/tests/paper/paperCollabCursorBatching.test.ts`
- `server/backend/src/tests/permissions/echo.rbac.bench.ts`
- `server/backend/src/domain/discord/discordShadowMerge.ts`
- `server/backend/src/domain/echoServerPermissionAggregateCache.ts`
- `server/backend/src/domain/iosDeviceTokenRepo.ts`
- `server/backend/src/scripts/wipeAppDatabase.ts`
- `server/backend/src/services/echoBannedWordsApply.ts`
- `server/backend/src/shared/idTokens.ts`
- `server/backend/src/sockets/messageReactionHandler.ts`
- `server/backend/src/sockets/pollVoteHandler.ts`
- `server/backend/src/domain/imageSlotFillOps.ts`
- `server/backend/src/tests/members/echo.memberStateCache.test.ts`
- `server/backend/src/tests/platform/corsPreflight.test.ts`
- `server/backend/src/domain/echoStore/servers/serverSpamFilter.ts`
- `server/backend/src/services/linkUnfurl/unfurlCache.ts`
- `server/backend/src/tests/permissions/echo.defaultRole.test.ts`
- `server/backend/src/tests/voice/echo.voiceE2eeRoomFinished.integration.ts`
- `server/backend/src/api/routes/analytics.ts`
- `server/backend/src/api/routes/discordBotHook.ts`
- `server/backend/src/domain/echoChannelMetaCache.ts`
- `server/backend/src/scripts/backfillDiscordImportCdnUrls.ts`
- `server/backend/src/services/integrations/googleApiClient.ts`
- `server/backend/src/domain/youtube/youtubeRtmpIngest.ts`
- `server/backend/src/tests/permissions/echo.channelPermissionPersistence.test.ts`
- `server/backend/src/sockets/eventMiddleware.ts`
- `server/backend/src/tests/discord/discordBridgeOutbound.test.ts`
- `server/backend/src/api/routes/echo/media.ts`
- `server/backend/src/domain/echoStore/channels/channelPinsPersistence.ts`
- `server/backend/src/domain/echoStore/messages/mentionContext.ts`
- `server/backend/src/domain/echoStore/social/webPushSubscriptions.ts`
- `server/backend/src/domain/echoStore/voice/stageSpeak.ts`
- `server/backend/src/observability/echoHotPathMetrics.ts`
- `server/backend/src/tests/platform/gcraRateLimiter.test.ts`
- `server/backend/src/domain/discord/discordBotExportPendingRepo.ts`
- `server/backend/src/tests/channels/echo.forumJsonColumns.test.ts`
- `server/backend/src/tests/messages/echo.stickerExpression.test.ts`
- `server/backend/src/tests/uploads/echoUploadStorageKeyPath.test.ts`
- `server/backend/src/api/routes/echo/gameServer.ts`
- `server/backend/src/services/email/echoBootStallAlertEmail.ts`
- `server/backend/src/domain/permissions/echoPermissionTrace.ts`
- `server/backend/src/api/routes/echo/instanceBans.ts`
- `server/backend/src/services/clientEnvironmentAggregation.ts`
- `server/backend/src/api/routes/meGoogle.ts`
- `server/backend/src/services/discordImport/discordImportMediaFreshUrls.ts`
- `server/backend/src/services/statusPage/publicStatus.ts`
- `server/backend/src/tests/platform/keyedCoalescer.test.ts`
- `server/backend/src/api/discordBotWebhookAuth.ts`
- `server/backend/src/net/clientIp.ts`
- `server/backend/src/sockets/messagePinHandler.ts`
- `server/backend/src/tests/auth/sessionDiagnostics.test.ts`
- `server/backend/src/tests/members/echo.attentionMultiSession.integration.ts`
- `server/backend/src/scripts/drainDiscordImportMediaMirrorQueue.ts`
- `server/backend/src/api/routes/discordVoiceMirrorHook.ts`
- `server/backend/src/domain/echoStore/servers/officialServerOnboarding.ts`
- `server/backend/src/services/watchTogether/vcWatchTogetherLibrary.ts`
- `server/backend/src/tests/permissions/echo.rolePermissionMerge.test.ts`
- `server/backend/src/api/routes/echo.ts`
- `server/backend/src/api/routes/echo/instanceBanHandlers.ts`
- `server/backend/src/api/sharedMutationRateLimits.ts`
- `server/backend/src/services/email/transactionalEmailHtml.ts`
- `server/backend/src/services/discordImport/discordImportAuthorization.ts`
- `server/backend/src/api/routes/discordApi/botAuth.ts`
- `server/backend/src/domain/echoStore/channels/channelNotificationOverrides.ts`
- `server/backend/src/domain/discord/discordCdnUrls.ts`
- `server/backend/src/tests/discord/discordUserLink.uniqueness.test.ts`
- `server/backend/src/tests/paper/paperAttribution.test.ts`
- `server/backend/src/api/routes/echo/vcActivities.ts`
- `server/backend/src/tests/permissions/echo.permissionOverwriteActorSanitize.test.ts`
- `server/backend/src/domain/echoStore/messages/messageReactionPersistence.ts`
- `server/backend/src/services/email/echoBugReportEmail.ts`
- `server/backend/src/domain/echoStore/messages/messageOps.ts`
- `server/backend/src/domain/googleUserLinkRepo.ts`
- `server/backend/src/services/uploads/probeImageDimensionsFromBuffer.ts`
- `server/backend/src/tests/voice/vcWatchTogetherChannelHost.test.ts`
- `server/backend/src/tests/auth/googleOidc.test.ts`
- `server/backend/src/tests/paper/paperComments.reply.test.ts`
- `server/backend/src/sockets/typingHandler.ts`
- `server/backend/src/tests/discord/discordProfileMerge.test.ts`
- `server/backend/src/tests/permissions/echo.roleCategories.test.ts`
- `server/backend/src/platform/echoRealtimeMembership.ts`
- `server/backend/src/tests/messages/echo.massMentionParity.test.ts`
- `server/backend/src/services/channelWebhooks/echoChannelWebhookAllowedMentions.ts`
- `server/backend/src/tests/uploads/echoUploadObjectBackend.test.ts`
- `server/backend/src/domain/googleOAuthState.ts`
- `server/backend/src/services/uploads/chatUploadRetentionOrphans.ts`
- `server/backend/src/services/discordBridge/discordBridgeOutbound.ts`
- `server/backend/src/api/routes/echo/bugReports.ts`
- `server/backend/src/domain/echoStore/emoji/userRingtones.ts`
- `server/backend/src/api/routes/discordPresenceHook.ts`
- `server/backend/src/domain/echoStore/roles/roleCategoryDefaults.ts`
- `server/backend/src/services/uploads/echoUploadDedupe.ts`
- `server/backend/src/domain/echoStore/safety/moderation.ts`
- `server/backend/src/sockets/presenceHandler.ts`
- `server/backend/src/api/routes/index.ts`
- `server/backend/src/domain/youtube/youtubeUserLinkRepo.ts`
- `server/backend/src/services/echoGuildOutboundMessageModeration.ts`
- `server/backend/src/tests/messages/echoMessagePushTargets.test.ts`
- `server/backend/src/domain/echoStore/bannedWords/configDal.ts`
- `server/backend/src/domain/echoStore/community/forumCreatorAccess.ts`
- `server/backend/src/observability/networkDiagnostics.ts`
- `server/backend/src/services/honcho/memory.ts`
- `server/backend/src/services/uploads/echoUploadServe.ts`
- `server/backend/src/tests/permissions/echo.rbac.integration.test.ts`
- `server/backend/src/tests/auth/socketSessionRevocation.integration.ts`
- `server/backend/src/tests/permissions/echo.rbac.perms.test.ts`
- `server/backend/src/domain/echoPlusInterest.ts`
- `server/backend/src/services/echoModerationOps.ts`
- `server/backend/src/domain/echoStore/bannedWords/matcher.ts`
- `server/backend/src/services/statusPage/probe.ts`
- `server/backend/src/services/uploads/mediaCdnSign.ts`
- `server/backend/src/shared/gcraRateLimiter.ts`
- `server/backend/src/tests/auth/csrf.enforcement.test.ts`
- `server/backend/src/tests/unfurl/serperImageSearchCache.test.ts`
- `server/backend/src/services/uploads/echoUploadRegister.ts`
- `server/backend/src/tests/members/echo.userProfileDetail.http.integration.ts`
- `server/backend/src/services/echoVideoPlayback.ts`
- `server/backend/src/services/watchTogether/vcWatchTogetherSessions.ts`
- `server/backend/src/tests/helpers/imageSlotFillHarness.ts`
- `server/backend/src/tests/messages/echo.messageAutoDelete.test.ts`
- `server/backend/src/domain/echoStore/platform/workspaceEventOutbox.ts`
- `server/backend/src/tests/discord/discordApi.botSecurity.test.ts`
- `server/backend/src/tests/permissions/echo.permissionBatchParity.test.ts`
- `server/backend/src/tests/permissions/echo.selfAssignableRoles.test.ts`
- `server/backend/src/services/email/echoSafetyReportEmail.ts`
- `server/backend/src/services/echoAttentionSnapshotScheduler.ts`
- `server/backend/src/tests/uploads/echo.emojiAsset.test.ts`
- `server/backend/src/api/routes/echo/bannedWords.ts`
- `server/backend/src/tests/helpers/messageListLayoutHarness.ts`
- `server/backend/src/tests/safety/echo.instanceBans.test.ts`
- `server/backend/src/services/echoMemberJoinWelcomeNotice.ts`
- `server/backend/src/domain/echoStore/roles/roleOrdering.ts`
- `server/backend/src/platform/echoPlatformEvents.security.test.ts`
- `server/backend/src/services/echoSocialOps.ts`
- `server/backend/src/sockets/channelHandlers.ts`
- `server/backend/src/tests/channels/echo.channelMetaCache.test.ts`
- `server/backend/src/domain/echoPresenceAuthority.ts`
- `server/backend/src/services/echoInviteSharePage.ts`
- `server/backend/src/tests/uploads/imageSlotFillOps.test.ts`
- `server/backend/src/services/watchTogether/youtubeWatchTogetherUsageBudget.ts`
- `server/backend/src/tests/channels/echo.channelTreeMove.test.ts`
- `server/backend/src/tests/permissions/echo.roleScope.test.ts`
- `server/backend/src/domain/discord/discordPresenceRepo.ts`
- `server/backend/src/domain/echoStore/voice/echo.dmVoiceE2eeMls.integration.ts`
- `server/backend/src/domain/permissions/echoPermissionAggregateFold.ts`
- `server/backend/src/scripts/backfillMessageUuidToSnowflake.ts`
- `server/backend/src/services/uploads/echoUploadIntent.ts`
- `server/backend/src/tests/channels/echo.workspaceChannelMemberAccess.test.ts`
- `server/backend/src/domain/echoStore/bannedWords/wordlists.ts`
- `server/backend/src/domain/echoStore/members/presence.ts`
- `server/backend/src/scripts/cleanupTestServers.ts`
- `server/backend/src/services/email/echoMetricsDigestEmail.ts`
- `server/backend/src/services/uploads/echoUploadObjectVerify.ts`
- `server/backend/src/domain/echoStore/messages/mentionNotificationsFeed.ts`
- `server/backend/src/domain/echoStore/roles/serverPermissionAggregate.ts`
- `server/backend/src/api/routes/echo/channelWebhooks.ts`
- `server/backend/src/services/echoMessageEditDeleteOps.ts`
- `server/backend/src/tests/safety/echo.joinSecurity.enforcement.test.ts`
- `server/backend/src/services/echoApns.ts`
- `server/backend/src/services/email/echoMetricsDigestHighlights.ts`
- `server/backend/src/tests/members/echo.social.friends.test.ts`
- `server/backend/src/services/discordImport/discordImportAvatarPfpBackfill.ts`
- `server/backend/src/services/channelWebhooks/echoChannelWebhookInboundFiles.ts`
- `server/backend/src/services/search/serperGlobalUsageBudget.ts`
- `server/backend/src/domain/discord/discordUserLinkRepo.ts`
- `server/backend/src/services/search/gifProviders.ts`
- `server/backend/src/domain/discord/discordOAuthState.ts`
- `server/backend/src/tests/uploads/echoVideoOptimizeQueue.test.ts`
- `server/backend/src/domain/echoPlanEntitlements.ts`
- `server/backend/src/tests/members/echo.memberJoinWelcome.test.ts`
- `server/backend/src/api/routes/discordApi/rest/channels.ts`
- `server/backend/src/domain/echoStore/roles/roleLinks.ts`
- `server/backend/src/tests/unfurl/linkUnfurl.extractAndEmbeds.test.ts`
- `server/backend/src/domain/echoMessageSearchFlags.ts`
- `server/backend/src/sockets/resolveSocketIdentity.ts`
- `server/backend/src/api/routes/discordBridgeHook.ts`
- `server/backend/src/tests/uploads/echoUploadSecurity.test.ts`
- `server/backend/src/services/echoEmojiCdnPublish.ts`
- `server/backend/src/tests/voice/echo.voiceE2eeJoinRace.integration.ts`
- `server/backend/src/services/search/serperUserSearchQuota.ts`
- `server/backend/src/tests/voice/echo.voiceE2ee.test.ts`
- `server/backend/src/api/routes/echo/stageYoutube.ts`
- `server/backend/src/services/integrations/googleOidc.ts`
- `server/backend/src/services/discordBridge/discordBridgeSyncNotice.ts`
- `server/backend/src/tests/members/echo.attentionSummary.test.ts`
- `server/backend/src/domain/paperAttribution.ts`
- `server/backend/src/services/echoVoiceAccessEnforcement.ts`
- `server/backend/src/api/routes/honchoMemory.ts`
- `server/backend/src/domain/echoStore/roles/permissions.ts`
- `server/backend/src/domain/echoStore/marketingPoll.ts`
- `server/backend/src/tests/uploads/echo.publicEmojiRoute.test.ts`
- `server/backend/src/api/routes/echo/selfAssignableRoles.ts`
- `server/backend/src/services/echoVideoOptimizeQueue.ts`
- `server/backend/src/domain/echoStore/members/userTypingProfile.ts`
- `server/backend/src/services/integrations/appleOidc.ts`
- `server/backend/src/sockets/dmCallSignalHandler.ts`
- `server/backend/src/tests/unfurl/serperImageSearchRoute.test.ts`
- `server/backend/src/domain/discord/discordNormalized.ts`
- `server/backend/src/domain/echoStore/community/invites.ts`
- `server/backend/src/tests/voice/vcWatchTogetherRealMp4.live.ts`
- `server/backend/src/api/routes/echo/botApplications.ts`
- `server/backend/src/domain/echoStore/paper/paper.ts`
- `server/backend/src/domain/echoStore/safety/auditLog.ts`
- `server/backend/src/tests/safety/echo.safetyReports.integration.ts`
- `server/backend/src/domain/echoStore/safety/safetyReports.ts`
- `server/backend/src/tests/channels/echo.channelSettings.test.ts`
- `server/backend/src/domain/echoStore/roles/roleScope.ts`
- `server/backend/src/api/routes/echo/permissionOverwrites.ts`
- `server/backend/src/tests/members/echo.dmAsync.integration.ts`
- `server/backend/src/domain/echoStore/paper/paperShare.ts`
- `server/backend/src/observability/echoMetrics.ts`
- `server/backend/src/services/statusPage/store.ts`
- `server/backend/src/api/routes/echo/userRingtones.ts`
- `server/backend/src/services/discordImport/discordImportPostSetup.ts`
- `server/backend/src/services/echoMessagePushNotify.ts`
- `server/backend/src/domain/youtube/stageYoutubeBroadcastRepo.ts`
- `server/backend/src/tests/channels/channelHandlers.joinChannel.test.ts`
- `server/backend/src/tests/voice/vcGameRoom.e2e.integration.ts`
- `server/backend/src/api/routes/appleOAuth.ts`
- `server/backend/src/api/routes/meYoutube.ts`
- `server/backend/src/tests/voice/vcWatchTogetherRealMp4.integration.ts`
- `server/backend/src/services/search/googleTrendsImageCategories.ts`
- `server/backend/src/domain/permissions/echoPermissionCache.ts`
- `server/backend/src/services/channelWebhooks/echoChannelWebhookRouting.ts`
- `server/backend/src/sockets/gameTunnelHandler.ts`
- `server/backend/src/tests/members/echo.timeoutParity.test.ts`
- `server/backend/src/domain/discord/discordImportParity.ts`
- `server/backend/src/tests/safety/echo.spamFilter.integration.ts`
- `server/backend/src/sockets/paperWatchHandler.ts`
- `server/backend/src/services/linkUnfurl/linkUnfurlFetch.ts`
- `server/backend/src/tests/permissions/echo.permissionOverwriteMerge.test.ts`
- `server/backend/src/tests/discord/echo.discordImport.roleAssignments.test.ts`
- `server/backend/src/domain/echoStore/community/forums.ts`
- `server/backend/src/services/linkUnfurl/linkUnfurlOembed.ts`
- `server/backend/src/domain/messagePlainTextProjection.ts`
- `server/backend/src/tests/platform/storageMode.config.test.ts`
- `server/backend/src/tests/voice/vcWatchTogetherE2e.integration.ts`
- `server/backend/src/domain/echoStore/paper/paperComments.ts`
- `server/backend/src/domain/permissions/permissionOverwriteMerge.ts`
- `server/backend/src/domain/echoStore/channels/channelTreeMove.ts`
- `server/backend/src/tests/voice/echo.voiceE2eeMls.integration.ts`
- `server/backend/src/platform/echoPlatformEvents.ts`
- `server/backend/src/tests/messages/echo.messageValidation.test.ts`
- `server/backend/src/api/routes/youtubeOAuth.ts`
- `server/backend/src/services/uploads/chatRemoteImageImport.ts`
- `server/backend/src/domain/echoChannelWebhooksRepo.ts`
- `server/backend/src/services/discordImport/discordImportMediaMirrorQueue.ts`
- `server/backend/src/tests/permissions/echo.roleMetadata.test.ts`
- `server/backend/src/services/linkUnfurl/linkUnfurlUrlStubs.ts`
- `server/backend/src/observability/sessionDiagnostics.ts`
- `server/backend/src/api/routes/echo/discordVoiceMirrorSettings.ts`
- `server/backend/src/api/routes/echo/voiceE2ee.ts`
- `server/backend/src/tests/platform/productionConfigGates.test.ts`
- `server/backend/src/api/routes/echo/messageSearch.ts`
- `server/backend/src/services/search/serperImageSearchCache.ts`
- `server/backend/src/services/discordBridge/discordVoiceMirrorIngest.ts`
- `server/backend/src/domain/discord/discordImportUsers.ts`
- `server/backend/src/domain/echoStore/onboarding/applicationForm.ts`
- `server/backend/src/domain/permissions/echoPermissionPrimitives.ts`
- `server/backend/src/api/routes/echoChannelWebhookHook.ts`
- `server/backend/src/api/routes/echo/moderation.ts`
- `server/backend/src/services/uploads/s3UploadPresign.ts`
- `server/backend/src/api/routes/echo/safety.ts`
- `server/backend/src/api/routes/echo/serverApplications.ts`
- `server/backend/src/tests/voice/echo.mlsDelivery.test.ts`
- `server/backend/src/domain/echoStore/servers/serverApplications.ts`
- `server/backend/src/services/echoEmojiAsset.ts`
- `server/backend/src/tests/voice/echo.livekit.test.ts`
- `server/backend/src/api/routes/echo/invites.ts`
- `server/backend/src/domain/contentJsonValidation.ts`
- `server/backend/src/services/integrations/youtubeApiClient.ts`
- `server/backend/src/services/discordImport/discordImportCdnRefresh.ts`
- `server/backend/src/api/routes/discordApi/serializers.ts`
- `server/backend/src/services/discordBridge/discordBridgeApply.ts`
- `server/backend/src/domain/discord/discordBridgeRepo.ts`
- `server/backend/src/domain/echoStore/roles/roleCategories.ts`
- `server/backend/src/domain/echoStore/safety/instanceBans.ts`
- `server/backend/src/api/routes/echo/e2ee.ts`
- `server/backend/src/services/translateDiscordSyncedMentions.ts`
- `server/backend/src/tests/permissions/echo.permissionAggregateParity.test.ts`
- `server/backend/src/sockets/handlers.ts`
- `server/backend/src/api/routes/echo/servers.ts`
- `server/backend/src/api/routes/echo/tickets.ts`
- `server/backend/src/services/livekit/livekitAdapter.ts`
- `server/backend/src/api/routes/meDiscord.ts`
- `server/backend/src/sockets/messageEditDeleteHandler.ts`
- `server/backend/src/services/uploads/rasterImageWebpBackfill.ts`
- `server/backend/src/services/uploads/chatUploadRetention.ts`
- `server/backend/src/services/linkUnfurl/linkUnfurl.ts`
- `server/backend/src/domain/echoStore/social/social.ts`
- `server/backend/src/tests/voice/vcGameRoomTunnel.e2e.integration.ts`
- `server/backend/src/domain/echoStore/social/attention.ts`
- `server/backend/src/domain/discord/discordVoiceMirrorRepo.ts`
- `server/backend/src/services/discordImport/discordMessageImport.ts`
- `server/backend/src/services/integrations/discordApiClient.ts`
- `server/backend/src/services/echoVoiceLiveKitReconcile.ts`
- `server/backend/src/api/routes/echo/social.ts`
- `server/backend/src/tests/uploads/echo.uploads.presign.integration.ts`
- `server/backend/src/domain/echoStore/roles/selfAssignableRoles.ts`
- `server/backend/src/api/routes/echo/public.ts`
- `server/backend/src/api/routes/echo/youtubeSearch.ts`
- `server/backend/src/services/discordBridge/discordBridgeInbound.ts`
- `server/backend/src/services/discordImport/discordImportAvatarMirror.ts`
- `server/backend/src/scripts/migrateEchoIdsToSnowflake.ts`
- `server/backend/src/services/channelWebhooks/echoChannelWebhookExecute.ts`
- `server/backend/src/api/routes/discordApi/rest/messages.ts`
- `server/backend/src/services/uploads/echoUploadResolveDest.ts`
- `server/backend/src/domain/echoStore/voice/voiceE2ee.ts`
- `server/backend/src/api/routes/echo/paper.ts`
- `server/backend/src/api/routes/echo/categories.ts`
- `server/backend/src/api/routes/echo/emojiLibrary.ts`
- `server/backend/src/tests/discord/discordImport.accountParity.test.ts`
- `server/backend/src/api/routes/livekitWebhook.ts`
- `server/backend/src/domain/echoStore/community/tickets.ts`
- `server/backend/src/tests/auth/auth.integration.ts`
- `server/backend/src/domain/echoStore/voice/voice.ts`
- `server/backend/src/api/routes/serperImageSearch.ts`
- `server/backend/src/api/routes/discordApi/gateway/index.ts`
- `server/backend/src/api/routes/discordApi/rest/guilds.ts`
- `server/backend/src/domain/echoStore/servers/serverEvents.ts`
- `server/backend/src/api/routes/googleOAuth.ts`
- `server/backend/src/services/discordBridge/discordEchoServerEventMirror.ts`
- `server/backend/src/services/discordImport/discordImportMediaMirrorProcessor.ts`
- `server/backend/src/sockets/paperCollabHandler.ts`
- `server/backend/src/domain/echoStore/index.ts`
- `server/backend/src/domain/echoStore/voice/e2ee.ts`
- `server/backend/src/tests/discord/echo.discordImport.test.ts`
- `server/backend/src/api/routes/echo/channels.ts`
- `server/backend/src/api/routes/discordOAuth.ts`
- `server/backend/src/domain/permissions/echoPermissionEvaluate.ts`
- `server/backend/src/api/routes/echo/discordBridgeSettings.ts`
- `server/backend/src/api/routes/echo/discordImport.ts`
- `server/backend/src/api/routes/echo/dm.ts`
- `server/backend/src/domain/echoStore/voice/mlsDelivery.ts`
- `server/backend/src/api/routes/echo/mls.ts`
- `server/backend/src/sockets/chatMessageHandler.ts`
- `server/backend/src/services/stage/stageYoutubeStream.ts`
- `server/backend/src/services/echoPersistedMessageCreate.ts`
- `server/backend/src/domain/echoStore/roles/permissionOverwrites.ts`
- `server/backend/src/sockets/messageValidation.ts`
- `server/backend/src/api/routes/echo/roles.ts`
- `server/backend/src/api/routes/echo/serverScoped.ts`
- `server/backend/src/domain/echoStore/social/dmThreads.ts`
- `server/backend/src/tests/platform/shippingSecurity.test.ts`
- `server/backend/src/domain/echoStore/servers/servers.ts`
- `server/backend/src/domain/echoStore/members/access.ts`
- `server/backend/src/api/routes/echo/voice.ts`
- `server/backend/src/domain/echoStore/roles/roles.ts`
- `server/backend/src/domain/echoStore/emoji/emojiLibrary.ts`
- `server/backend/src/domain/echoStore/channels/categoriesWorkspace.ts`
- `server/backend/src/api/routes/echo/messages.ts`
- `server/backend/src/tests/messages/echo.pipeline.integration.ts`
- `server/backend/src/api/routes/echo/uploads.ts`
- `server/backend/src/services/discordImport/discordImport.ts`
- `server/backend/src/domain/echoMessagesDal.ts`
- `server/backend/src/tests/channels/echo.channelSettings.test.ts`

### Remaining

All other authored source and operational configuration files, including the rest of `server/`, `clients/`, `marketing/`, and root configuration. The `server/voice`, `server/media`, and `server/activities` authored code and configuration trees are complete; the activity SVG asset and HolyC protocol prose are outside the code target. Completion has **not** been claimed. Marketing authored code/configuration, backend bootstrap and backend database code are now covered. Next review area: remaining backend source trees, then remaining client source.

Review continuation 2026-10-04: **750 additional complete files, 114,490 lines**. One hundred forty-eight findings added; R079-R082 were subsequently fixed. Fresh and partial-migration PostgreSQL states were exercised while reviewing the database layer. R083-R085 and R087 were reproduced directly; R086 follows an unconditional create/drop path under its documented feature flag. The auth continuation covered the complete passkey route, challenge/counter call paths, authentication middleware, server-session storage, refresh/session routes, password routes, login, registration, guest, two-factor authentication, account settings, both auth stores and direct policy, push, lockout and SMS helpers. Atomic instance-policy replacement failure was reproduced against the live watcher. Configuration parsing was traced through instance-policy overrides, schema validation and production gates. Three isolated test defects were found, including a room-finished test that never calls the handler it names. The subsequent backend pass covered small domain, service, upload, observability and test modules; cluster-wide webhook replay and rate-limit failure modes were traced through their callers. Additional call-path tracing confirmed races in import quota reservation, operator demotion, bridge webhook creation, stage-speak resolution and per-user server-cap admission, a fail-open initial CSAM blocklist load, unsafe scanner temp permissions, queue-depth over-admission, pooled PostgreSQL advisory-lock leaks in three scheduled jobs, premature webhook-delivery consumption, a proxy-hop trust bypass in client-IP resolution, stale official-server resolution, the diagnostics Host-header bypass, parameterized SVG MIME handling, a destructive inactive-guest purge without an inactivity window, unhandled game-service and socket-handler failures, reaction loss during Discord shadow merging, image-slot overwrite races, concurrent spam-filter bypasses, manipulable activity popularity, partial Google unlink cleanup, reaction-toggle and ringtone-cap races, post-delete message edits, failed realtime evictions, cross-user upload dedupe collisions, a transaction-isolated RBAC test, unaudited moderation partial failures, a banned-word occurrence bypass, a shallow realtime health check, Watch Together quota over-admission, exposed harness credentials, detached welcome-notice failures, serial presence fan-out queries, client-controlled YouTube usage metering, invalid HTTP presence coercion, an unsafe message-ID migration, a heartbeat race, destructive test cleanup matching, regressing Discord snapshots, edit fan-out bypasses, fail-open image search quotas, skipped GIF fallback, incomplete Discord-compatible updates, unowned Honcho sessions, unchecked linked-role grants, duplicate safety reports, incomplete invite visibility checks, Paper token races, partial voice-mirror setup, unbounded role-mention push fan-out, stale permission cache fills, partially configured forum webhook posts and Discord role resyncs that erase locally retained assignments, Paper watch limiter growth, forum posts that cannot be unarchived, a falsely delivered workspace outbox, unserialized channel moves, destructive voice-mirror toggles and orphaned mirrors after Discord channel deletion, forged join-application attachments, racing application decisions, unrestricted Paper media URLs, skipped YouTube broadcast cleanup, role-category authorization and cap races, partial instance bans, mention-driven membership, cross-guild Discord bridges, incorrect pin permission serialization, cross-server category references, partial raster migrations, retention deletion races, malformed ticket configuration, unaudited server lifecycle changes, duplicate friendship races, serial attention fan-out, partial Discord message imports, unbounded Discord requests, voice join reconciliation races, ineffective unfurl time budgets, incomplete Snowflake reference migration, duplicate self-role widgets, persistent upload test fixtures, brittle YouTube fallback, burned bridge ingestion claims, forgeable poll countries, bot edit identity confusion, incomplete voice E2EE epochs, ticket cap races, orphaned ticket channels, broken ticket reopening, hierarchy-free voice moderation, unauthorized destination moves, cross-account image quota coalescing, gateway lifecycle leaks, partial bot role replacement, overbroad event feeds, event-time races, orphaned Google OAuth users, detached login audits, duplicate Discord event mirrors, leaked import objects, suppressed transient media retries, split-brain Paper locks, spoofable collaboration presence, reused one-time prekeys, multiply consumed pairing payloads and racing device IDs.
