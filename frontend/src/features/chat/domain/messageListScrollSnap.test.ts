import { describe, expect, it } from 'vitest';
import {
  downwardOnlySnapScrollTop,
  isScrollNearBottom,
  shouldSkipScrollToIndexForLatest,
} from './messageListScrollSnap';

describe('messageListScrollSnap', () => {
  it('only increases scrollTop toward the bottom', () => {
    expect(downwardOnlySnapScrollTop(100, 1000, 400)).toBe(600);
    expect(downwardOnlySnapScrollTop(599, 1000, 400)).toBe(600);
    expect(downwardOnlySnapScrollTop(600, 1000, 400)).toBe(600);
  });

  it('does not yank upward when already at the bottom', () => {
    expect(downwardOnlySnapScrollTop(600, 800, 400)).toBe(600);
    expect(downwardOnlySnapScrollTop(650, 800, 400)).toBe(650);
  });

  it('detects near-bottom within tolerance', () => {
    expect(isScrollNearBottom(598, 1000, 400)).toBe(true);
    expect(isScrollNearBottom(590, 1000, 400)).toBe(false);
  });

  it('skips scrollToIndex when virtualizer or DOM is already at bottom', () => {
    expect(
      shouldSkipScrollToIndexForLatest({
        smooth: false,
        virtualDistFromBottomPx: 1,
        scrollTop: 500,
        scrollHeight: 900,
        clientHeight: 400,
      }),
    ).toBe(true);
    expect(
      shouldSkipScrollToIndexForLatest({
        smooth: false,
        virtualDistFromBottomPx: 40,
        scrollTop: 598,
        scrollHeight: 1000,
        clientHeight: 400,
      }),
    ).toBe(true);
    expect(
      shouldSkipScrollToIndexForLatest({
        smooth: false,
        virtualDistFromBottomPx: -40,
        scrollTop: 0,
        scrollHeight: 200,
        clientHeight: 400,
      }),
    ).toBe(true);
    expect(
      shouldSkipScrollToIndexForLatest({
        smooth: false,
        virtualDistFromBottomPx: 3000,
        scrollTop: 0,
        scrollHeight: 200,
        clientHeight: 0,
      }),
    ).toBe(false);
    expect(
      shouldSkipScrollToIndexForLatest({
        smooth: false,
        virtualDistFromBottomPx: 500,
        scrollTop: 500,
        scrollHeight: 2000,
        clientHeight: 400,
      }),
    ).toBe(false);
    expect(
      shouldSkipScrollToIndexForLatest({
        smooth: false,
        forceScrollToIndex: true,
        virtualDistFromBottomPx: 0,
        scrollTop: 598,
        scrollHeight: 1000,
        clientHeight: 400,
      }),
    ).toBe(false);
    expect(
      shouldSkipScrollToIndexForLatest({
        smooth: true,
        virtualDistFromBottomPx: 80,
        scrollTop: 598,
        scrollHeight: 1000,
        clientHeight: 400,
      }),
    ).toBe(true);
    expect(
      shouldSkipScrollToIndexForLatest({
        smooth: true,
        virtualDistFromBottomPx: 80,
        scrollTop: 100,
        scrollHeight: 1000,
        clientHeight: 400,
      }),
    ).toBe(false);
  });
});
