# Echo Contract v1

Frozen **v1** contract for Echo realtime + REST. Breaking changes require **v2** (new event names, new routes, or incompatible payload shapes) and an explicit version bump in this document.

## Socket.IO — client → server

| Event                     | Payload                                                                   | Behavior                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`                 | `{ channelId, content, mentions?, replyTo?, id? (UUID), correlationId? }` | Persisted Echo channel only: insert then `message` broadcast; unknown `channelId` → `message_failed` `UNKNOWN_CHANNEL`; validation → `VALIDATION`; rate limit → `RATE_LIMIT`. |
| `poll:vote`               | `{ channelId, messageId, optionId, correlationId? }`                      | Cast or change vote on a persisted poll; emits `poll:updated` to channel room or `poll:vote_failed` to sender on error.                                                       |
| `message:edit`            | `{ channelId, messageId, content, correlationId? }`                       | Author edit; emits `message:updated` to channel room.                                                                                                                         |
| `message:delete`          | `{ channelId, messageId, correlationId? }`                                | Author or moderator; emits `message:deleted`.                                                                                                                                 |
| `message:reaction_toggle` | `{ channelId, messageId, emoji, correlationId? }`                         | Toggle caller’s row in `echo_message_reactions`; requires `ADD_REACTIONS` (guild) or DM access; emits `message:reactions`.                                                    |
| `message:pin`             | `{ channelId, messageId, correlationId? }`                                | Pin message; requires `PIN_MESSAGES`; emits `message:pins`.                                                                                                                   |
| `message:unpin`           | `{ channelId, messageId, correlationId? }`                                | Unpin; same permission gate; emits `message:pins`.                                                                                                                            |
| `joinChannel`             | `channelId` string                                                        | Join Socket.IO room; Echo channels require auth + `canUserAccessChannel`.                                                                                                     |
| `leaveChannel`            | `channelId` string                                                        | Leave room.                                                                                                                                                                   |
| `presence:set`            | `{ status }`                                                              | Persist presence (authenticated).                                                                                                                                             |
| `presence:heartbeat`      | `{ status }`                                                              | Refresh `updated_at` for TTL sweep.                                                                                                                                           |

## Socket.IO — server → client

| Event                  | Payload                                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`              | `Message`                                                                                                                                                                                                |
| `message_ack`          | `{ message }` — idempotent resend matched existing row                                                                                                                                                   |
| `message_failed`       | `{ code, channelId?, clientMessageId?, detail?, correlationId?, diagnostics? }` — see codes below; `correlationId` echoes client id for reaction/edit/pin rollback; `diagnostics` optional RBAC snapshot |
| `message:updated`      | `{ channelId, messageId, content, editedAt, contentText?, contentJson?, messageFormatVersion?, contentSchemaVersion?, mentions? }`                                                                       |
| `message:deleted`      | `{ channelId, messageId }`                                                                                                                                                                               |
| `message:embeds`       | `{ channelId, messageId, embeds: Embed[] }` — link preview metadata (may be empty to clear)                                                                                                              |
| `message:reactions`    | `{ channelId, messageId, reactions: MessageReaction[] }`                                                                                                                                                 |
| `message:pins`         | `{ channelId, messageIds: string[] }` — newest pin first                                                                                                                                                 |
| `presence:update`      | `{ userId, status }`                                                                                                                                                                                     |
| `echo:workspace_event` | `{ kind, version, serverId?, userId?, … }` — membership, channel tree, roles, server updates, `discord_export_ready`, etc. (see `EchoWorkspaceEvent` in `shared/types/socket.ts`)                        |
| `poll:updated`         | `{ channelId, messageId, poll: PollData }` — tallies after a vote                                                                                                                                        |
| `poll:vote_failed`     | `{ code, channelId?, messageId?, detail? }` — see `PollVoteFailedCode` in `shared/types/socket.ts`                                                                                                       |

### `message_failed.code` (v1)

