# Message list: staged rewrite toward "zero post-load scroll authority"

> **Status:** in progress. Stages 1–2 landed; Stages 3–4 pending. This is the **living
> handoff doc** — update the stage checkboxes and "What's done in code" anchors as work lands so
> anyone can continue mid-stream.
>
> Related (older, partly stale) analysis: [`message-list-scroll-plan.md`](./message-list-scroll-plan.md)
> — keep that for the reactive-cost framing, but this doc supersedes it for the authority model
> and current code state. Prepend mechanics: [`../operations/channel-message-prepend-transaction.md`](../operations/channel-message-prepend-transaction.md).
> Hard rules: `frontend/src/features/chat/domain/viewportContract.ts`.

## Context / why

The chat list (`frontend/src/components/chat/MessageList.vue`, ~2.8k lines) renders virtual rows
as `position:absolute` + `translateY(...)`. That layout **defeats the browser's native scroll
anchoring**, which is the root reason an elaborate JS scroll system exists: an 8-intent ownership
arbiter (`messageListScrollOwnership`), prepend snap-math (`restorePrependScroll`), viewport-anchor
restore (`restoreViewportAnchorInContainer`), `commitScrollToLatest`, a ResizeObserver re-pin, and
a tail-growth snap. Many "authorities" race to decide where `scrollTop` should be.

Three reported symptoms:

1. **Scroll-up flash** — scrolling up shows the empty background for ~½s before pfps/messages
   paint. Cause: row estimates smaller/looser than real rows, plus
   `shouldAdjustScrollPositionOnItemSizeChange: () => false` meaning above-viewport re-measures
   shift content with no compensation.
2. **Skeleton → messages not smooth** — hard `v-if/v-else` swap; skeleton was top-down while the
   real list bottom-anchors → skeleton-at-top → blank → messages-at-bottom.
3. **Too many scroll authorities** — the goal model: the _only_ thing that sets position is the
   **initial load state** (latest, or a remembered spot folded into first paint — **not** a visible
   post-mount scroll). After that, **no passive scroll writes**; layout keeps the bottom pinned.
   Explicit user actions stay, but **isolated and labeled** as `user-intent`.

Target: Discord-grade feel — content stays put on scroll-up, skeleton dissolves into messages, and
there is exactly one passive concept (initial position) plus a small explicit set of user-intent
scrolls.

## Decisions (from product owner)

- **Staged → rewrite.** Ship safe wins first (Stages 1–3 within the current virtualizer), then the
  native-anchoring rewrite (Stage 4).
- **Keep** explicit user scrolls, but isolate them as `user-intent`: jump-to-latest button,
  scroll-to-my-sent-message, reply/go-to-message jump.
- **Remembered position is NOT a scroll.** Fold it into initial-load state via the virtualizer's
  `initialOffset` (already reads `readMessageListViewport`). Delete the post-mount
  `restoreViewportMemoryForChannel` scroll path.

## Verified facts

- `@tanstack/virtual-core@3.15.0` (resolved at repo-root `node_modules`) exposes
  `shouldAdjustScrollPositionOnItemSizeChange: (item: VirtualItem, delta: number, instance) => boolean`.
  `instance.scrollOffset: number | null`; `VirtualItem.start: number`. Returning
  `item.start < (instance.scrollOffset ?? 0)` compensates **only** above-viewport size changes.
- `virtualizerOptions.initialOffset` (MessageList.vue, in the `useVirtualizer` computed) already
  reads `readMessageListViewport(cid)` — the hook for "remembered position as initial state."
- DEV log `row_height_est_mismatch` (in `measureRowRef`) reports measured-vs-estimate deltas ≥24px —
  use it on a busy channel to calibrate estimates.

---

## Stage 1 — Kill the scroll-up flash ✅ DONE (manual verify pending)

**What's done in code:**

- `MessageList.vue`, `virtualizerOptions` computed: `shouldAdjustScrollPositionOnItemSizeChange`
  now returns `item.start < (instance.scrollOffset ?? 0)` — above-viewport re-measures keep the
  row under the user's eyes fixed; rows at/below offset are never compensated (no tail yank).
- `frontend/src/features/chat/domain/messageListRowEstimate.ts`: replaced the line+length
  double-add (over-guessed short headers ~114px vs ~80px real) with a line-box model
  (`HEADER_CHROME 50 + lines×22`, `GROUPED_CHROME 6 + lines×22`, soft-wrap @ ~80 chars,
  cap 12 lines). `messageListRowEstimate.test.ts` still green.

**Deliberately skipped:** `content-visibility:auto` / `contain-intrinsic-size`. On these rows an
off-screen element reports its `contain-intrinsic-size` placeholder, which TanStack's
`measureElement` would read back as the real height, corrupting measurement. Compensation is the
real fix and is robust to estimate error.

**Exit check (manual):** fast scroll-up on a long channel → no background gap; `prepend_restore`
drift logs shrink.

