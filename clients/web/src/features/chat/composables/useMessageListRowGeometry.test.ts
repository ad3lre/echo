import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import { collectVisibleMathMessageIds } from './useMessageListRowGeometry';

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
