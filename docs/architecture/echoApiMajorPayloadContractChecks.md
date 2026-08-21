# Echo API — major payload contract checks (trust boundary)

Charter: [agents.md](../overview/agents.md). Leak goal **row 16** in [client-charter-leak-goals.md](./client-charter-leak-goals.md). Canonical HTTP contracts: [ECHO_CONTRACT_V1.md](../contracts/ECHO_CONTRACT_V1.md), [ECHO_CONTRACT_V2.md](../contracts/ECHO_CONTRACT_V2.md).

**Definition — “major payload”:** responses that carry large nested JSON (workspace snapshot, message lists, DM thread lists, invite/directory rows, etc.) or security-sensitive tokens (e.g. LiveKit). These must not be trusted as `unknown` cast to DTO without at least **structural** validation at the `api/echo/*` boundary or an immediate delegate that parses `unknown` in `services/domain/*`.

**Definition — “contract check”:** any of: (1) explicit `unknown` → shape guards + `throw` in `api/echo/*`; (2) same in a dedicated parser re-exported from api (e.g. `parseEchoLiveKitSessionResponse`); (3) thin fetch + **validated** handoff into a domain normalizer that treats payload as `unknown` / `Record` and throws on invalid shape.

This document is the **inventory** for row 16. It is not a promise of per-field Zod schemas everywhere; it records where the boundary is enforced today.

---

## Inventory

| Surface                                                       | API / domain location                                                                                                                                                                                | Contract mechanism                                                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /workspace`                                              | [`workspace.ts`](../../clients/web/src/api/echo/workspace.ts) → [`workspaceEchoApiSnapshot.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceEchoApiSnapshot.ts)                     | Structural checks on `servers` + `categoriesByServer` before domain assembly                                                |
| Channel messages, search, pins, read-state, `POST …/messages` | [`messages.ts`](../../clients/web/src/api/echo/messages.ts)                                                                                                                                          | Envelope parsers: `messages[]`, `message`, `messageIds[]`, `lastReadMessageId`, post response + optional `idempotentReplay` |
| LiveKit voice session                                         | [`voice.ts`](../../clients/web/src/api/echo/voice.ts) `parseEchoLiveKitSessionResponse`                                                                                                              | Explicit `unknown` → required string fields                                                                                 |
| DM threads                                                    | [`social.ts`](../../clients/web/src/api/echo/social.ts) → [`echoDmThreadsFromHttp.ts`](../../clients/web/src/features/dm/echoDmThreadsFromHttp.ts)                                                   | Domain normalizer owns row parsing                                                                                          |
| Invite preview + directory servers                            | [`invitesAndDirectory.ts`](../../clients/web/src/api/echo/invitesAndDirectory.ts) → [`echoInvitesAndDirectoryFromHttp.ts`](../../clients/web/src/features/layout/echoInvitesAndDirectoryFromHttp.ts) | Domain normalizer                                                                                                           |
| Emoji market packs                                            | [`emoji.ts`](../../clients/web/src/api/echo/emoji.ts) → [`echoEmojiMarketPacksFromHttp.ts`](../../clients/web/src/features/chat/emoji/echoEmojiMarketPacksFromHttp.ts)                               | Domain normalizer                                                                                                           |
| Smaller CRUD / void Echo calls                                | Various `void_command` / `passthrough` per [echoApiNormalizationInventory.md](./echoApiNormalizationInventory.md)                                                                                    | Typed `echoFetch` + server contract; no large nested merge in api                                                           |

---

## Row 16 — status

Every **major** response path in the table above has an explicit contract owner at or immediately after the Echo HTTP boundary, aligned with frozen contract docs where applicable. Further work (optional): deeper per-field schemas (e.g. Zod) for `EchoApiMessage` if product wants stricter client-side guarantees.

---

## Revision

| Date       | Note                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| 2026-04-11 | Initial inventory; `messages.ts` envelope validation added for row 16. |