## Stage 2 — Smooth skeleton → message crossfade ✅ DONE (manual verify pending)

**What's done in code (`MessageList.vue` template + scoped style):**

- Skeleton pulled out of the scroll flow into an `absolute inset-0` overlay: `pointer-events-none`,
  `flex flex-col justify-end`, `overflow-hidden`, `paddingTop = scrollContainerPaddingTopPx`,
  `paddingBottom: 16px`. Pinned to the bottom so its last bar lands where the newest message will.
  Removed from the `v-if/v-else` chain (chain head is now `v-if="showNoServersYet"`).
- Wrapped in `<Transition name="msg-skeleton-fade">`; the list mounts underneath while loading and
  `initialOffset` paints the first page already bottom-anchored, so the 220ms opacity fade
  dissolves bars into real messages. Reduced-motion disables the transition.

**Exit check (manual):** switching into a fresh channel dissolves skeleton bars into real messages
in place — no blank frame, no upward jump.

## Stage 3 — Collapse the passive authorities ✅ DONE (manual verify pending)

**What's done in code:**

- ✅ **Initial position is now invisible (load state, not a scroll).** New computed
  `showInitialLoadOverlay` (MessageList.vue) holds the Stage-2 loading overlay until the initial
  anchor settles (`suppressListUntilInitialAnchor`), not just while empty. The first bottom-anchor
  commit AND any remembered-position restore now happen **behind** the overlay, then it cross-fades
  to messages already in place. The list still renders/measures underneath. The FAB's
  `list-ui-blocked` also uses `showInitialLoadOverlay`.
- ✅ **Removed the `layout-compensation` authority.** Deleted `attachScrollViewportResizeObserver`,
  `disconnectScrollViewportResizeObserver`, `shouldFollowViewportShrink`, the observer fields, and
  the `scrollToBottom(false, 'layout-compensation')` call + the two lifecycle hooks. Dropped
  `'layout-compensation'` from `ScrollIntent` and from `messageListScrollOwnership.ts` `canCommit`;
  updated `messageListScrollOwnership.test.ts`. Safe: post-init it was already a no-op (ownership
  blocked it); pre-init the overlay covers.
- ✅ **Labeled the 3 surviving user-intent scrolls**: `jumpToLatestMessages`,
  the own-message-send branch of the new-message watcher, and `scrollMessageIntoView`.
- ✅ Removed the dead `isScrollNearBottom` import.

