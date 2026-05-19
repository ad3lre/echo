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
- **Exactly one** implementation converts `content_json` → plain for persistence: **`deriveMessagePlainText`** in `backend/src/domain/messagePlainTextProjection.ts`. No duplicate extractors elsewhere.

## Mentions (`message_format_version === 2`)

- **`mentions_resolved`** (stored in `mentions` JSONB): derived **only** from a server walk of **`content_json`**. Client/bot `mentions` arrays are **ignored** for persistence when `message_format_version === 2`.

## Content schema version

- **`content_schema_version`**: TipTap doc schema revision on the row.
- **Unsupported schema on write:** reject with validation error (no partial persist).
- **Unsupported schema on read:** do not fall back to legacy markdown for v2; use explicit failed-render handling (see frontend).

## Search

- Text search (`ILIKE` / `pg_trgm`) uses **`search_index_text` only**, not `content` or `content_json`.
- Search SQL remains in `backend/src/domain/echoMessagesDal.ts` per `check:echo-messages-dal`; do not reference `content` for text matching in search queries.

## Reverse derivation

- Plain text columns must not be used to synthesize `content_json` except in **explicit, versioned migration scripts**.

## Write payloads

- Clients must not send authoritative **`contentText`**, **`search_index_text`**, or server-owned **`mentions`** for v2 persistence; server derives them.

## Phase 7 exit criteria (operational)

Before removing the legacy renderer branch, require (thresholds in runbook):

1. Sufficient share of messages with `content_json IS NOT NULL` and `message_format_version >= 2`.
2. Legacy renderer usage below threshold (telemetry).
3. Sampling: `search_index_text` matches `deriveMessagePlainText(content_json)` on sampled rows.
4. Zero (or bounded) invalid rows: `message_format_version === 2` with `content_json IS NULL`.
5. Render-failure metrics stable and explained.

## References

- Implementation: `shared/echoMessageFormatV2.ts`, `backend/src/domain/messagePlainTextProjection.ts`, `backend/src/domain/contentJsonValidation.ts`, `echo_messages` columns in `backend/src/db/echoTables.ts`.
