import { describe, expect, it, vi } from 'vitest';
import { DM_CALL_ROLLUP_MESSAGE_ID_PREFIX } from '@/features/chat/domain/dmCallLogHistoryCollapse';
import { createMessageListBubbleActionHandlers } from './useMessageListBubbleActionHandlers';

describe('createMessageListBubbleActionHandlers', () => {
  it('returns undefined when the parent callback is missing', () => {
    const api = createMessageListBubbleActionHandlers({
      onPollVote: () => undefined,
      onReact: () => undefined,
      onPin: () => undefined,
      onUnpin: () => undefined,
    });
    expect(api.getVoteHandler('m1')).toBeUndefined();
    expect(api.getReactHandler('m1')).toBeUndefined();
    expect(api.getPinHandler('m1')).toBeUndefined();
    expect(api.getUnpinHandler('m1')).toBeUndefined();
  });

  it('returns undefined for synthetic DM call rollup ids', () => {
    const onPollVote = vi.fn();
    const api = createMessageListBubbleActionHandlers({
      onPollVote: () => onPollVote,
      onReact: () => undefined,
      onPin: () => undefined,
      onUnpin: () => undefined,
    });
    expect(
      api.getVoteHandler(`${DM_CALL_ROLLUP_MESSAGE_ID_PREFIX}ch:hidden`),
    ).toBeUndefined();
    expect(onPollVote).not.toHaveBeenCalled();
  });

  it('caches the same function per message id and forwards live callbacks', () => {
    const onPin = vi.fn();
    const api = createMessageListBubbleActionHandlers({
      onPollVote: () => undefined,
      onReact: () => undefined,
      onPin: () => onPin,
      onUnpin: () => undefined,
    });
    const first = api.getPinHandler('m1');
    const second = api.getPinHandler('m1');
    expect(first).toBe(second);
    first?.();
    expect(onPin).toHaveBeenCalledWith('m1');
  });

  it('forgets cached callbacks after clear', () => {
    const api = createMessageListBubbleActionHandlers({
      onPollVote: () => undefined,
      onReact: () => undefined,
      onPin: () => vi.fn(),
      onUnpin: () => undefined,
    });
    const before = api.getPinHandler('m1');
    api.clearBubbleActionHandlers();
    const after = api.getPinHandler('m1');
    expect(after).not.toBe(before);
  });
});
