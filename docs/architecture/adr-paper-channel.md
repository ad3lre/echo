# ADR: Paper channel type

## Status

Accepted (2026-05-23). Updated (2026-05-24): block-ownership collab replaces Yjs.

## Context

Echo needs a guild channel type for a single shared vertical document (Notion / Google Docs style) with block-level authorship and margin comments—not chat message history.

## Decision

1. **Channel type** `paper` on `echo_channels.type`.
2. **Document authority** `echo_paper_documents` (one row per channel): TipTap `content_json`, monotonic `revision`, optimistic concurrency via `expectedRevision` on PATCH.
3. **Comments authority** `echo_paper_comments` (separate table; never `echo_messages`).
4. **Authorship** Server stamps `paperBlockId`, `authorId`, `lastEditedAt` on block nodes when content changes; clients treat server response as authoritative.
5. **Permissions**
   - Author / edit body: `SEND_MESSAGES` (UI: “Author in paper”).
   - Margin comments: `COMMENT_ON_PAPER` (Echo extended permission).
   - Moderate comments: `MANAGE_MESSAGES` (UI: “Manage comments”).
   - Download / export (PDF, JSON, copy): `READ_MESSAGE_HISTORY` (UI: “Download / export paper”; gates File menu only).
   - View: `VIEW_CHANNEL`.
6. **Channel toggles** `paper_comments_enabled`, `paper_show_author_gutter` (default true).
7. **Chat** Message send/history APIs reject paper channels (`paper_channel` denial).
8. **Realtime** `paper_document_updated` and `paper_comment_updated` workspace events.
9. **Co-editing** Authors save via debounced HTTP PATCH. When **two or more authors** are connected in edit mode (`paper:watch` with `authoring: true`), block-ownership collab activates on the main Socket.IO connection:
   - `paper:claim` / `paper:release` — lock the block (line) where the cursor sits; no stealing; release on leave or explicit handoff.
   - `paper:cursor` — remote cursor/selection within blocks.
   - `paper:lock-request` — ask the owner to release.
   - Collab is **off** when only one author is present (no lock/cursor traffic).
10. **Share visibility** `paper_share_visibility` on the channel: `server`, `private`, `global` (read-only public URL `/paper/s/:token`).
11. **Presence** Socket.IO `paper:watch` / `paper:unwatch` join room `paper-watch:{channelId}`; server emits `paper:watchers` with author count and `collabEnabled`.
12. **UI modes** Per-channel `edit` / `comment` / `view` (sessionStorage); undo, typography, and autosave respect effective edit mode.

## Consequences

- Discord import/serializers omit `paper` until explicitly mapped.
- Paper-specific permission UI (`CHANNEL_PERMISSION_DEFS_PAPER`) in channel settings.
- Doc size capped by `MAX_CONTENT_JSON_BYTES`; comment bodies capped separately.
- No Yjs / second Socket.IO namespace; simpler ops and auth surface.
