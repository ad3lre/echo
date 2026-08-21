# Chat permissions architecture (frontend)

**Production (2026-03):** Shipped SPAs always run **real Echo mode** (mock UI disabled at build time). The patterns below apply to **all** production users; local dev may still hit mock branches elsewhere in the shell.

This document explains how **server role preview** and **channel-level send rules** are applied in the UI and in `sendMessage`, and where to change behavior safely.

## Mental model

1. **No parallel boolean permission APIs**  
   Use **`getSendState({ channelId, contentTypes, context? })`** (returns `{ allowed, blockReason }`) or **`assertCanSend`** for UI and submit paths. The low-level gate **`getOutgoingBlockReason`** remains for custom integration. **Do not** reintroduce exported `canSendMessages`-style refs — they invite “half enforcement”.

2. **Layout does not thread permission props**  
   `AppLayoutChatSurface`, server/voice/DM sections, and `ChatView` do **not** pass permission booleans down the tree. Components call **`useChatPermissions()`**, provided from `AppLayout` (or a permissive subtree).

3. **Shell chat sends go through `executeShellSend`**  
   [`clients/web/src/features/chat/sendIntent.ts`](../../../clients/web/src/features/chat/sendIntent.ts) is the only path from the main shell to the socket **`sendMessage`** after gating. New features (quick reply, retries, commands) should build a **`SendIntent`** and call **`executeShellSend`**, not call the socket helper directly.

4. **Never infer `channelId` from incidental UI state in permission logic**  
   Pass the **target channel for the operation** (the id you will send on). Do not use “which panel is focused” or “which tab is visible” as a stand-in — that is where split-view and notification-reply bugs appear.

5. **Permissions vs routing**  
   Today the main shell’s routed channel matches the composer target. Voice side chat still aligns with that routed id. If you add split view, pop-out chats, drafts for another channel, or reply-from-notification, you must pass an explicit **`channelId`** into `getOutgoingBlockReason` and resolve permissions for **that** channel’s context—not assume it equals `activeChannel`.

## Key files

| Piece                                                                               | Location                                                                                                                                            |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure math: channel overrides, preview UI bits, **single outgoing block string**     | [`clients/web/src/features/chat/domain/chatRolePreviewPermissions.ts`](../../../clients/web/src/features/chat/domain/chatRolePreviewPermissions.ts) |
| Provided API: **`getSendState`**, **`assertCanSend`**, **`getOutgoingBlockReason`** | [`clients/web/src/features/chat/useChatPermissions.ts`](../../../clients/web/src/features/chat/useChatPermissions.ts)                               |
| Shell send choke point: **`executeShellSend`**, **`SendIntent`**                    | [`clients/web/src/features/chat/sendIntent.ts`](../../../clients/web/src/features/chat/sendIntent.ts)                                               |
| Main surface for branching: **`provideMainSurface` / `useMainSurface`**             | [`clients/web/src/features/layout/useMainSurface.ts`](../../../clients/web/src/features/layout/useMainSurface.ts)                                   |
| `provideChatPermissions(createChatPermissions(…))`                                  | [`clients/web/src/features/layout/components/AppLayout.vue`](../../../clients/web/src/features/layout/components/AppLayout.vue)                     |
| Composer: strict consumer, no permission props from `ChatView`                      | [`clients/web/src/features/chat/components/ChatInput.vue`](../../../clients/web/src/features/chat/components/ChatInput.vue)                         |
| Explicit permissive subtree (required in **dev** if you mount `ChatInput` here)     | [`clients/web/src/features/dm/components/MessageRequestsView.vue`](../../../clients/web/src/features/dm/components/MessageRequestsView.vue)         |

## Domain layer (`chatRolePreviewPermissions.ts`)

