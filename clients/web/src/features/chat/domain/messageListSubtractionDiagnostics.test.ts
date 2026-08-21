import { describe, expect, it, beforeEach } from 'vitest';
import {
  getMessageListSubtractionSnapshot,
  noteSubtractionHydrationEpochBump,
  noteSubtractionMeasureElement,
  noteSubtractionResizeFlush,
  noteSubtractionResizeSchedule,
  noteSubtractionRowMount,
  noteSubtractionScrollWrite,
  resetMessageListSubtractionDiagnosticsForTests,
} from './messageListSubtractionDiagnostics';

describe('messageListSubtractionDiagnostics', () => {
  beforeEach(() => {
    resetMessageListSubtractionDiagnosticsForTests();
  });

  it('counts duplicate measures of the same row revision', () => {
    noteSubtractionMeasureElement('c:m1', 'rev-a');
    noteSubtractionMeasureElement('c:m1', 'rev-a');
    noteSubtractionMeasureElement('c:m1', 'rev-b');
    const snap = getMessageListSubtractionSnapshot();
    expect(snap.measureElementCalls).toBe(3);
    expect(snap.duplicateMeasuresSameRevision).toBe(1);
  });

  it('tracks scroll intents and resize schedule/flush', () => {
    noteSubtractionScrollWrite('follow-tail');
    noteSubtractionScrollWrite('follow-tail');
    noteSubtractionScrollWrite('user-intent');
    noteSubtractionResizeSchedule();
    noteSubtractionResizeFlush();
    noteSubtractionRowMount('m1');
    noteSubtractionHydrationEpochBump();
    const snap = getMessageListSubtractionSnapshot();
    expect(snap.scrollWritesByIntent['follow-tail']).toBe(2);
    expect(snap.scrollWritesByIntent['user-intent']).toBe(1);
    expect(snap.resizeScheduleCalls).toBe(1);
    expect(snap.resizeFlushCalls).toBe(1);
    expect(snap.rowMounts).toBe(1);
    expect(snap.hydrationEpochBumps).toBe(1);
    expect(snap.deferredWithOverflowCount).toBe(0);
  });

  it('counts deferred-with-overflow events', async () => {
    const { noteSubtractionDeferredWithOverflow } =
      await import('./messageListSubtractionDiagnostics');
    noteSubtractionDeferredWithOverflow(40);
    noteSubtractionDeferredWithOverflow(0);
    expect(getMessageListSubtractionSnapshot().deferredWithOverflowCount).toBe(
      1,
    );
  });
});
