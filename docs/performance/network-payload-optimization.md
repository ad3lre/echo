# Network payload optimization

Status: **partially shipped** (2026-07). See [perf-baseline.md](../operations/perf-baseline.md) for production timing harness.

## Measurement

Synthetic benchmarks live in [`shared/networkPayloadEstimate.test.ts`](../../shared/networkPayloadEstimate.test.ts). Run:

```bash
npm run test -w frontend -- shared/networkPayloadEstimate.test.ts shared/messageReactionsWire.test.ts
```

Typical results (2k-member guild, 500-reactor message):

| Payload                                   | Before                   | After                       | Savings                |
| ----------------------------------------- | ------------------------ | --------------------------- | ---------------------- |
| Workspace members (`memberDetail=roster`) | ~full profile rows       | omits bio + banner fields   | ~25–40% of member JSON |
| `message:reactions` fan-out               | includes all `userIds[]` | counts only (`userIds: []`) | >90% on hot messages   |

## Shipped (v1-compatible)

### 1. Workspace roster projection

- **API:** `GET /api/v1/echo/workspace?memberDetail=roster|full` (default `full` for backward compatibility).
- **Client:** requests `memberDetail=roster` on bootstrap ([`frontend/src/api/echo/workspace.ts`](../../frontend/src/api/echo/workspace.ts)).
- **Omitted in roster mode:** `bio`, `bannerImage`, `bannerColor`, banner tuning flags.

### 2. Reaction fan-out slimming

- **Socket:** `message:reactions` broadcasts count-only rows ([`shared/messageReactionsWire.ts`](../../shared/messageReactionsWire.ts)).
- **REST:** `GET /channels/:channelId/messages/:messageId/reactions` returns full aggregates for voters UI.
- **Client merge:** preserves viewer highlight when `userIds` omitted ([`socketRemoteMessagePatchApply.ts`](../../frontend/src/services/realtime/socketRemoteMessagePatchApply.ts)).
- **Voters modal:** fetches full list on open ([`MessageReactionsVotersModal.vue`](../../frontend/src/features/chat/components/MessageReactionsVotersModal.vue)).

Contract v1 shape is preserved: `MessageReaction.userIds` remains present (empty array when omitted on wire).

### 3. Profile detail lazy-fetch (roster follow-up)

- **API:** `GET /users/:userId/profile` now includes `bio`, banner fields, and `timeZone` ([`userTypingProfile.ts`](../../backend/src/domain/echoStore/userTypingProfile.ts)).
- **Client:** guild member popout/modal fetches on open when roster rows lack bio/banner ([`guildMemberProfileDetailHydration.ts`](../../frontend/src/features/layout/composables/guildMemberProfileDetailHydration.ts), [`useAppLayoutProfiles.ts`](../../frontend/src/features/layout/composables/useAppLayoutProfiles.ts)).
- **Merge:** [`mergeEchoUserProfileDetailIntoWorkspace.ts`](../../frontend/src/features/dm/mergeEchoUserProfileDetailIntoWorkspace.ts) patches `users[]` after fetch.

## Planned (not yet implemented)

### Slim `message` socket create payload

Today server → client `message` events carry the full [`Message`](../../shared/types/message.ts) object including `contentJson`, attachments metadata, poll definition, etc.

**Proposed wire type (`MessageListRow`):**

```typescript
type MessageListRow = Pick<
  Message,
  | 'id'
  | 'channelId'
  | 'authorId'
  | 'content'
  | 'contentText'
  | 'timestamp'
  | 'replyTo'
  | 'messageFormatVersion'
  | 'imageUrl'
  | 'gif'
  | 'imageSpoiler'
  | 'messageFlags'
> & {
  hasContentJson?: boolean;
  attachmentCount?: number;
  hasPoll?: boolean;
};
```

Clients already in the channel fetch history via REST for rich bodies; list rendering uses `contentText` + flags. Fan-out slim rows would align socket creates with what the message list actually paints, deferring TipTap JSON to scroll-in or click-to-expand fetch (`GET /messages/:id`).

Requires contract v2 or optional dual emit during migration.

### Lazy member roster (Fluxer-style)

Paginated or range-subscribed member sidebar instead of monolithic `membersByServer`. See [FLUXER_VS_ECHO_REVIEW.md §3.3](../reviews/FLUXER_VS_ECHO_REVIEW.md).

### Payload-level compression

`perMessageDeflate` stays off for CDN reliability ([`backend/src/bootstrap/socket.ts`](../../backend/src/bootstrap/socket.ts)). Future: msgpack or zstd inside opaque binary Socket.IO packets for large events (workspace batches, history).

## Related limits

See audit tables in agent notes and [`ECHO_CONTRACT_V1.md`](../contracts/ECHO_CONTRACT_V1.md) (history page 100 max, 4k message text, 8 MiB REST body).
