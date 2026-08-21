import { describe, expect, it } from 'vitest';
import {
  appendMessageToast,
  canNavigateMessageToasts,
  messageToastNavLabel,
  removeMessageToastAtIndex,
} from './appMessageToastQueue';

describe('appendMessageToast', () => {
  it('appends to the queue', () => {
    expect(appendMessageToast([1], 2)).toEqual([1, 2]);
  });

  it('drops oldest items when over max', () => {
    expect(appendMessageToast([1, 2], 3, 2)).toEqual([2, 3]);
  });
});

describe('removeMessageToastAtIndex', () => {
  it('removes the item and clamps the next index', () => {
    expect(removeMessageToastAtIndex(['a', 'b', 'c'], 1)).toEqual({
      queue: ['a', 'c'],
      nextIndex: 1,
    });
  });

  it('returns an empty queue when removing the last item', () => {
    expect(removeMessageToastAtIndex(['a'], 0)).toEqual({
      queue: [],
      nextIndex: 0,
    });
  });
});

describe('canNavigateMessageToasts', () => {
  it('blocks navigation for a single toast', () => {
    expect(canNavigateMessageToasts(1, 0, 'prev')).toBe(false);
    expect(canNavigateMessageToasts(1, 0, 'next')).toBe(false);
  });

  it('allows prev/next within bounds', () => {
    expect(canNavigateMessageToasts(3, 1, 'prev')).toBe(true);
    expect(canNavigateMessageToasts(3, 1, 'next')).toBe(true);
    expect(canNavigateMessageToasts(3, 0, 'prev')).toBe(false);
    expect(canNavigateMessageToasts(3, 2, 'next')).toBe(false);
  });
});

describe('messageToastNavLabel', () => {
  it('formats a 1-based position label', () => {
    expect(messageToastNavLabel(0, 3)).toBe('1/3');
    expect(messageToastNavLabel(2, 3)).toBe('3/3');
  });
});
