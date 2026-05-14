import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { RawMessage } from './useChatMessages';
import { bindChannelMessageBuckets } from '@/services/realtime/channelMessageAuthority';
import { _resetAllIndexesForTesting } from '@/features/chat/domain/channelMessageIndex';
import { usePollVotes } from './usePollVotes';

vi.mock('@/utils/formatPollTime', () => ({
  isPollEnded: () => false,
}));

describe('usePollVotes', () => {
  beforeEach(() => {
    _resetAllIndexesForTesting();
  });

  it('adds vote to target option and removes from others', () => {
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [
        {
          id: 'm1',
          authorId: 'a',
          timestamp: 't',
          content: '',
          poll: {
            question: 'Q?',
            options: [
              { id: 'o1', text: 'A', votes: 1, voterIds: ['u1'] },
              { id: 'o2', text: 'B', votes: 0, voterIds: [] },
            ],
            endsAt: new Date(Date.now() + 60_000).toISOString(),
          },
        },
      ],
    });
    bindChannelMessageBuckets(messages);
    const { votePoll } = usePollVotes(messages);
    votePoll('c1', 'm1', 'o2', 'u1');
    const opts = messages.value.c1![0]!.poll!.options;
    expect(opts.find((o) => o.id === 'o1')!.voterIds).not.toContain('u1');
    expect(opts.find((o) => o.id === 'o2')!.voterIds).toContain('u1');
  });

  it('no-ops when channel missing', () => {
    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const { votePoll } = usePollVotes(messages);
    votePoll('x', 'm', 'o', 'u');
    expect(messages.value.x).toBeUndefined();
  });
});
