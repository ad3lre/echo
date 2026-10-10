# Targeted security review — 2026-10-01

## Scope and evidence

Reviewed the current working tree, including the uncommitted fixes recorded in
`red-team-review-2026-09-24.md`. Focused on common failure points in fast-moving
apps: authenticated routes that take object IDs, realtime subscriptions after
permission changes, transitive role grants, login and CSRF boundaries, remote
fetches, uploads, and HTML rendering. Traced authorization from HTTP/socket
entry points to the service or broadcast. The two new runtime reproductions
used Fastify injection and a local Socket.IO server with mocked identity,
database, and Honcho transport; they made no production or third-party calls.

This is a targeted code review, not a full penetration test. No production
configuration, live Honcho workspace, database, browser, or deployed network
boundary was exercised. Existing source changes were left untouched.

## Findings

### High — Paper viewers keep a second realtime subscription after revocation

**Code:** `server/backend/src/sockets/paperWatchHandler.ts:204`,
`server/backend/src/sockets/paperCollabHandler.ts:260`,
`server/backend/src/platform/echoRealtimeMembership.ts:13-32,49-121`.

`paper:watch` checks channel and document access only when joining. It then joins
the separate `paper-watch:<channelId>` room. All four permission-change eviction
helpers remove users from the channel ID room, but none removes them from the
Paper watch room or its watcher maps. After a member is removed, banned, loses
channel access, or the Paper document becomes private, an existing watcher can
still receive `paper:watchers`, lock/cursor events, and `paper:block-previews`.
The latter contains author-entered text. A fresh `paper:watch` would fail, but
the existing room subscription remains.

**Reproduction:** A local Socket.IO test connected one viewer and two authors to
the real Paper handlers, joined the viewer to `paper-watch:paper`, then set its
channel-access predicate to false and called
`evictUserFromEchoServerRealtimeScopes`. The viewer left the `paper` room but
remained in `paper-watch:paper`. After eviction, an author emitted
`paper:block-preview` and the removed viewer received the new preview text.

**Recommended fix:** Make Paper watch membership part of the same revocation
policy as channel rooms. Evict affected sockets from `paper-watch:<channelId>`
and clean `channelWatchers`/`socketPaperChannels` and collaboration state. Apply
this on member, role, channel, category, and Paper visibility changes. Cover
delivery after each revocation with socket-level tests, including an already
connected viewer and a document changed to private.

### High when enabled — Honcho memory routes accept unowned sessions and peers

**Code:** `server/backend/src/api/routes/honchoMemory.ts:103-194`,
`server/backend/src/services/honcho/memory.ts:17-86`.

These routes require login but do not bind `sessionId` or the `peers` map to the
caller, a channel the caller can access, or a stored authorization record.
`POST /honcho/sessions` forwards arbitrary peer IDs to `session.addPeers`;
`POST /honcho/sessions/:sessionId/messages` writes as the caller to any supplied
session; `/honcho/me/chat` forwards arbitrary session and target peer IDs to
the SDK. Echo channel IDs are also used as Honcho session IDs when messages are
synced, so a known private channel ID is a meaningful target.

**Reproduction:** With `HONCHO_ENABLED` simulated and the SDK transport
substituted by a recording stub, the actual Fastify routes returned 200 for an
attacker identity requesting a `private-channel` session, adding a `victim`
peer, writing a message to that session, and querying `targetPeerId: victim`.
The stub recorded all three operations. This proves Echo forwards the
unauthorized operations. Whether the real Honcho service returns private
content was not tested.

**Recommended fix:** Decide and persist the allowed session audience. For
channel-backed sessions, check current channel membership and visibility on
every operation. Restrict peer additions and targets to that audience, and
derive peer identity from the authenticated user. If arbitrary personal
sessions are intended, namespace them by user and reject cross-user IDs.
Bound session ID, peer count, content, and metadata size before forwarding.

### Medium, configuration-dependent — linked roles bypass the checked grant set

**Code:** `server/backend/src/domain/echoStore/roles/selfAssignableRoles.ts:435-483`,
`server/backend/src/domain/echoStore/roles/roles.ts:984-1036`,
`server/backend/src/domain/echoStore/roles/roleLinks.ts:19-69`.

Self-assignment checks that the actor may grant the selected role's direct
permissions. Role assignment also checks the selected role and role hierarchy.
Both then call `applyEchoRoleLinksAfterAssignment`, which recursively inserts
all linked roles without checking their permissions or positions against the
actor. For example, if a selectable low-permission role points to a role with
`ADMINISTRATOR`, a member who can select the former receives the latter. A
role manager can likewise assign a lower role and indirectly grant a role they
cannot assign directly. This requires a link to a more privileged role to
exist; creating that link is itself restricted by current checks. The risk is
that later assignment of the anchor bypasses the otherwise enforced grant
rules, including after linked role permissions change.

**Evidence:** Source trace of the direct permission check followed by the
unconditional transitive insert. No database-backed role graph was exercised,
so this finding is conditional on the stated graph and should be reproduced
with a real role fixture before rollout.

**Recommended fix:** Resolve the full linked-role closure before assignment and
apply the same permission and hierarchy checks to every resulting role. Also
reject a role-link or role-permission update that would make an exposed
self-selectable role grant elevated permissions unexpectedly. Perform the
check and inserts in one transaction to avoid graph changes between them.

## Checked paths without a new finding

The current tree contains fixes for activity-sidecar request signing, legacy
bearer fallback, bounded outbound bodies and SSRF fetches, upload object
immutability, ticket reads, and server-targeted workspace event recipients.
The backend `test:security` suite passed on this tree. The newly found Paper
subscription and Honcho session paths are not covered by that suite. The
review also inspected OAuth/MFA checks, CSRF enforcement, upload intent and
read authorization, role and permission routes, and several HTML sinks;
no additional exploit was established in those paths.
