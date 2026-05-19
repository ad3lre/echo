# Channel Message Prepend Transaction

`MessageList.vue` now treats older-history pagination as an explicit prepend
transaction instead of a best-effort `scrollToIndex()` repair. The visual anchor
is the latest visible message in the viewport, so older history extends upward
from a stable bottom-side reference.

## Contract

1. Anchor restore is based on `messageId + pixel offset`, not list index.
   The chosen anchor is the latest visible message row, with a fallback to the
   latest message id in the loaded list.
2. At most one prepend transaction owns scroll correction at a time.
3. A prepend transaction may perform at most two anchor corrections:
   one after `nextTick`, one optional `requestAnimationFrame` follow-up if
   drift remains above `2px`.
4. Automatic scroll helpers do not apply their own corrections while a
   prepend transaction is active.
5. Older-message merge remains one visible commit per loaded page.
6. Reverse scrolling must leave the near-top trigger zone before another
   prepend can start.

## Flow

1. Capture a prepend snapshot from the current viewport:
   `anchorMessageId`, `anchorTopBefore`, `scrollTopBefore`, `scrollHeightBefore`.
2. Fetch and merge the older page once through history authority.
3. After DOM flush, measure the same anchor row again and apply:
   `container.scrollTop += anchorTopAfter - anchorTopBefore`.
4. Run one bounded stabilization pass on the next animation frame if drift is
   still above `2px`.
5. Clear transaction ownership and update jump UI once.

## QA

- Scroll upward until pagination runs repeatedly: the top visible message should
  no longer drag the viewport downward; the latest visible message should stay
  visually locked while history grows above it.
- Fast repeated upward scroll should not trigger extra jump UI churn while the
  transaction is active.
- Scroll down immediately after an upward pagination pass: it should not
  instantly retrigger another older-history load until the viewport has left
  the near-top zone.
- Returning to nearby retained history should feel continuous, not like the list
  re-anchored to an estimate.