| Code                   | Meaning                                             |
| ---------------------- | --------------------------------------------------- |
| `RATE_LIMIT`           | Too many messages or socket events                  |
| `SLOWMODE`             | Channel slowmode; wait before sending               |
| `VALIDATION`           | Payload invalid (`detail` may explain)              |
| `FORBIDDEN`            | Not allowed to post (membership / timeout / ban)    |
| `PERSIST_FAILED`       | DB error on insert                                  |
| `UNAUTHENTICATED`      | Echo persisted channel requires logged-in socket    |
| `UNKNOWN_CHANNEL`      | Channel id not in `echo_channels`                   |
| `IDEMPOTENCY_EXPIRED`  | Client message `id` reused after idempotency window |
| `GUEST_LIMIT`          | Guest posting cap                                   |
| `GUEST_ABUSE_COOLDOWN` | Guest rate cooldown                                 |

## REST — `/api/v1/echo/*`

All error bodies: `{ code: string, message: string, detail?: string }`.

### Common HTTP status ↔ code

| HTTP | Typical `code`                                     | Notes                                                  |
| ---- | -------------------------------------------------- | ------------------------------------------------------ |
| 400  | `INVALID_BODY`, `INVALID_STATUS`, `INVALID_TARGET` | Bad input                                              |
| 403  | `FORBIDDEN`, `CHANNEL_FULL`                        | Denied access / moderate; or voice channel at capacity |
| 404  | `NOT_FOUND`                                        | Missing resource                                       |
| 503  | `ECHO_UNAVAILABLE`, `UPLOADS_NOT_CONFIGURED`       | Echo DB off or S3 not configured                       |

REST `code` is an **open string** set: routes may return additional `code` values (e.g. `SEARCH_QUERY_REQUIRED`, `UPGRADE_REQUIRED`, auth and integration errors). Document new Echo-domain codes in this file when they are part of the stable client contract.

Socket `MessageFailedCode` aligns with REST `FORBIDDEN`, `UNAUTHENTICATED`, `RATE_LIMIT`, `VALIDATION` where applicable.

### Routes (summary)

