/**
 * Message list — **scroll ownership authority** (single arbiter for all scroll writes).
 *
 * ## Why this exists
 *
 * For a long time the message list had ~8 independent code paths that wrote
 * `scrollTop` / called `scrollToIndex` (initial anchor, viewport restore, follow
 * new messages, layout-shrink compensation, tail-row growth, prepend restore,
 * jump-to-latest, go-to-message). Each was gated by its own ad-hoc flag. The
 * one-shot **initial anchor** was *unconditionally exempt* from user-scroll
 * protection, so on channel open it would override a scroll the user had already
 * started — the "channels correct my explicit scroll events" complaint.
 *
 * Patching one more `if` guard onto each writer never converged because the real
 * defect is the **absence of a single owner** that knows whether the user is in
 * control. This module is that owner. Every programmatic scroll write asks
 * {@link MessageListScrollOwnership.canCommit} before touching the DOM.
 *
 * ## Model
 *
 * Two orthogonal facts, tracked centrally:
 *
 * 1. **Active-scroll settle window** (`userActiveUntilMs`) — the user is mid-gesture
 *    or just finished. While inside it, *no* passive write may run (don't fight the
 *    wheel). Applies in every phase.
 * 2. **Initial-load ownership** (`userControlledInit`) — during the brief window
 *    between channel open and the first anchor settling, a genuine user gesture
 *    claims control. The one-shot initial anchor / viewport restore must then
 *    abort instead of yanking the user back.
 *
 * **Intent matters.** Writes carry a {@link ScrollIntent}. `'user-intent'`
 * (jump-to-latest button, go-to-message navigation, own-message send) is *always*
 * authorized — that is exactly what lets us block the passive anchor without
 * breaking own-send auto-scroll (the trap that reverted earlier attempts).
 *
 * ## Distinguishing our scrolls from the user's
 *
 * The DOM `scroll` event cannot tell you who caused it, and our own programmatic
 * writes emit `scroll` events too. So:
 * - Real gestures (`wheel`, `touchstart`, navigation keys) call {@link markUserGesture}.
 * - Programmatic writes bracket themselves with {@link beginProgrammaticWrite};
 *   `scroll` events inside that window are recognized as ours and ignored.
 * - Raw `scroll` events during the init phase (e.g. from the virtualizer's
 *   `initialOffset` / first layout) are ignored — they are not user intent.
 *
 * All time is injected (`now`) so the logic is deterministic and unit-testable
 * with zero DOM.
 */

/** What kind of scroll write is being attempted. */
export type ScrollIntent =
  /** One-shot anchor on first history paint (top/bottom/restore). Passive. */
  | 'initial-anchor'
  /** Restore the saved viewport when reopening a channel. Passive. */
  | 'viewport-restore'
  /** Keep pinned to newest as messages arrive. Passive. */
  | 'follow-tail'
  /** Direct user action: jump-to-latest, go-to-message, own-message send. Always allowed. */
  | 'user-intent';

export interface MessageListScrollOwnershipOptions {
  /** Monotonic clock in ms (`performance.now()` in the app, fake in tests). */
  now: () => number;
  /**
   * How long after the last user gesture passive writes stay blocked.
   * Mirrors the historical `USER_SCROLL_SETTLE_MS`.
   */
  userScrollSettleMs?: number;
  /**
   * Window after a programmatic write during which incoming `scroll` events are
   * treated as ours (not user gestures). Must comfortably cover a `nextTick` +
   * `requestAnimationFrame` + event dispatch.
   */
  programmaticSettleMs?: number;
}

export type ScrollEventClassification =
  /** Recognized as the echo of our own programmatic write. */
  | 'programmatic'
  /** Ignored: raw scroll during init phase (layout / initialOffset noise). */
  | 'ignored-init'
  /** Treated as a user-driven scroll (e.g. scrollbar drag); refreshes the settle grace period. */
  | 'user';

const DEFAULT_USER_SCROLL_SETTLE_MS = 180;
const DEFAULT_PROGRAMMATIC_SETTLE_MS = 150;

