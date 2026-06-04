import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMessageListScrollOwnership,
  type MessageListScrollOwnership,
} from './messageListScrollOwnership';

describe('messageListScrollOwnership', () => {
  let clock: number;
  let own: MessageListScrollOwnership;

  const advance = (ms: number) => {
    clock += ms;
  };

  beforeEach(() => {
    clock = 1000;
    own = createMessageListScrollOwnership({
      now: () => clock,
      userScrollSettleMs: 180,
      programmaticSettleMs: 150,
    });
  });

  describe('fresh channel open (no user interaction)', () => {
    it('allows the initial anchor and viewport restore', () => {
      own.reset();
      expect(own.canCommit('initial-anchor')).toBe(true);
      expect(own.canCommit('viewport-restore')).toBe(true);
      expect(own.canCommit('follow-tail')).toBe(true);
    });

    it('ignores raw scroll events during init (layout / initialOffset noise)', () => {
      own.reset();
      // initialOffset / first layout emits scroll events before the anchor settles.
      expect(own.noteScrollEvent()).toBe('ignored-init');
      // Those must NOT block the upcoming one-shot anchor.
      expect(own.canCommit('initial-anchor')).toBe(true);
      expect(own.hasUserClaimedInitialLoad()).toBe(false);
    });
  });

  describe('user grabs control during initial load (the core fix)', () => {
    it('blocks the passive initial anchor after a real gesture', () => {
      own.reset();
      own.markUserGesture(); // user flicks the wheel while history streams in
      expect(own.hasUserClaimedInitialLoad()).toBe(true);
      expect(own.canCommit('initial-anchor')).toBe(false);
      expect(own.canCommit('viewport-restore')).toBe(false);
    });

    it('still allows explicit user-intent writes (own-send / jump) during init', () => {
      own.reset();
      own.markUserGesture();
      // own-message send and jump-to-latest must always win — this is what broke
      // earlier attempts that used a blunt "user scrolled" guard.
      expect(own.canCommit('user-intent')).toBe(true);
    });

    it('keeps the init claim sticky long past the settle window', () => {
      own.reset();
      own.markUserGesture();
      advance(5000); // anchor often fires hundreds of ms after history loads
      expect(own.isUserActive()).toBe(false); // settle window expired
      expect(own.canCommit('initial-anchor')).toBe(false); // but init claim holds
    });
  });

  describe('programmatic write guard', () => {
    it('classifies scroll events inside the programmatic window as ours', () => {
      own.reset();
      own.markInitialAnchorSettled();
      own.beginProgrammaticWrite();
      expect(own.noteScrollEvent()).toBe('programmatic');
      // our own scroll must not claim user control
      expect(own.canCommit('follow-tail')).toBe(true);
    });

    it('treats scroll events after the programmatic window as user-driven (settled phase)', () => {
      own.reset();
      own.markInitialAnchorSettled();
      own.beginProgrammaticWrite();
      advance(151);
      expect(own.noteScrollEvent()).toBe('user'); // e.g. scrollbar drag
      expect(own.isUserActive()).toBe(true);
      expect(own.canCommit('follow-tail')).toBe(false);
    });
  });

  describe('settled phase (steady state)', () => {
    beforeEach(() => {
      own.reset();
      own.markInitialAnchorSettled();
    });

    it('blocks passive writes during the active-scroll settle window', () => {
      own.markUserGesture();
      expect(own.canCommit('follow-tail')).toBe(false);
      expect(own.canCommit('layout-compensation')).toBe(false);
      advance(181);
      expect(own.canCommit('follow-tail')).toBe(true);
      expect(own.canCommit('layout-compensation')).toBe(false);
    });

    it('never allows layout compensation or DOM snaps after the initial anchor', () => {
      expect(own.canCommit('layout-compensation')).toBe(false);
      expect(own.canSnapScrollBottom('layout-compensation')).toBe(false);
      expect(own.canSnapScrollBottom('follow-tail')).toBe(false);
      expect(own.canSnapScrollBottom('user-intent')).toBe(true);
    });

    it('does not keep an init claim once settled', () => {
      own.markUserGesture();
      advance(1000);
      expect(own.canCommit('follow-tail')).toBe(true);
      expect(own.hasUserClaimedInitialLoad()).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears user control and returns to the init phase', () => {
      own.markUserGesture();
      own.markInitialAnchorSettled();
      advance(10);
      own.reset();
      expect(own.isInitialAnchorSettled()).toBe(false);
      expect(own.hasUserClaimedInitialLoad()).toBe(false);
      expect(own.isUserActive()).toBe(false);
      expect(own.canCommit('initial-anchor')).toBe(true);
    });
  });
});