**Deliberate deviation from the original plan:** kept `restoreViewportMemoryForChannel` and the
`viewport-restore` intent instead of deleting them. Deleting would break restoring saved positions
whose anchor is **not in the latest first page** (`initialOffset` can only place anchors already in
the window; out-of-window anchors need the restore's `ensureMessageInWindow` prefetch). Making the
restore **invisible** (above) satisfies the real goal ("remembered position is not a visible
scroll"). Full deletion is deferred to Stage 4, where loading the window _around_ a saved anchor +
native anchoring can replace the prefetch-and-restore dance.

**Exit check (manual):** reopen a channel scrolled to mid-history → opens there with the loading
overlay dissolving to the restored position, no visible post-mount scroll. ✅ 182 chat tests pass.

## Stage 3 follow-up — warm channel switches must not flash a skeleton ✅ DONE

**Symptom:** switching between two _already-visited_ channels showed ~1s of "nothing" (Discord
swaps them like two static images). Root cause was a regression in the Stage 3 overlay: it held
the skeleton overlay until the initial anchor settled, gated only on `suppressListUntilInitialAnchor`
— which is set on _every_ channel switch (main chat is always bottom-anchored). So a warm channel
(cached content already present, no refetch) got the skeleton drawn over its content during the
settle.

Confirmed it is **not** a refetch: `messageWindowAuthority` retains per-channel buckets across
switches (removal only on session replace/logout or explicit channel delete), and `loadHistory`
has a synchronous cache-hit seed path, so a revisited channel's window is populated immediately by
`setActiveChannel` (orchestration watcher uses `flush: 'sync'`).

**Fix (`MessageList.vue`):** added `coldLoadInProgress`, set once per switch in the channel-change
watcher as `!!cid && isEmpty.value` (the window is already updated synchronously at that point, so
`isEmpty` distinguishes cold vs warm). `showInitialLoadOverlay` extends through the settle only when
`coldLoadInProgress` is true. Warm switches keep it false → cached content swaps in instantly;
remembered position comes from `initialOffset` (anchor is in the cached window), post-mount restore
correcting precisely. Cold opens keep the Stage 2 crossfade.

## Stage 3 follow-up — late image loads must keep the bottom pinned ✅ DONE

**Symptom:** on initial load (anchored to the bottom), an image that decodes late grows its row,
pushing the newest messages below the fold — so ~2s after open you are no longer at the bottom.

**Root cause:** images render with reserved space only when the payload has `width`/`height`
(`mediaAspectStyle` → `MessageChatStillImage` `shellStyle` with `aspect-ratio` + `width:100%`).
Without dimensions (legacy `imageUrl`, attachments the server didn't size) the `<img>` is
`width:auto;height:auto` → 0×0 until load, then snaps to full height. Stage 1's compensation only
covered _above-viewport_ growth, so growth in the visible bottom rows drifted us off the bottom.

**Fix (`MessageList.vue`, `shouldAdjustScrollPositionOnItemSizeChange`):** added a second
compensation case — when following the tail and the user is not actively
scrolling (`followNewMessagesToBottom && !isUserActive()`),
compensate row growth so it pushes earlier content UP and keeps the bottom pinned ("push up
instead"). Verified against `virtual-core` `resizeItem`: returning true does `scrollAdjustments +=
delta`, fixing the grown row + everything below and shifting earlier content up. Gated on
`!isUserActive()` so it never fights an in-progress scroll (the Stage 1 scroll-up feel is
unchanged, since an upward gesture sets the user active).

Note (optional polish, not done): reserve a skeleton box for _unknown-dimension_ images, or cache
natural dimensions on first load so re-mounts reserve space. The bottom-pin already absorbs the
scroll impact; this would only remove the cosmetic 0→full "pop" during the first decode.

## Stage 4 — Native bottom-pin + scroll anchoring (rewrite) ☐ TODO

- Move virtual rows off `absolute/translateY` to in-flow rows with top/bottom spacers (so
  `overflow-anchor:auto` works), OR a bottom-pinned flex column (`margin-block-start:auto`).
- Enable `overflow-anchor:auto` → prepend growth and async image/GIF height changes absorbed
  natively, zero JS.
- Retire `restorePrependScroll` + anchor-snap (`messageListPrependAnchor.ts`),
  `restoreViewportAnchorInContainer` (`messageListViewportRestore.ts`), and most of
  `messageListScrollOwnership.ts` — keep only the isolated user-intent helpers.
- Update the laws in `viewportContract.ts` (Law 2 "prepend anchor", Law 4 "scroll handlers").

**Exit check:** prepend, image load, and new-message arrival are visually stable with the scroll
math deleted; tests green; contract reflects reality.

---

## Critical files

| File                                                                                            | Stages  |
| ----------------------------------------------------------------------------------------------- | ------- |
| `frontend/src/components/chat/MessageList.vue`                                                  | 1,2,3,4 |
| `frontend/src/features/chat/domain/messageListRowEstimate.ts` (+ `.test.ts`)                    | 1 ✅    |
| `frontend/src/features/chat/domain/messageListScrollOwnership.ts` (+ `.test.ts`)                | 3,4     |
| `frontend/src/features/chat/composables/messageListViewportStorage.ts` (read for initialOffset) | 3       |
| `frontend/src/features/chat/domain/messageListPrependAnchor.ts` (+ `.test.ts`)                  | 4       |
| `frontend/src/features/chat/domain/messageListViewportRestore.ts` (+ `.test.ts`)                | 4       |
| `frontend/src/features/chat/domain/viewportContract.ts`                                         | 4       |

## Verification (run per stage)

- **Unit/runtime:** `cd frontend && npx vitest run src/components/chat src/features/chat`
  (focused: `messageListRowEstimate.test.ts`, `messageListScrollOwnership.test.ts`,
  `messageListPrependAnchor.test.ts`, `MessageList.runtime.test.ts`).
- **Lint/types:** `cd frontend && npx eslint <changed files>` and
  `npx vue-tsc --noEmit -p tsconfig.json`.
- **Manual (the real test):** run the app, open a high-traffic channel and:
  1. Scroll up fast → no background flash, content stays under the cursor (Stage 1).
  2. Switch to a fresh channel → skeleton dissolves into messages, no blank/jump (Stage 2).
  3. Reopen a channel scrolled to mid-history → opens exactly there, no visible scroll animation
     (Stage 3).
  4. While scrolled up, receive a new message and load older → neither moves your viewport; at the
     bottom, newest stays visible (Stages 3–4).
- Enable MessageList debug logging to watch `prepend_restore` drift and `row_height_est_mismatch`
  shrink toward zero.

## Risks / notes

- Governed by `viewportContract.ts` laws; dense unit + one runtime test. Keep the contract in sync
  (esp. Stage 4).
- Compensation must stay **above-viewport only** — compensating below-viewport reintroduces the
  tail-growth yank earlier work removed.
- Stage 4's layout change is the highest-risk step; do it only after 1–3 are verified in-hand.

## Revision log

| Date       | Change                                                                                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-07 | Created. Stages 1–2 implemented (compensation + estimate calibration; skeleton crossfade). Stages 3–4 pending.                                                                                                              |
| 2026-06-07 | Stage 3 done: invisible initial positioning via `showInitialLoadOverlay`; removed `layout-compensation` authority + intent; labeled user-intent scrolls; kept restore (made invisible) per deviation note. Stage 4 pending. |
