# ADR: Client channel message authority

## Status

Accepted (2026-04-11). **Target architecture:** [`channelMessageAuthority.ts`](../../frontend/src/services/realtime/channelMessageAuthority.ts) is the sole write owner for the bound messages record (index canonical, bucket materialized); shell/session removals and snapshot replace use exported helpers on the same module (`channelMessagesOwner`).

## Context

Channel messages were represented in two places kept in sync:

- `echoSession.messages` / `workspace.messages`: `Record<channelId, RawMessage[]>`
- Per-channel `ChannelMessageIndex` (`stores/messageIndex` → `services/realtime/channelMessageIndex.ts`)

Writers included HTTP history (`echoHistoryOrchestration`), realtime ingest (`echoRealtimeChatIngest` sinks), optimistic/realtime append (`echoRealtimeMessageStoreBridge`), prefetch ([`echoWorkspaceChannelPrefetch`](../../frontend/src/services/orchestration/echoWorkspaceChannelPrefetch.ts) via `channelMessageAuthority`), and remote patch helpers (`socketRemoteMessagePatchApply`).

Readers included layout/DM rail (`useAppLayoutDmPanelInboxComputed`, `useAppLayoutDmCalls`, `computeLatestDmPeerUserIdForRail`), chat view models (`activeChannelMessages`, `channelMessageBucket`), search (`messageSearchControllerState`), pins (`usePinnedMessages`), reactions/polls composables, `useAppLayoutController` / `AppLayout.vue` (pass-through `messages`), and tests.

## Decision

1. **Canonical ordering and identity** live in `ChannelMessageIndex` (insert, mergeBatch, update, remove, trimHead).
2. **`messages[channelId]` is a materialized view** of `index.sorted` for the same channel. It must not be edited as the source of truth except through the materialization step.
3. **Single materialization API**: `syncChannelMessages` in `frontend/src/services/realtime/channelMessageAuthority.ts` (backed by `writeSortedMessagesForChannel` in `channelMessageBucket.ts`). All code paths that mutate the index and need the legacy record shape must call this after mutations (or use higher-level helpers in the same module: `replaceChannelMessagesFromHistory`, `prependChannelMessagesFromHistory`, `ensureChannelBucket` + index ops + `syncChannelMessages`).
4. **Binding**: `bindChannelMessageBuckets(workspace.messages)` must run during workspace init so authority reads/writes the same ref as orchestration and realtime.

## Consequences

- Remote patch and ack sinks should not assign `messages.value[channelId] = sorted` directly; they delegate to `syncChannelMessages` so materialization stays one implementation.
- After index mutations, materialization must call `getChannelIndex(channelId)` **without** passing the previous bucket array: passing a stale `messages[channelId]` snapshot can trigger `mergeBatch(..., 'replace')` and undo in-memory edits.
- **`replaceChannelMessagesFromHistory` is merge-safe:** it full-replaces only when the channel index is empty; otherwise it appends missing ids only. See [channel-history-merge-invariants.md](./channel-history-merge-invariants.md).
- Future work may migrate more readers to index-only APIs; until then, materialization keeps legacy subscribers consistent without a second manual array copy path.

## Inventory (verified grep, 2026-04-11)

| Area                                                                  | Role                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `channelMessageAuthority.ts`                                          | Bind ref; ensure bucket; replace/prepend history; sync; client cap |
| `echoRealtimeMessageStoreBridge.ts`                                   | Realtime append/remove optimistic path → index + sync              |
| `echoHistoryOrchestration.ts`                                         | History load / prefetch → index + sync                             |
| `echoRealtimeChatIngest.ts`                                           | Passes sinks for patches/ack → must use authority sync             |
| `socketRemoteMessagePatchApply.ts`                                    | Index mutation then materialize via sink                           |
| `socketMessageAckApply.ts`                                            | Ack merge via sink                                                 |
| `frontend/src/services/orchestration/echoWorkspaceChannelPrefetch.ts` | `replaceChannelMessagesFromHistory`                                |