- **`resolvePreviewChannelPermission`** — Given preview state, selected server id, channel, category defaults, and a preview permission key, returns whether that capability is allowed (category sync, channel overrides, etc.).
- **`findChannelContextById`** — Resolves a channel inside the **raw** server category tree (unfiltered). Used so permission context matches real channel data even when the sidebar filters channels under preview.
- **`rolePreviewOutgoingBlockReason`** — **The only place** that turns preview + channel booleans + attempt flags into a **user-facing block message** or `null`.  
  Internal attempt flags: **`includesPoll`**, **`includesMedia`** (normalized from **`OutgoingContentType[]`** in the composable).  
  Precedence matches historical behavior (e.g. base “cannot send messages” when the send targets the active channel and channel send is denied, before poll/media-specific messages).

Keep new rules here first; keep Vue/Pinia files thin.

## Composable (`useChatPermissions.ts`)

### Attempt shape: `contentTypes`

Public API:

```ts
getOutgoingBlockReason({
  channelId: string;
  contentTypes?: OutgoingContentType[]; // default ['text']
});
```

`OutgoingContentType` is currently **`'text' | 'media' | 'poll'`**. Omitted or empty **`contentTypes`** defaults to **`['text']`**.

- **`text`** — participates in the base send gate (no extra poll/media flags from the attempt).
- **`poll`** — sets the poll branch when combined with preview rules.
- **`media`** — sets the media branch.

Examples:

- Text-only composer: `['text']`.
- Submit with attachments: `['text', 'media']` (or `['media']` when the payload is media-only; align with product).
- `sendMessage` with poll + files: `['text', 'poll', 'media']` as appropriate.

When you add stickers, voice clips, etc., extend **`OutgoingContentType`**, map new types to flags in **`attemptFlags`**, and add branches to **`rolePreviewOutgoingBlockReason`** in order.

### `createChatPermissions(deps)`

Built in `AppLayout` with refs/computed for:

- `activeChannelId`, `activeChannel`
- `rawCategories` (per server)
- `rolePreview`, `selectedServerId`, `isRolePreviewActiveForServer`
- `isInDMMode`, `isGroupDM`

Internal channel booleans (**authoritative for math**): **`channelSendAllowed`**, **`channelPollAllowed`**, **`channelUploadAllowed`**.  
**`getOutgoingBlockReason`** uses only those + attempt flags.

### `provideChatPermissions` / `useChatPermissions`

- **`AppLayout`** calls **`provideChatPermissions(chatPermissions)`** after creating the API.
- Descendants call **`useChatPermissions()`**.

**Development (`import.meta.env.DEV`):** if nothing was provided, **`useChatPermissions()` throws** with a clear message. Silent permissive behavior was removed in dev to avoid security/logic bypass without a signal.

**Production:** if the injector finds no provider, it falls back to a **permissive** singleton (same as **`createPermissiveChatPermissions()`**). Prefer not relying on this: mount trees that use **`ChatInput`** should call **`provideChatPermissions`** explicitly.

**Subtrees** that must ignore main-shell preview (e.g. message requests) must call **`provideChatPermissions(createPermissiveChatPermissions())`** so **dev** still has a provider and **`ChatInput`** works.

## `AppLayout` / `sendMessage`

`sendMessage` should only enforce preview by building **`contentTypes`** and calling the gate once:

```ts
const contentTypes: OutgoingContentType[] = ['text'];
if (poll) contentTypes.push('poll');
if (imageUrl || videoUrl || gif) contentTypes.push('media');
executeShellSend(buildSendIntent(channelId, payload, contentTypes), {
  getBlockReason: (id, types) =>
    chatPermissions.getOutgoingBlockReason({
      channelId: id,
      contentTypes: types,
    }),
  socketSend: socketSendMessage,
});
```

Shell code uses **`getOutgoingBlockReasonForShellAttempt`** so **`MainSurface`** and **`nav`** are checked in dev. **Do not** call **`socketSendMessage`** for chat payloads outside this path.

Other preview checks in `AppLayout` (e.g. voice connect, channel list filtering) still use **`resolvePreviewChannelPermission`** wrappers where appropriate; those are **not** “outgoing message” rules.

## `ChatInput`

