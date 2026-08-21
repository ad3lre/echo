# Echo contract v2 — TipTap JSON message body (additive)

This document extends [ECHO_CONTRACT_V1.md](./ECHO_CONTRACT_V1.md) with **message body v2**: structured JSON as source of truth for new messages, with explicit invariants for projections, mentions, schema versioning, search isolation, rendering failures, and migration exit criteria.

## Message format versions

| Value                          | Meaning                                                                                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message_format_version === 1` | Legacy: `content` TEXT is the body; optional client `mentions` with offsets into `content` (legacy path).                                                                                       |
| `message_format_version === 2` | JSON body: `content_json` is authoritative; `content` and `search_index_text` store the same plain string from **`deriveMessagePlainText(content_json)`** (Option A: **one** plain projection). |

## Plain text (Option A — locked)

- **`search_index_text`** is the canonical indexed plain string.
- **`contentText` in API responses** mirrors **`search_index_text`** (same bytes). **`message.content`** is populated with that value for v2 rows for backward compatibility with clients that only read `content`.
- **Exactly one** implementation converts `content_json` → plain for persistence: **`deriveMessagePlainText`** in `server/backend/src/domain/messagePlainTextProjection.ts`. No duplicate extractors elsewhere.

## Mentions (`message_format_version === 2`)

- **`mentions_resolved`** (stored in `mentions` JSONB): derived **only** from a server walk of **`content_json`**. Client/bot `mentions` arrays are **ignored** for persistence when `message_format_version === 2`.

## Content schema version

- **`content_schema_version`**: TipTap doc schema revision on the row.
- **Unsupported schema on write:** reject with validation error (no partial persist).
- **Unsupported schema on read:** do not fall back to legacy markdown for v2; use explicit failed-render handling (see frontend).

## Search

- Text search (`ILIKE` / `pg_trgm`) uses **`search_index_text` only**, not `content` or `content_json`.
- Search SQL remains in `server/backend/src/domain/echoMessagesDal.ts` per `check:echo-messages-dal`; do not reference `content` for text matching in search queries.

## Reverse derivation

- Plain text columns must not be used to synthesize `content_json` except in **explicit, versioned migration scripts**.

## Write payloads

- Clients must not send authoritative **`contentText`**, **`search_index_text`**, or server-owned **`mentions`** for v2 persistence; server derives them.

## Rich block plain tokens (schema v2)

Universal grammar for block nodes in plain projection / textarea edit:

```
![type: key=value, key2=value2]
```

- **`type`** — block kind (`image` today; `button` / `buttonrow` for action-row buttons).
- Attributes are comma-separated; values may be quoted when they contain commas or spaces.
- Implementation: `contracts/richBlockToken.ts`.

## Image slot blocks (`imageSlot`, schema v2)

- **Node:** block-level `imageSlot` in `content_json` with attrs `slotId`, `aspectW`, `aspectH`, optional `imageUrl`, `storageKey`, `width`, `height`.
- **Plain projection:** `![image: ratio=W:H, slotId=…]` per slot (filled image URL stays in JSON only).
- **Composer shortcut:** `![image: ratio=16:9]` assigns `slotId` on insert.
- **Writes:** `content_schema_version >= 2` required when the doc contains `imageSlot` nodes.
- **Empty message:** messages with one or more image slots count as non-empty even when derived plain text is whitespace-only.
- **Fill API:** `message:fillImageSlot` (socket) and `POST …/image-slots/:slotId/fill` (REST). Author-only; patches an empty slot in place.
- **Not in scope:** webhook/bot embed parity; moderator fill; replacing filled slots.

## Button row blocks (`buttonRow`, schema v2)

- **Node:** block-level `buttonRow` in `content_json` with attrs `rowId`, `buttons[]` (`label`, `style` 1–5, `url` for link buttons, `customId` for others).
- **Plain projection:** `![button: rowId=…]` per row (button definitions stay in JSON only).
- **Composer shortcuts (no `rowId`; assigned on insert):**
  - Link button: `![button: label=Visit, url=https://example.com]`
  - Styled button: `![button: label=Confirm, style=primary, id=confirm]`
  - Multi-button row: `![buttonRow: buttons="Visit|link|https://a.com;Cancel|secondary|cancel_id"]`
- **Styles:** `link`, `primary`, `secondary`, `success`, `danger` (or numeric `1`–`5`).
- **Persisted `components`:** derived on write for Discord-compatible rendering; link buttons open URLs; `custom_id` buttons are display-only in Echo (same as webhooks).
- **Empty message:** messages with one or more button rows count as non-empty even when derived plain text is whitespace-only.

## Phase 7 exit criteria (operational)

Before removing the legacy renderer branch, require (thresholds in runbook):

1. Sufficient share of messages with `content_json IS NOT NULL` and `message_format_version >= 2`.
2. Legacy renderer usage below threshold (telemetry).
3. Sampling: `search_index_text` matches `deriveMessagePlainText(content_json)` on sampled rows.
4. Zero (or bounded) invalid rows: `message_format_version === 2` with `content_json IS NULL`.
5. Render-failure metrics stable and explained.

## References

- Implementation: `contracts/echoMessageFormatV2.ts`, `server/backend/src/domain/messagePlainTextProjection.ts`, `server/backend/src/domain/contentJsonValidation.ts`, `echo_messages` columns in `server/backend/src/db/echoTables.ts`.
