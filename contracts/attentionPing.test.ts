import { describe, expect, it } from 'vitest';
import {
  classifyAttentionPingKind,
  resolveEchoUnreadMentionMessageId,
  selfPingingMentionKinds,
} from './attentionPing';
import type { EchoAttentionChannelSummary, MentionEntity } from './types';

describe('user mention identity', () => {
  const viewer = { userId: 'me', displayName: 'Shared name' };
  it.each([{ id: '', userId: 'other' }, { id: 'other' }])(
    'ignores matching labels with another explicit ID',
    (identity) => {
      const mention: MentionEntity = {
        kind: 'user',
        label: 'Shared name',
        start: 0,
        end: 12,
        ...identity,
      };
      expect(classifyAttentionPingKind([mention], viewer)).toBeNull();
      expect(selfPingingMentionKinds([mention], viewer)).toEqual([]);
    },
  );
  it('retains label matching for legacy mentions without IDs', () => {
    const mention: MentionEntity = {
      id: '',
      kind: 'user',
      label: 'Shared name',
      start: 0,
      end: 12,
    };
    expect(classifyAttentionPingKind([mention], viewer)).toBe('personal');
    expect(selfPingingMentionKinds([mention], viewer)).toEqual(['user']);
  });
});

describe('resolveEchoUnreadMentionMessageId', () => {
  function summary(
    partial: Partial<EchoAttentionChannelSummary>,
  ): EchoAttentionChannelSummary {
    return {
      channelId: 'c1',
      kind: 'server',
      lastReadMessageId: null,
      unreadCount: 2,
      serverId: 's1',
      pingKind: 'broadcast',
      latestUnreadMessageId: 'newer-non-mention',
      ...partial,
    };
  }

  it('prefers the mention-specific anchor over latest unread', () => {
    expect(
      resolveEchoUnreadMentionMessageId(
        summary({ latestUnreadMentionMessageId: 'the-everyone-ping' }),
      ),
    ).toBe('the-everyone-ping');
  });

  it('does not fall back to latestUnread when multiple unreads exist', () => {
    // Discord bridge: newest unread is often a plain message after @everyone.
    expect(resolveEchoUnreadMentionMessageId(summary({}))).toBe('');
  });

  it('falls back to latestUnread when there is exactly one unread', () => {
    expect(
      resolveEchoUnreadMentionMessageId(
        summary({ unreadCount: 1, latestUnreadMentionMessageId: undefined }),
      ),
    ).toBe('newer-non-mention');
  });
});
