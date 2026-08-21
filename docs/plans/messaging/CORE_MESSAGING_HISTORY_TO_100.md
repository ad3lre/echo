# Core messaging & history — pillar at 100% (archived closure plan)

**Status (2026-04-11):** Pillar **1 — Core messaging & history** is at **100%** in [`STATUS_AND_PRODUCTION_READINESS.md`](../../reviews/STATUS_AND_PRODUCTION_READINESS.md). **§6 — Shipped initiatives** is the authoritative “what exists today” summary. **§2 — Gap ledger** is a **frozen planning artifact** from before those ships; do not treat it as a current backlog.

**Audience:** Engineers and PMs tracing **how** the last pillar points were closed (historical context).

**Scope (historical):** The original **~9-point** ledger covered persisted chat, history, discovery, and tightly related APIs for this pillar only. It does **not** cover voice, the full **uploads** pillar (row 10), or **DM graph** depth (see [DMs pillar](./DMS_PILLAR_TO_100.md)).

**Method:** Point weights in §2 were **engineering estimates** for planning. They summed to **9** so initiatives could map to “about one pillar point” each.

---

## 1. What was already “green” before the final ships (~91% era)

Verified against the current codebase (REST + Socket.IO + `echo_messages`):

| Capability                | Notes                                                                                                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Persisted send**        | Socket path inserts into `echo_messages` with idempotency (`ON CONFLICT DO NOTHING`) and `message_ack` / `message_failed`.                                                                                                                                        |
| **History API**           | `GET /channels/:channelId/messages?before=&limit=` with membership check; **`GET …/messages/:messageId`**; list rows include **`reactions[]`** when present; ordering anchored on snowflake **`id`** (see [ADR 002](../../adr/002-echo-public-snowflake-ids.md)). |
| **Edit / delete**         | `PATCH` / `DELETE` on `/channels/:channelId/messages/:messageId`; socket `message:updated` / `message:deleted`; soft delete in DB.                                                                                                                                |
| **Reply metadata**        | `reply_to` JSONB stored and surfaced on the wire.                                                                                                                                                                                                                 |
| **Attachments**           | `attachments` JSONB; validated when object storage is configured (see contract).                                                                                                                                                                                  |
| **Polls**                 | Poll definition JSONB + `echo_poll_votes` for durable votes (socket handler).                                                                                                                                                                                     |
| **Link embeds**           | `embeds` JSONB; `echoLinkEmbeds` resolves URLs and emits `message:embeds`.                                                                                                                                                                                        |
| **Search (MVP+)**         | Server- and channel-scoped `GET …/messages/search` with `q`, `authorId`, `mentions`, `hasType`, **`hasAttachment`**; `pg_trgm` index on `content`; rate limits + metrics (see [`ECHO_CONTRACT_V1.md`](../../contracts/ECHO_CONTRACT_V1.md)).                      |
| **Unknown channel guard** | Non-persisted channel ids → `UNKNOWN_CHANNEL` (no legacy ghost rooms).                                                                                                                                                                                            |

**REST create:** `POST /channels/:channelId/messages` shares the same persist + broadcast path as socket `message` (see §6).

---

## 2. Gap ledger — ~9 points to 100% _(historical — superseded by §6)_

| Pts     | Initiative                     | Why it was missing / weak at ledger time                                                                                                                                                                                                                      | Primary deliverables (planning-era)                                                                                                                                                                                                                   |
| ------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2.5** | **Durable reactions**          | [`useMessageReactions.ts`](../../../clients/web/src/features/layout/composables/messaging/useMessageReactions.ts) mutates **in-memory** `RawMessage` only. No `echo_message_reactions` (or equivalent), no socket events, no hydration from `GET …/messages`. | New table + DAL; `message:react` / `message:reaction_update` (names per contract); enforce `ADD_REACTIONS` / manage where applicable; include `reactions[]` in list API payloads; optional REST for integrations.                                     |
| **2.0** | **Durable pins**               | [`usePinnedMessages.ts`](../../../clients/web/src/features/chat/composables/usePinnedMessages.ts) keeps pins in a **client ref** only — lost on refresh and invisible to other clients.                                                                       | Table (e.g. `echo_channel_pins`: channel_id, message_id, pinned_by, pinned_at); `GET/PUT/DELETE` pins API or embed in channel payload; socket fan-out; RBAC (`MANAGE_MESSAGES` / pin permission primitive if you add one); UI unchanged conceptually. |
| **1.0** | **REST create message**        | [`echoMessages.ts`](../../../server/backend/src/api/routes/echo/messages.ts) only **GET / PATCH / DELETE**.                                                                                                                                                   | `POST /channels/:channelId/messages` with **same validation** as socket `message` (shared helper), optional client `id` for idempotency, broadcast + persist identical to socket path.                                                                |
| **1.5** | **Search v2 (product depth)**  | Search is **usable** but not “parity complete”: ILIKE + trigram on **content** only; no snippets/highlighting, no ranked relevance, no attachment filename/body index, no cross-server inbox.                                                                 | Pick a slice: e.g. `tsvector` + ranking, result **snippets**, index strategy for large guilds, or “inbox search” — each can be phased; document limits in contract.                                                                                   |
| **1.0** | **Read state / unread cursor** | No first-class **per-user read pointer** per channel in the Echo API (unread badges rely on client heuristics / last seen in session).                                                                                                                        | `echo_channel_read_state` (user_id, channel_id, last_read_message_id or timestamp); REST + socket updates; optional `MESSAGE_READ` event; aligns mobile + desktop.                                                                                    |
| **0.5** | **GET single message**         | `getEchoMessageById` exists server-side but there is **no** public `GET …/messages/:messageId` for permalinks, moderation, or search-open.                                                                                                                    | Authenticated GET with `canUserAccessChannel`; return full row shape used by history; tie into jump-to-message and reports.                                                                                                                           |
| **0.5** | **Pillar confidence tests**    | Pipeline covers many Echo paths; message-specific **integration** depth (reactions/pins/REST create) not fully mirrored in CI.                                                                                                                                | Extend [`echo.pipeline.integration.ts`](../../../server/backend/src/tests/messages/echo.pipeline.integration.ts) or add `echo.messaging.*` tests for new APIs; optional frontend contract test for reaction payload shape.                            |