- `GET` `/channels/:channelId/messages`, `GET` `.../messages/:messageId`, `POST` `.../messages` (create; same validation + broadcast as socket `message`; **201** new row, **200** `{ message, idempotentReplay: true }` for idempotent replay inside window), `PATCH/DELETE` `.../messages/:messageId`
- `PUT/DELETE` `/channels/:channelId/messages/:messageId/reactions` — body `{ emoji }`; add / remove caller’s reaction; **200** `{ reactions }`; guild mutations are suppressed by communication timeout even when `ADD_REACTIONS` / `VIEW_CHANNEL` would otherwise allow them.
- `GET` `/channels/:channelId/pins` — **200** `{ messageIds: string[] }` (newest first). `POST` same path, body `{ messageId }` — **200** `{ messageIds }`. `DELETE` `.../pins/:messageId` — **200** `{ messageIds }`. Requires `PIN_MESSAGES` for mutations and is also suppressed by communication timeout.
- `GET/PUT` `/channels/:channelId/read-state` — **GET** `{ lastReadMessageId: string | null }`; **PUT** body `{ lastReadMessageId }` (must be a visible message in that channel); **204**; monotonic advance server-side (string compare on snowflake ids).
- `GET` `/channels/:channelId/capabilities` — **200** `{ canViewChannel, canSendMessages, canCreatePolls, canUploadFiles, canUseExternalEmoji, canManageChannel, communicationTimeoutActive, communicationTimeoutUntil, communicationTimeoutUntilEpochMs }`; timeout fields describe the caller’s active guild communication timeout and must be treated as a policy overlay on top of raw permissions.
- `GET` `/servers/:serverId/capabilities` — **200** server-wide capability booleans plus `communicationTimeoutActive`, `communicationTimeoutUntil`, `communicationTimeoutUntilEpochMs`; timeout fields suppress supported communication actions like invite creation, nickname changes, channel creation, and guild voice join/video entry points.
- `GET` `/servers/:serverId/messages/search` — full-text style search over **text channels** the caller can `VIEW_CHANNEL` (member-only). Query: `q` (substring match on indexed text when present; any non-empty length), `hasType` (`image`|`gif`|`link`|`video`|`audio`|`docs`), **`hasAttachment`** (`1` / `true` / `yes` — non-empty `attachments` array), `authorId`, `mentions` (substring, e.g. username after `@`), `channelId` (must be an allowed channel in that server), `before` (message id cursor, older pages), `limit` (default 24, max 50). **400** `SEARCH_QUERY_REQUIRED`, `INVALID_QUERY`; **403** if not a server member or `channelId` not allowed; **429** stricter per-user bucket (60/min) in addition to Echo read limits. Response `{ messages: Message[] }` (same fields as list-by-channel, including `reactions` when present).
- `GET` `/channels/:channelId/messages/search` — same query contract for a **single** channel; **403** if `canUserAccessChannel` fails (includes DM threads).
- `GET/POST` `/servers`, `GET/POST` `/servers/:serverId/channels`
- `POST` `/servers/:serverId/invites`, `POST` `/invites/:code/join`
- `GET` `/friends`; `GET` `/friends/requests` (pending incoming/outgoing); `POST` `/friends/request`, `/friends/accept`, `/friends/decline`, `/friends/cancel` (body: `peerId` where applicable)
- `GET/POST` `/presence`
- `GET` `/blocks`, `POST` `/blocks` (body: `targetUserId`), `DELETE` `/blocks/:targetUserId`
- `POST` `/reports/user` (body: `targetUserId`, optional `reason`)
- **DMs (Echo graph, `echo_dm_realm`):**
  - `POST` `/dm/open` (body: `peerUserId`) — returns `{ channelId, peerUserId }` for a **1:1** thread; **403** when blocked or policy denies (non-friends without guest/shared-server carve-out); idempotent on pair.
  - `POST` `/dm/group/open` (body: `memberUserIds` — unique list including the caller, **3–10** users, `name` optional) — creates a **group** DM channel and membership rows; **403** when any pair is ineligible or blocked.
  - `GET` `/dm/threads` — `{ threads: ( { kind: 'direct', channelId, peerUserId } | { kind: 'group', channelId, name, memberUserIds } )[] }` sorted by **last message id** (then channel id), newest first.
  - `GET` `/dm/message-requests` — `{ requests: { id, fromUserId, preview }[] }`; rows are **pending incoming friend requests** (same underlying data as `GET` `/friends/requests` incoming); **403** `UPGRADE_REQUIRED` for guests.
  - **Client invariant:** In authenticated Echo mode, chat must use **snowflake `channelId`** from `/dm/open` or `/dm/group/open` (or listed in `/dm/threads`), not synthetic `dm-{userId}` ids, when talking to the API or Socket.IO.
- `POST` `/uploads/presign` — presigned `PUT` to S3-compatible storage when `ECHO_S3_*` is set; otherwise **503** `UPLOADS_NOT_CONFIGURED`
  - **Body (JSON):** `key` (required, safe filename fragment), `contentType`, `contentLength` (bytes, 1…25 MiB), plus one auth scope:
  - **`channelId`** (preferred for chat media): authorized via `canUserPostMessage` (guild channels and DMs). Object key prefix `echo/channels/{channelId}/{userId}/…`. Allowed content types: chat images (png, jpeg, gif, webp) and video (mp4, webm, quicktime).
  - **`serverId`** without `purpose`, or `purpose: legacy_server`: member-only (`isMemberOfServer`) and suppressed by active guild communication timeout; key `echo/{serverId}/{userId}/…` (legacy).
    - **`purpose: server_emoji`** + **`serverId`**: user may manage server custom emojis; key `echo/emoji/{serverId}/{userId}/…`.
    - **`purpose: user_avatar`** or **`user_banner`**: authenticated user only; must **not** send `channelId` or `serverId`; keys `echo/avatars/{userId}/…` / `echo/banners/{userId}/…`.
    - **`purpose: server_icon`** or **`server_banner`** + **`serverId`**: requires `MANAGE_GUILD`; keys `echo/server-icons/{serverId}/{userId}/…` / `echo/server-banners/…`.
  - **200 response:** `uploadUrl`, `publicUrl`, `key`, `headers` (include `Content-Type` for the `PUT`), `publicUrlPrefixes` (for clients).
  - **Errors:** **400** `INVALID_BODY`, **403** `FORBIDDEN`, **503** `UPLOADS_NOT_CONFIGURED`.
