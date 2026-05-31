import { describe, expect, it } from 'vitest';
import {
  downwardOnlySnapScrollTop,
  isScrollNearBottom,
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
});
