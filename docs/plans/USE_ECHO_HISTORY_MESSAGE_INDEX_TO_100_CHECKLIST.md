# `useEchoHistory` / message index checklist (historical, not model-complete)

Date: 2026-04-11

This file no longer claims `100%` charter completion.

Code reads and [overview/agents.md](../../overview/agents.md) + [client-charter-violations.md](../../architecture/client-charter-violations.md) should inform boundary work in the current history pipeline:

- [`channelMessageAuthority.ts`](../../../clients/web/src/features/chat/domain/channelMessageAuthority.ts) still participates in duplicate message authority.
- [`echoRealtimeMessageStoreBridge.ts`](../../../clients/web/src/features/chat/ingest/echoRealtimeMessageStoreBridge.ts) still dual-writes raw messages and the channel index.
- `echoHistoryViewModel.ts` still mixes fetches, timers, diagnostics, read-state persistence, and pagination orchestration.

## Non-negotiables

- Exactly one model/domain authority owns message ordering, dedupe, merge semantics, caps, and index lifecycle.
- Raw `workspace.messages` cannot remain a second semantic authority.
- `useEchoHistory.ts` must stay a thin binder.
- Views and components remain render-plus-intents only.

## Open charter debt

- Remove dual-write between raw message buckets and the index.
- Stop treating `channelMessageAuthority.ts` plus `echoHistoryViewModel.ts` as the final authority split.
- Move history fetch timing, retries, timers, and diagnostics out of `echoHistoryViewModel.ts`.

## Historical note

Earlier phase language that treated the current split as shipped and complete was removed instead of re-scored to avoid guessing.