- `POST` `/uploads/retention/touch` — authenticated; body `{ storageKeys: string[] }` (max 20). Resets **abandonment** timers for chat media the caller can read. Server ignores touches when `last_seen_at >= now() - 24h` per key.
- **Chat media abandonment** (user-sent channel/legacy/webhook-inbound keys only; not avatars, banners, emoji, etc.):
  - Timers start at upload (`expires_at = created_at + abandon_ms`); first UI visibility touch sets `last_seen_at` and recomputes `expires_at`.
  - Free tiers by size: ≤10 MB → 6y; ≤100 MB → 3y; &gt;100 MB → 12mo. Echo+: ≤15 MB permanent (snapshot); &gt;15 MB ×1.25. Echo Black: ≤100 MB permanent; &gt;100 MB paused until downgrade (then ×1.30). Webhook inbound uses free rules.
  - Dedupe/shared `storage_key`: **first registration** plan snapshot controls retention for all references.
  - Expired objects: `GET` `/uploads/files/*` and `/uploads/s3/*` return **404** (internal log `expired: true`). Background job purges blobs; retention rows kept with `purged_at` / `purge_status`.
- **Custom emoji (cross-guild rendering):**
  - Messages store Discord-style tokens `<:name:snowflake>` / `<a:name:snowflake>`.
  - `POST` `/emoji/resolve` (auth, body `{ ids: string[] }`, max **200** ids) returns `{ emojis: { key, id, name, animated, imageUrl, assetUrl?, sourceDiscordEmojiId? }[] }` — global lookup by Echo emoji id or `discord_source_emoji_id` (no home-server membership required for metadata).
  - When `image_url` is stored under `echo/emoji/{serverId}/…`, resolve returns `assetUrl` (and `imageUrl` set to the same path) as `/api/v1/echo/emoji/{id}/asset` so viewers in **other** guilds are not blocked by home-server upload read ACL on `/uploads/s3/*`.
  - `GET` `/emoji/:emojiId/asset` — authenticated; streams the emoji bytes if the row exists (does **not** require `isMemberOfServer` for the emoji’s home server). Server settings / picker uploads still use `purpose: server_emoji` presign + home-server upload ACL.
- Socket `message` may include **`attachments`**: array (max 10) of `{ url, storageKey?, kind: image|video|gif|audio|document, filename?, mimeType?, fileSize?, spoiler? }`. When object storage is configured, `data:` URLs are rejected; do not combine `attachments` with legacy `imageUrl` / `videoUrl` / `gif` in one message.
- `POST` `/servers/:serverId/moderation`, `GET` `.../audit`, `GET` `.../moderation/history`
- `GET` `/workspace` — joined servers + category/channel trees + `membersByServer`; member rows may include `communicationTimeoutUntil` when that member is currently timed out in the guild.

## Ordering and idempotency (v1)

- **Ordering:** Messages in a channel are ordered by **snowflake message `id`** (string sort / cursor pagination). `created_at` is metadata; do not use it as the timeline authority (see ADR 002 / runbooks). List APIs return pages consistent with id ordering.
- **Idempotency:** Client may send optional UUID `id` on `message`; duplicates within the configured window reconcile to `message_ack`; after the window, `IDEMPOTENCY_EXPIRED`.

