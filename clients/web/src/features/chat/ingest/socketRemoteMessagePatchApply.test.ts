import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyRemoteMessageEdit,
  applyRemoteMessageEmbeds,
  applyRemoteMessageReactions,
  applyRemotePollUpdate,
} from '@/features/chat/ingest/socketRemoteMessagePatchApply';
import type { Embed, MessageReaction, PollData } from '@shared/types';
import {
  _resetAllIndexesForTesting,
  getChannelIndex,
} from '@/features/chat/domain/channelMessageIndex';

type RM = import('@/features/chat/useChatMessages').RawMessage;

function sinkFor(store: Record<string, RM[]>) {
  return {
    getChannelList: (ch: string) => store[ch],
    materializeChannelAfterIndexMutation: (ch: string) => {
      const index = getChannelIndex(ch);
      store[ch] = index.sorted.value as RM[];
    },
  };
}

beforeEach(() => {
  _resetAllIndexesForTesting();
});

describe('applyRemoteMessageEdit', () => {
  it('updates content and editedAt when message exists', () => {
    const store: Record<string, RM[]> = {
      c1: [
        {
          id: 'm1',
          authorId: 'a',
          content: 'old',
          timestamp: '2019-01-01T00:00:00.000Z',
          messageFormatVersion: 1,
          contentSchemaVersion: 1,
        },
      ],
    };
    const after = vi.fn();
    applyRemoteMessageEdit(
      {
        channelId: 'c1',
        messageId: 'm1',
        content: 'new',
        editedAt: '2020-01-01T00:00:00.000Z',
      },
      { ...sinkFor(store), onAfterEdit: after },
    );
    expect(store.c1![0]!.content).toBe('new');
    expect(store.c1![0]!.editedAt).toBeDefined();
    expect(after).toHaveBeenCalledWith('c1', 'm1');
  });

  it('no-ops when message missing', () => {
    const store: Record<string, RM[]> = {
      c1: [
        {
          id: 'm1',
          authorId: 'a',
          content: 'x',
          timestamp: '2019-01-01T00:00:00.000Z',
        },
      ],
    };
    const before = store.c1![0]!.content;
    applyRemoteMessageEdit(
      {
        channelId: 'c1',
        messageId: 'missing',
        content: 'n',
        editedAt: '2020-01-01T00:00:00.000Z',
      },
      sinkFor(store),
    );
    expect(store.c1![0]!.content).toBe(before);
  });
});

describe('applyRemoteMessageEmbeds', () => {
  it('sets embeds when row exists', () => {
    const store: Record<string, RM[]> = {
      c1: [
        {
          id: 'm1',
          authorId: 'a',
          content: 'x',
          timestamp: '2019-01-01T00:00:00.000Z',
        },
      ],
    };
    const emb: Embed[] = [{ url: 'https://x.test', title: 't' }];
    applyRemoteMessageEmbeds(
      { channelId: 'c1', messageId: 'm1', embeds: emb },
      sinkFor(store),
    );
    expect(store.c1![0]!.embeds).toEqual(emb);
  });
});

describe('applyRemoteMessageReactions', () => {
  it('sets reactions and calls onAfterReactions', () => {
    const store: Record<string, RM[]> = {
      c1: [
        {
          id: 'm1',
          authorId: 'a',
          content: 'x',
          timestamp: '2019-01-01T00:00:00.000Z',
        },
      ],
    };
    const rx: MessageReaction[] = [
      { emoji: 'smile', userIds: ['u1'], count: 1 },
    ];
    const after = vi.fn();
    applyRemoteMessageReactions(
      { channelId: 'c1', messageId: 'm1', reactions: rx },
      { ...sinkFor(store), onAfterReactions: after },
    );
    expect(store.c1![0]!.reactions).toEqual(rx);
    expect(after).toHaveBeenCalledWith('c1', 'm1');
  });

  it('clears reactions when server sends empty array', () => {
    const store: Record<string, RM[]> = {
      c1: [
        {
          id: 'm1',
          authorId: 'a',
          content: 'x',
          timestamp: '2019-01-01T00:00:00.000Z',
          reactions: [{ emoji: 'smile', userIds: ['u1'], count: 1 }],
        },
      ],
    };
    applyRemoteMessageReactions(
      { channelId: 'c1', messageId: 'm1', reactions: [] },
      sinkFor(store),
    );
    expect(store.c1![0]!.reactions).toBeUndefined();
  });

  it('preserves viewer highlight on count-only fan-out', () => {
    const store: Record<string, RM[]> = {
      c1: [
        {
          id: 'm1',
          authorId: 'a',
          content: 'x',
          timestamp: '2019-01-01T00:00:00.000Z',
          reactions: [{ emoji: '🔥', userIds: ['me', 'other'], count: 2 }],
        },
      ],
    };
    applyRemoteMessageReactions(
      {
        channelId: 'c1',
        messageId: 'm1',
        reactions: [{ emoji: '🔥', userIds: [], count: 3 }],
      },
      { ...sinkFor(store), viewerUserId: 'me' },
    );
    expect(store.c1![0]!.reactions).toEqual([
      { emoji: '🔥', userIds: ['me'], count: 3 },
    ]);
  });
});

describe('applyRemotePollUpdate', () => {
  it('sets poll on message', () => {
    const store: Record<string, RM[]> = {
      c1: [
        {
          id: 'm1',
          authorId: 'a',
          content: 'x',
          timestamp: '2019-01-01T00:00:00.000Z',
        },
      ],
    };
    const poll: PollData = {
      question: 'Q?',
      options: [
        {
          id: 'o1',
          text: 'A',
          votes: 0,
          voterIds: [],
        },
      ],
    };
    applyRemotePollUpdate(
      { channelId: 'c1', messageId: 'm1', poll },
      sinkFor(store),
    );
    expect(store.c1![0]!.poll).toEqual(poll);
  });
});
