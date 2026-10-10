// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import {
  collectVisibleMathMessageIds,
  resolveVirtualRowSlotHeightPx,
  shouldSkipVirtualRowMeasureCommit,
} from './useMessageListRowGeometry';

function msg(content: string): MessageWithAuthor {
  return { content } as MessageWithAuthor;
}

describe('collectVisibleMathMessageIds', () => {
  it('skips prepend skeleton rows and messages without math', () => {
    const merged = ref(
      new Map<string, MessageWithAuthor>([
        ['plain', msg('hello')],
        ['math', msg('$x^2$')],
      ]),
    );
    const ids = collectVisibleMathMessageIds(
      {
        isPrependSkeletonVirtualIndex: (index) => index === 0,
        messageIdForVirtualIndex: (index) =>
          ['skel', 'plain', 'math'][index] ?? null,
        mergedMessagesForList: merged,
      },
      [{ index: 0 }, { index: 1 }, { index: 2 }],
    );
    expect(ids).toEqual(['math']);
  });

  it('ignores unknown message ids', () => {
    const merged = ref(new Map<string, MessageWithAuthor>());
    const ids = collectVisibleMathMessageIds(
      {
        isPrependSkeletonVirtualIndex: () => false,
        messageIdForVirtualIndex: () => 'missing',
        mergedMessagesForList: merged,
      },
      [{ index: 0 }],
    );
    expect(ids).toEqual([]);
  });
});

describe('shouldSkipVirtualRowMeasureCommit', () => {
  it('does not skip the first measure (no last content height)', () => {
    expect(
      shouldSkipVirtualRowMeasureCommit({
        contentHeightPx: 28,
        lastContentHeightPx: undefined,
        slotHeightPx: 88,
      }),
    ).toBe(false);
  });

  it('does not skip when content height changed', () => {
    expect(
      shouldSkipVirtualRowMeasureCommit({
        contentHeightPx: 28,
        lastContentHeightPx: 72,
        slotHeightPx: 72,
      }),
    ).toBe(false);
  });

  it('does not skip when the virtual slot is still oversized (visible gaps)', () => {
    // Content already measured short, but TanStack reset the slot to the
    // default estimate — skipping would leave blank space between continuations.
    expect(
      shouldSkipVirtualRowMeasureCommit({
        contentHeightPx: 28,
        lastContentHeightPx: 28,
        slotHeightPx: 88,
      }),
    ).toBe(false);
  });

  it('skips only when content and slot already agree', () => {
    expect(
      shouldSkipVirtualRowMeasureCommit({
        contentHeightPx: 28,
        lastContentHeightPx: 28,
        slotHeightPx: 28,
      }),
    ).toBe(true);
  });

  it('does not skip when slot height is unknown', () => {
    expect(
      shouldSkipVirtualRowMeasureCommit({
        contentHeightPx: 28,
        lastContentHeightPx: 28,
        slotHeightPx: null,
      }),
    ).toBe(false);
  });
});

describe('resolveVirtualRowSlotHeightPx', () => {
  it('reads height from the absolute virtual-row shell when present', () => {
    const shell = document.createElement('div');
    shell.className = 'message-list-virtual-row';
    Object.defineProperty(shell, 'getBoundingClientRect', {
      value: () => ({
        height: 88,
        width: 0,
        top: 0,
        left: 0,
        bottom: 88,
        right: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    const measure = document.createElement('div');
    shell.appendChild(measure);
    expect(
      resolveVirtualRowSlotHeightPx(measure, 0, [{ index: 0, size: 28 }]),
    ).toBe(88);
  });

  it('falls back to the virtual item size without a shell', () => {
    const measure = document.createElement('div');
    expect(
      resolveVirtualRowSlotHeightPx(measure, 2, [
        { index: 1, size: 40 },
        { index: 2, size: 56 },
      ]),
    ).toBe(56);
  });
});
