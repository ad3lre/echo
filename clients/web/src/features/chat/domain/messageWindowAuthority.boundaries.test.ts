import { beforeEach, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  bindChannelMessageBuckets,
  ensureChannelBucket,
} from '@/features/chat/domain/channelMessageAuthority';
import {
  messageWindowAuthority,
  type MessageBoundaryState,
} from '@/features/chat/domain/messageWindowAuthority';

function message(id: string): RawMessage {
  return {
    id,
    authorId: 'u1',
    content: id,
    timestamp: '2026-08-11T12:00:00.000Z',
  };
}

describe('messageWindowAuthority directional boundaries', () => {
  beforeEach(() => {
    messageWindowAuthority._resetForTesting();
    bindChannelMessageBuckets(ref<Record<string, RawMessage[]>>({}));
  });

  it('keeps failed boundaries retryable without claiming more rows are absent', () => {
    const channelId = 'channel-1';
    ensureChannelBucket(channelId).push(message('m1'));
    messageWindowAuthority.setActiveChannel(channelId);

    messageWindowAuthority.setBoundary(channelId, 'older', 'failed');
    messageWindowAuthority.setBoundary(channelId, 'newer', 'failed');

    expect(messageWindowAuthority.olderBoundary.value).toBe('failed');
    expect(messageWindowAuthority.newerBoundary.value).toBe('failed');
    expect(messageWindowAuthority.hasMoreOlder.value).toBe(true);
    expect(messageWindowAuthority.hasMoreNewer.value).toBe(true);
  });

  it('retains boundary state per channel across active-channel switches', () => {
    const a = 'channel-a';
    const b = 'channel-b';
    ensureChannelBucket(a).push(message('a1'));
    ensureChannelBucket(b).push(message('b1'));
    messageWindowAuthority.setBoundary(a, 'older', 'reached');
    messageWindowAuthority.setBoundary(a, 'newer', 'more');
    messageWindowAuthority.setBoundary(b, 'older', 'more');

    messageWindowAuthority.setActiveChannel(a);
    expect(messageWindowAuthority.olderBoundary.value).toBe('reached');
    expect(messageWindowAuthority.newerBoundary.value).toBe('more');

    messageWindowAuthority.setActiveChannel(b);
    expect(messageWindowAuthority.olderBoundary.value).toBe('more');
    expect(messageWindowAuthority.newerBoundary.value).toBe('reached');
  });

  it.each([
    ['unknown', true],
    ['more', true],
    ['failed', true],
    ['reached', false],
  ] as const)(
    'maps %s to fetch eligibility %s',
    (state: MessageBoundaryState, eligible) => {
      const channelId = 'channel-1';
      ensureChannelBucket(channelId).push(message('m1'));
      messageWindowAuthority.setActiveChannel(channelId);
      messageWindowAuthority.setBoundary(channelId, 'older', state);
      expect(messageWindowAuthority.hasMoreOlder.value).toBe(eligible);
    },
  );

  it('clears directional state and evicted-row cache on test/session reset', () => {
    const channelId = 'channel-1';
    ensureChannelBucket(channelId).push(message('m1'));
    messageWindowAuthority.setBoundary(channelId, 'older', 'failed');
    messageWindowAuthority.setBoundary(channelId, 'newer', 'more');

    messageWindowAuthority._resetForTesting();
    bindChannelMessageBuckets(ref<Record<string, RawMessage[]>>({}));
    ensureChannelBucket(channelId).push(message('m2'));
    messageWindowAuthority.setActiveChannel(channelId);

    expect(messageWindowAuthority.getBoundary(channelId, 'older')).toBe(
      'unknown',
    );
    expect(messageWindowAuthority.getBoundary(channelId, 'newer')).toBe(
      'reached',
    );
    expect(messageWindowAuthority.hasCachedOlder(channelId)).toBe(false);
  });
});