## Production vs dev-only mock

- **Production:** `NODE_ENV=production` requires `DATABASE_URL`; **`/api/v1/mock/*` is not registered**. The SPA build disables mock UI mode (`USE_MOCK_DATA` is always false when `import.meta.env.PROD`).
- **Local dev (optional):** Backend may register `/api/v1/mock/*` when `NODE_ENV` is not production and `ALLOW_MOCK_API=true`. With `DATABASE_URL` set, **`Bearer` + `/api/v1/mock/*`** still returns `403` `MOCK_MIXED_MODE` to prevent mixed identity.
- Mock user ids (`user_*` / demo ids) must not be used as Echo persistence identities when authenticated.

## Metrics

- **`GET /api/v1/metrics`** — Prometheus text exposition. **Scrape:** HTTP GET on the API’s public base URL with path `/api/v1/metrics` (same host/port as REST; no auth on metrics in default config — protect at the network or reverse proxy in production). **Job naming:** use a stable Prometheus `job` label per environment (e.g. `echo_api`); Echo metrics do not depend on a specific job value.
- **Series (Echo domain):** `echo_socket_message_branch_total`, `echo_message_failed_total`, `echo_messages_persisted_total`, `echo_socket_message_handler_duration_seconds`, `echo_message_search_duration_seconds`, `echo_message_search_result_count`, `echo_rest_http_requests_total` (labels `route_group`, `method`, `status_class`), `echo_rest_http_request_duration_seconds` (histogram, label `route_group`), `echo_dm_open_total` (label `outcome`), plus workspace/snapshot/permission/snowflake counters and histograms defined in `backend/src/observability/echoMetrics.ts`. Default Node/process metrics are prefixed `echo_` via `prom-client`.
- **Cardinality:** app metrics use **low-cardinality** labels only (`branch`, `code`, `scope`, `route_group`, `status_class`, `method`, `outcome`, etc.). Do not add per-channel or per-user labels in new instrumentation.
- **Alert/recording rules (repo):** versioned under [`monitoring/prometheus/rules/`](../../monitoring/prometheus/rules/) with scrape notes in [`monitoring/README.md`](../../monitoring/README.md).

## Machine-readable surface

- TypeScript: [`shared/echoContractV1.ts`](../../shared/echoContractV1.ts) — event name allowlists for tests/CI.
- Types: [`shared/types/socket.ts`](../../shared/types/socket.ts).

## Client — linkable ID tokens

Plain `content` may include the following **literal** substrings. The web client renders them as mention-style pills (resolved labels from local cache when available):

| Token                        | Meaning           | Display (typical) |
| ---------------------------- | ----------------- | ----------------- |
| `<@id>` / `<@!id>`           | User              | `@DisplayName`    |
| `<#id>`                      | Channel           | `#channel-name`   |
| `<@&id>`                     | Role              | `@label`          |
| `<$id>`                      | Server (guild)    | server name       |
| `<m:id>`                     | Message reference | `m:short…`        |
| `<:name:id>` / `<a:name:id>` | Custom emoji      | `:name:`          |

These are **not** a separate wire format from `content` — they live in the same UTF-8 string as the message body. Server-side mention entities (`mentions[]`) still apply to `@` picker ranges; pasted tokens are expanded on the client when present in `content`.

## Checklist for new routes / handlers

1. Permission via `echoPermissions` or `echoPolicy` — no ad hoc `echo_*` SQL in routes/sockets (use `echoStore`).
2. Document new **stable** Echo-domain REST `code` values in this file (and error behavior) when clients must handle them; there is no exhaustive machine-readable registry.
3. New socket events require updating `ECHO_V1_*_SOCKET_EVENTS` and `ClientToServerEvents` / `ServerToClientEvents`.
