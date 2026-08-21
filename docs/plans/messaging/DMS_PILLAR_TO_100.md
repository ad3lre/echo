# DMs pillar — 100% (status + deep polish)

**Audience:** Engineers and PMs using pillar **9 — DMs** in [`STATUS_AND_PRODUCTION_READINESS.md`](../../reviews/STATUS_AND_PRODUCTION_READINESS.md).

**As of 2026-03-27:** Core executive-plan items are **implemented** (group DM on graph, thread ordering, message-requests surface, CI, legacy fence for failed 1:1 open, observability logs, contract). What remains is **polish** (below), not blockers for a coherent DM product on Postgres + Socket.IO.

**Scope:** Direct messaging on the Echo graph — 1:1 and **group** threads, blocks, friends / guest carve-outs, DM realm access. See [Echo contract v1](../../contracts/ECHO_CONTRACT_V1.md) for routes.

---

## 1. What is green (implemented)

| Capability           | Notes                                                                                                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1:1 DM**           | [`POST /api/v1/echo/dm/open`](../../../server/backend/src/api/routes/echo/dm.ts), [`echo_dm_threads`](../../../server/backend/src/db/echoTables.ts), idempotent pair.                                                                                                                              |
| **Group DM**         | [`echo_group_dm_members`](../../../server/backend/src/db/echoTables.ts), [`POST /dm/group/open`](../../../server/backend/src/api/routes/echo/dm.ts) (3–10 members, pairwise eligibility + block checks), same `echo_channels` + DM realm as 1:1.                                                   |
| **Thread list**      | [`GET /dm/threads`](../../../server/backend/src/api/routes/echo/dm.ts) returns `kind: direct \| group`, **sorted by max message id** per channel (recency).                                                                                                                                        |
| **Access / post**    | [`access.ts`](../../../server/backend/src/domain/echoStore/members/access.ts): 1:1 via [`echoPairMayParticipateInDm`](../../../server/backend/src/domain/echoStore/social/dmThreads.ts); group via [`userHasEchoGroupDmAccess`](../../../server/backend/src/domain/echoStore/social/dmThreads.ts). |
| **Message requests** | [`GET /dm/message-requests`](../../../server/backend/src/api/routes/echo/dm.ts) maps **pending incoming friend** rows; SPA hydrates hub from API; ignore → [`POST /friends/decline`](../../../server/backend/src/api/routes/echo/social.ts); Accept → accept friend + open DM.                     |
| **Legacy fence**     | Real mode: failed [`postEchoOpenDm`](../../../clients/web/src/api/echoClient.ts) does **not** fall back to `dm-{userId}` for API traffic.                                                                                                                                                          |
| **Group DM UI**      | [`useAppLayoutGroupDm`](../../../clients/web/src/features/layout/composables/dm/useAppLayoutGroupDm.ts) calls server when possible; local `dm-group-*` remains **dev/mock fallback**.                                                                                                              |
| **CI**               | [`echo.pipeline.integration.ts`](../../../server/backend/src/tests/messages/echo.pipeline.integration.ts): friends + DM open idempotency + stranger 403 + block 403 + group open + thread shape + `message-requests` GET + **guest shared-server DM**.                                             |
| **Observability**    | Structured `req.log.info` for [`echo.dm.open`](../../../server/backend/src/api/routes/echo/dm.ts) / `echo.dm.group_open` outcomes.                                                                                                                                                                 |
| **Voice copy**       | Group [`DMCallView`](../../../clients/web/src/features/dm/components/DMCallView.vue) notes Voice pillar / SFU not productized.                                                                                                                                                                     |
| **Global Search**    | [`GET /dm/messages/search`](../../../server/backend/src/api/routes/echo/dm.ts) searches across all user DM threads.                                                                                                                                                                                |
| **Group Rename**     | [`PATCH /dm/group/:channelId`](../../../server/backend/src/api/routes/echo/dm.ts) updates group name on graph.                                                                                                                                                                                     |

---

## 2. Residual gaps (not “100% Discord”)

| Area                         | Note                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Message request ≠ friend** | Queue is **friend-request-shaped**; first-class “stranger DM preview” without friendship would need new tables + policy. |
| **dm-group-\* fallback**     | Mock/offline-style local groups still exist when server create fails or in `USE_MOCK_DATA` builds.                       |

---

## 3. Key file map

| Concern                                | Location                                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DM REST                                | [`server/backend/src/api/routes/echo/dm.ts`](../../../server/backend/src/api/routes/echo/dm.ts)                                                                                 |
| DM domain                              | [`server/backend/src/domain/echoStore/social/dmThreads.ts`](../../../server/backend/src/domain/echoStore/social/dmThreads.ts)                                                   |
| Access                                 | [`server/backend/src/domain/echoStore/members/access.ts`](../../../server/backend/src/domain/echoStore/members/access.ts)                                                       |
| Client API                             | [`clients/web/src/api/echoClient.ts`](../../../clients/web/src/api/echoClient.ts)                                                                                               |
| Layout / open-select thread entrypoint | [`clients/web/src/features/layout/composables/controller/useAppLayoutController.ts`](../../../clients/web/src/features/layout/composables/controller/useAppLayoutController.ts) |

---

_Re-verify before external commitments._