- **`ChatInput` is mission-critical for the model**: it assumes a correct provider above it (or an explicit permissive provide in special views).
- Imports **`useChatPermissions()`** only — **no** permission props from `ChatView`.
- Uses **`getSendState`** / **`assertCanSend`** with **`props.channelId`** and **`context: { source: 'composer' }`** (the send target — must stay consistent with what `sendMessage` will use).
- Composer disabled / attach / poll / file / paste / GIF / submit all use **`contentTypes`**-shaped attempts.

## `MessageRequestsView`

Replying here is **not** the main shell’s routed server channel. This view **must** call:

```ts
provideChatPermissions(createPermissiveChatPermissions());
```

so **`useChatPermissions()`** succeeds in **dev** and nested **`ChatInput`** does not inherit the wrong preview. If product later needs real rules, replace with a dedicated provider keyed to the request DM channel.

## Checklist for future changes

- [ ] New modality (e.g. stickers)? Extend **`OutgoingContentType`**, **`attemptFlags`**, **`rolePreviewOutgoingBlockReason`**, then **`sendMessage`** + **`ChatInput`** once.
- [ ] New mount of **`ChatInput`**? Ensure **`provideChatPermissions`** (real or permissive) wraps it — **dev will throw** otherwise.
- [ ] Split view / multi-channel? Pass explicit **`channelId`** per operation; never infer from UI chrome alone.

## Main column routing (`MainSurface`)

Shell navigation intent is folded into a single discriminated union, **`MainSurface`**, in [`clients/web/src/features/layout/mainSurface.ts`](../../../clients/web/src/features/layout/mainSurface.ts). **`deriveMainSurface`** must read **navigation refs and workspace context only** (rail, DM sub-view, `activeChannelId`, channel type lookup, empty-server onboarding). It must **not** read layout chrome (`isDMPanelOpen`, panel widths, member column collapsed, modal open flags). Voice and DM calls are additionally classified in **`CallOverlayState`** via [`clients/web/src/features/layout/callOverlay.ts`](../../../clients/web/src/features/layout/callOverlay.ts) so call chrome can stay a layer over the base surface. **`provideMainSurface`** / **`useMainSurface()`** expose that computed to descendants so new UI branches on **`mainSurface.type`** instead of raw rail refs where possible.

## Layers: surface, send target, permissions, action

Avoid cross-layer shortcuts (they reintroduce “UI says X, send uses Y” drift).

| Layer                  | Responsibility                                                  | Key API                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation / UI intent | What the main column is for                                     | **`deriveMainSurface`**, **`MainSurface`**                                                                                                                                                                      |
| Resolution             | Map surface (+ `NavState` where needed) → channel id to send on | **`resolveSendTarget`** in [`clients/web/src/features/layout/resolveSendTarget.ts`](../../../clients/web/src/features/layout/resolveSendTarget.ts)                                                              |
| Contract (dev)         | Surface and explicit `channelId` must agree                     | **`validateSendChannelForSurface`**, **`getOutgoingBlockReasonForShellAttempt`** in [`clients/web/src/features/layout/sendSurfaceContract.ts`](../../../clients/web/src/features/layout/sendSurfaceContract.ts) |
| Permissions            | May this payload go to **this** `channelId`?                    | **`getSendState`** / **`getOutgoingBlockReason`**                                                                                                                                                               |
| Action                 | Gated socket send                                               | **`executeShellSend`** → `useSocket` **`sendMessage`** (only from shell `sendMessage` in `AppLayout`)                                                                                                           |

**Dev:** **`collectShellInvariantIssues`** (see [`appShellInvariants.ts`](../../../clients/web/src/features/layout/appShellInvariants.ts)) runs from `AppLayout` to warn when `MainSurface`, `nav.activeChannelId`, and **`resolveSendTarget`** disagree.

**Lint (optional):** this repo may not yet scope ESLint to `features/layout`. When ESLint is available, consider `no-restricted-syntax` to discourage new `isInDMMode` / raw rail-tab checks in layout UI where **`mainSurface.type`** should be used instead.

## Related docs

- RBAC / mock vs real: [`docs/rbac/`](../rbac/)
- Product / UX posture: [`docs/reviews/STATUS_AND_PRODUCTION_READINESS.md`](../../reviews/STATUS_AND_PRODUCTION_READINESS.md)
