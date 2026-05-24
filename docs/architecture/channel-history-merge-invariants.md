# Channel history merge invariants (Discord-shaped client)

Complements [adr-client-message-authority.md](./adr-client-message-authority.md).

## Goal

One channel timeline per client: **merge by message id**, never let a slower or older HTTP page overwrite newer rows already in the index (socket, tail sync, or a fresher fetch).

## Rules

1. **Canonical store** — `ChannelMessageIndex` per channel; `messages[channelId]` is materialized via `syncChannelMessages` only.
2. **Replace only when empty** — `replaceChannelMessagesFromHistory` full-replaces only if the index has zero rows; otherwise `mergeMissingChannelMessagesFromHistory` (append unknown ids).
3. **No bucket → index clobber** — `getChannelIndex(channelId)` must not pass a stale `messages[channelId]` array into a populated index (hydrate empty index only).
4. **Bootstrap prefetch** — `applyPrefetchedWorkspaceChannelMessages`: empty bucket → first page; non-empty → append missing ids only.
5. **Channel switch cache hit** — `applyEchoHistorySeedFromCachedMessages` refreshes the active window + cap; does not replace history. Tail sync (`syncActiveChannelTailFromApi`) fills gaps from the API.
6. **Realtime** — insert / update / remove by id (`appendChannelMessage`, patch sinks); no full-channel replace.
7. **Session reset** — `clearWorkspaceMessagesRecord` / `replaceWorkspaceMessagesSnapshot` are the only intentional full resets.

## Writers (audit list)

| Path                                        | Merge mode                           |
| ------------------------------------------- | ------------------------------------ |
| `echoHistoryOrchestration` initial API page | replace if empty, else merge missing |
| `echoHistoryOrchestration` cache hit        | no replace; tail sync                |
| `echoWorkspaceChannelPrefetch`              | replace if empty, else merge missing |
| `echoRealtimeMessageStoreBridge`            | insert                               |
| `socketRemoteMessagePatchApply`             | update by id                         |
| Scroll `loadOlder`                          | prepend missing                      |

## Not covered here

Discord bridge backfill and DB gaps are server/bridge concerns; these rules stop **per-client** divergence when the server already has the rows.