export interface MessageListScrollOwnership {
  /** Reset for a new channel: clears all ownership and returns to the init phase. */
  reset(): void;
  /** A genuine user gesture (wheel / touch / nav key). Claims control. */
  markUserGesture(): void;
  /** A raw DOM `scroll` event fired; classify it (our write vs user vs init noise). */
  noteScrollEvent(): ScrollEventClassification;
  /** Bracket a programmatic scroll write so its resulting `scroll` events are ignored. */
  beginProgrammaticWrite(): void;
  /** The one-shot initial anchor finished; subsequent passive writes use follow logic. */
  markInitialAnchorSettled(): void;
  /**
   * May a write with this intent touch the scroll position right now?
   * `'user-intent'` is always true; passive intents respect the settle window and
   * (during init) initial-load ownership.
   */
  canCommit(intent: ScrollIntent): boolean;
  /**
   * May a corrective DOM bottom-snap run? Snaps only during the one-shot initial
   * anchor (or explicit user actions) — never as post-load layout repair.
   */
  canSnapScrollBottom(intent: ScrollIntent): boolean;
  /** True while the user is actively scrolling or within the settle grace period. */
  isUserActive(): boolean;
  /** True once the first anchor has settled (i.e. past the init phase). */
  isInitialAnchorSettled(): boolean;
  /** True when a genuine user gesture claimed control before the first anchor settled. */
  hasUserClaimedInitialLoad(): boolean;
  /** Current internal state — for diagnostics / structured logging only. */
  snapshot(): {
    initialAnchorSettled: boolean;
    userControlledInit: boolean;
    userActive: boolean;
  };
}

export function createMessageListScrollOwnership(
  options: MessageListScrollOwnershipOptions,
): MessageListScrollOwnership {
  const now = options.now;
  const settleMs = options.userScrollSettleMs ?? DEFAULT_USER_SCROLL_SETTLE_MS;
  const programmaticMs =
    options.programmaticSettleMs ?? DEFAULT_PROGRAMMATIC_SETTLE_MS;

  let userActiveUntilMs = 0;
  let programmaticUntilMs = 0;
  let initialAnchorSettled = false;
  let userControlledInit = false;

  function isUserActive(): boolean {
    return now() < userActiveUntilMs;
  }

  function markUserGesture(): void {
    userActiveUntilMs = now() + settleMs;
    // A real gesture before the first anchor settles means the user is driving
    // initial load: the passive anchor / restore must not override them.
    if (!initialAnchorSettled) userControlledInit = true;
  }

  return {
    reset(): void {
      userActiveUntilMs = 0;
      programmaticUntilMs = 0;
      initialAnchorSettled = false;
      userControlledInit = false;
    },

    markUserGesture,

    noteScrollEvent(): ScrollEventClassification {
      if (now() < programmaticUntilMs) return 'programmatic';
      // During init, raw scroll events are layout/initialOffset echoes, not intent.
      // Genuine control during init is claimed only via markUserGesture().
      if (!initialAnchorSettled) return 'ignored-init';
      userActiveUntilMs = now() + settleMs;
      return 'user';
    },

    beginProgrammaticWrite(): void {
      programmaticUntilMs = now() + programmaticMs;
    },

    markInitialAnchorSettled(): void {
      initialAnchorSettled = true;
    },

    canCommit(intent: ScrollIntent): boolean {
      if (intent === 'user-intent') return true;
      // Never fight an in-flight / just-finished user scroll.
      if (now() < userActiveUntilMs) return false;
      // The one-shot anchor / restore must yield if the user grabbed control
      // before it ran.
      if (
        (intent === 'initial-anchor' || intent === 'viewport-restore') &&
        userControlledInit
      ) {
        return false;
      }
      return true;
    },

    canSnapScrollBottom(intent: ScrollIntent): boolean {
      if (!this.canCommit(intent)) return false;
      if (intent === 'user-intent') return true;
      return !initialAnchorSettled;
    },

    isUserActive,
    isInitialAnchorSettled: () => initialAnchorSettled,
    hasUserClaimedInitialLoad: () => userControlledInit,

    snapshot() {
      return {
        initialAnchorSettled,
        userControlledInit,
        userActive: isUserActive(),
      };
    },
  };
}
