import { describe, expect, it } from 'vitest';
import { MESSAGE_LIST_STABLE_OVERSCAN } from '@/features/chat/domain/messageListScrollPolicy';
import { resolveMessageListOverscanPx } from './useMessageListVirtualizer';

describe('resolveMessageListOverscanPx', () => {
  it('doubles stable overscan while the older-fetch skeleton is active', () => {
    expect(
      resolveMessageListOverscanPx({
        olderFetchSkeletonActive: true,
        coarsePointer: false,
        safariLikeBrowser: false,
      }),
    ).toBe(MESSAGE_LIST_STABLE_OVERSCAN * 2);
  });

  it('keeps the stable overscan on non-Safari browsers', () => {
    expect(
      resolveMessageListOverscanPx({
        olderFetchSkeletonActive: false,
        coarsePointer: true,
        safariLikeBrowser: false,
      }),
    ).toBe(MESSAGE_LIST_STABLE_OVERSCAN);
  });

  it('raises Safari overscan to the idle floor', () => {
    expect(
      resolveMessageListOverscanPx({
        olderFetchSkeletonActive: false,
        coarsePointer: true,
        safariLikeBrowser: true,
      }),
    ).toBeGreaterThanOrEqual(MESSAGE_LIST_STABLE_OVERSCAN);
    expect(
      resolveMessageListOverscanPx({
        olderFetchSkeletonActive: false,
        coarsePointer: true,
        safariLikeBrowser: true,
      }),
    ).toBe(24);
  });
});
