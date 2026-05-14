User report:

"So how the experience is we start in the middle of the chat then lower message load and the whole thing takes 2 to 3 seconds to finish until it loads all of the messages lower and scrolls with them then the reactions menu and stuff quick edit is cut in half or 1 4th when scrollign up there is a blue background with nothing in it that feels visibly laggy and then messages load, they arent already there even though this is still within the same 50 messages trying to scroll up fast is horribly laggy though the middle / start of messages we start form the reactions arent cutoff they only start cutting off from the point from which things start loading and then when I try to go scroll back again, it has to go through the whole thing again of loading them horribly sketchy way? no clue if any of this helps "echo][memberlist] hydrateEchoFromApi (workspace path) {skipWorkspace: true, note: 'startInitialLoad owns first workspace fetch; this run skips refetch', selectedServerId: null} echoMemberListDebug.ts:26 [echo][memberlist] applyWorkspaceSnapshot OK {workspaceVersion: '1492088606829969408', serverCount: 11, userRowsCount: 829, ms: 816, serverMemberCounts: {…}, …} echoMemberListDebug.ts:26 [echo][memberlist] fetchEchoWorkspaceState → buildEchoWorkspaceState {currentUserIdArg: '1489694170212859904', workspaceVersion: '1492088606829969408', membersPayloadBranch: 'membersByServer', rawMembersCounts: {…}, normalizedMembersCounts: {…}, …} echoMemberListDebug.ts:26 [echo][memberlist] applyWorkspaceSnapshot NOOP (duplicate version) {workspaceVersion: '1492088606829969408', serverCount: 11, ms: 0} echoMemberListDebug.ts:26 [echo][memberlist] applyTimeoutUntilFromWorkspaceSnapshot NOOP (duplicate version) {workspaceVersion: '1492088606829969408'} echoMemberListDebug.ts:26 [echo][memberlist] fetchEchoWorkspaceState → buildEchoWorkspaceState {currentUserIdArg: '1489694170212859904', workspaceVersion: '1492088606829969408', membersPayloadBranch: 'membersByServer', rawMembersCounts: {…}, normalizedMembersCounts: {…}, …} echoMemberListDebug.ts:26 [echo][memberlist] applyWorkspaceSnapshot NOOP (duplicate version) {workspaceVersion: '1492088606829969408', serverCount: 11, ms: 0} echoMemberListDebug.ts:26 [echo][memberlist] hydrateEchoFromApi (workspace path) {skipWorkspace: false, applyWorkspaceSnapshotReturned: true, backendUserId: '1489694170212859904', selectedServerId: null, serverCount: 11, …} shellNavDebugLog.ts:26 [echo][shellnav] {source: 'useEchoWorkspaceLifecycle', message: 'hydrate_first_server_first_channel', data: {…}} shellNavDebugLog.ts:46 [echo][shellnav] {source: 'activeChannelId', message: 'changed', data: {…}, stack: Array(5)} echoMemberListDebug.ts:26 [echo][memberlist] MemberList.vue {serverId: '1490078860522422272', collapsed: false, visible: true, usersLen: 0, echoMemberSectionOrdering: false, …} echoMemberListDebug.ts:26 [echo][memberlist] MemberList.vue {serverId: '1490078860522422272', collapsed: false, visible: true, usersLen: 8, echoMemberSectionOrdering: true, …} echoMemberListDebug.ts:26 [echo][memberlist] MemberList.vue {serverId: '1490078860522422272', collapsed: false, visible: true, usersLen: 8, echoMemberSectionOrdering: true, …} ImageViewerModal.vue:105 [Violation] Handling of 'wheel' input event was delayed for 144 ms due to main thread being busy. Consider marking event handler as 'passive' to make the page more responsive. echoMemberListDebug.ts:26 [echo][memberlist] MemberList.vue {serverId: '1490078860522422272', collapsed: false, visible: true, usersLen: 8, echoMemberSectionOrdering: true, …} echoMemberListDebug.ts:26 [echo][memberlist] MemberList.vue {serverId: '1490078860522422272', collapsed: false, visible: true, usersLen: 8, echoMemberSectionOrdering: true, …} echoMemberListDebug.ts:26 [echo][memberlist] MemberList.vue {serverId: '1490078860522422272', collapsed: false, visible: true, usersLen: 8, echoMemberSectionOrdering: true, …}""

Techninical maybe:

"Viewport / Loading Behavior
Non-atomic message window initialization (progressive fill instead of stable initial slice)
Missing scroll-anchor stabilization during incremental loading
Downward history load causing visible reflow and scroll drift
Multi-frame reconciliation (2–3s) instead of single commit
Repeated re-initialization of the same viewport region on revisit
Virtualization / Rendering
Virtualizer exposing empty regions (insufficient overscan or delayed row materialization)
Spatial allocation without content readiness (blank “blue” gaps)
Unstable virtualization window (rows unmounted/remounted within same logical range)
Row identity instability (likely key or reference churn)
Measurement cache invalidation or absence (row heights not reused)
Data / State Handling
Lack of persistent local message window cache (same messages reloaded/reprocessed)
Re-derivation of message rows on revisit (no memoized row model)
Incremental data merging triggering full-slice recomputation
Possible coupling between scroll events and data transformation pipeline
Scroll / Performance
Main-thread blocking during scroll (confirmed by delayed wheel event)
Scroll-time execution of expensive operations (O(n) or worse)
Input handling not optimized (non-passive listeners or heavy handlers)
Scroll performance degrading with speed (poor handling of rapid viewport changes)
UI / Layout / Overlays
Overlay clipping (reaction menu / quick edit partially hidden)
Inconsistent layout context between initial and dynamically loaded rows
Incorrect bounding/positioning for overlays (likely due to transformed or clipped ancestors)
Row container geometry instability (height/overflow issues after load)
Consistency / UX Integrity
Inconsistent behavior between initially loaded messages and subsequently loaded ones
Visual discontinuity at load boundary (where new messages begin loading)
Repeated loading artifacts when navigating previously visited regions
Perceived “sketchy” / non-deterministic rendering behavior
Pipeline / Architecture Signals
Non-transactional prepend/append operations
Rendering dependent on async or delayed derived state
No clear separation between data loading, derivation, and rendering
Lack of single authoritative message window state"

Plan

Step 1: kill the obvious local pain

Because some of it is cheap and high value:

fix clipping
raise overscan
improve measurement timing
separate load tokens
improve prefetch behavior

That gives immediate UX improvement and cleaner signal.

Step 2: see what pain remains

Checklist and DEV diagnostic event names: [docs/operations/channel-message-step2-evaluation.md](docs/operations/channel-message-step2-evaluation.md).

If after those fixes it still feels:

unstable
multi-phase
re-loady
weird on revisit
prone to scroll fighting

then you have proven the remaining pain is mostly contractual.

Step 3: rewrite only the structural core

Not the whole message UI.
Rewrite:

history/window ownership
anchor/scroll identity handling
prepend transaction model
retention model

That is the real subsystem rewrite.