**Sum: 9.0 points**

---

## 3. What this document explicitly does _not_ count here

These affect **other** pillars or are **Horizon B** scale features; they are **not** part of the 9-point ledger above (they would move _other_ rows or the composite score):

- **Forum / thread channels** as first-class objects (touches DMs pillar + channel types + import).
- **Typing indicators** (realtime pillar; often no durable history).
- **Bulk purge / retention jobs** (moderation + ops).
- **Message forwarding** as a product action (could be “copy” via REST create + attribution).
- **E2E Cypress grid** (Testing & CI pillar, row 15).

---

## 4. Suggested sequencing (dependency-aware)

1. **GET message by id** (0.5) — unblocks search UX, reports, and moderation without waiting on reactions.
2. **REST POST create** (1.0) — shared validation module with socket; reduces drift.
3. **Durable reactions** (2.5) — high user visibility; depends on stable message identity (already true with snowflakes).
4. **Durable pins** (2.0) — often reuses channel access patterns from reactions rollout.
5. **Read state** (1.0) — can ship after history loads are stable; coordinate with presence/unread UI.
6. **Search v2** (1.5) — parallel track; may need DBA review for index size.
7. **Tests** (0.5) — fold in as each feature lands.

---

## 5. How to use this with the mega report

When **row 1** moves toward **100%**, update [`STATUS_AND_PRODUCTION_READINESS.md`](../../reviews/STATUS_AND_PRODUCTION_READINESS.md):

- Bump the **%** as initiatives ship (roughly proportional to the point table, or re-estimate after user testing).
- Keep **Horizon B** narrative honest: **global / omnibox search** and **threads** may still cap the _composite_ “full-feature” score even when row 1 is at 100% for _Echo’s chosen scope_.

---

## 6. Shipped initiatives (2026-04-03)

| Ledger item        | Implementation notes                                                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| GET single message | `GET /channels/:channelId/messages/:messageId`; `fetchEchoChannelMessage`; jump-to-message prefetch.                                                                                                                             |
| REST POST create   | `POST /channels/:channelId/messages` + `echoPersistedMessageCreateAndBroadcast` (shared with socket `message`); `postEchoChannelMessage`; `201` / `200` + `idempotentReplay`.                                                    |
| Durable reactions  | Table `echo_message_reactions`; `ADD_REACTIONS` + remove-own with `VIEW_CHANNEL`; `reactions[]` on list/GET; socket `message:reaction_toggle` → `message:reactions`; REST `PUT/DELETE …/messages/:messageId/reactions`.          |
| Durable pins       | Table `echo_channel_pins`; `PIN_MESSAGES`; `GET/POST …/pins`, `DELETE …/pins/:messageId`; socket `message:pin` / `message:unpin` → `message:pins`; UI hydrates from API + socket.                                                |
| Read state         | Table `echo_channel_read_state`; `GET/PUT …/read-state`; client fetches cursor in `useEchoHistory` (`lastReadMessageIdByChannel`) for future unread UX.                                                                          |
| Search v2 (slice)  | **`hasAttachment`** query on server- and channel-scoped search (`hasAttachment=1                                                                                                                                                 | true | yes`). |
| Tests              | [`echo.pipeline.integration.ts`](../../../server/backend/src/tests/messages/echo.pipeline.integration.ts) covers GET message, POST + idempotent replay, reaction PUT, pins GET/POST, read-state GET/PUT, `hasAttachment` search. |

---

_Last aligned with repo behavior as of **2026-04-03**; narrative header frozen vs §6 as of **2026-04-11**. Re-verify before external commitments._
