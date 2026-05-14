import { describe, expect, it, vi } from 'vitest';
import { ingestEchoRealtimeIncomingChatMessage } from '../socketIncomingLiveMessage';

describe('ingestEchoRealtimeIncomingChatMessage', () => {
  it('appends mapped message and dispatches notify when id is new', () => {
    const notifyIncomingChatMessage = vi.fn();
    const applyAuthorHint = vi.fn();
    const ch = 'c1';
    const store: Record<
      string,
      import('@/composables/useChatMessages').RawMessage[]
    > = {};
    const appendChannelMessage = vi.fn(
      (
        channelId: string,
        raw: import('@/composables/useChatMessages').RawMessage,
      ) => {
        if (!store[channelId]) store[channelId] = [];
        store[channelId]!.push(raw);
      },
    );
    ingestEchoRealtimeIncomingChatMessage(
      {
        id: 'm1',
        channelId: ch,
        authorId: 'a0',
        content: 'hi',
        timestamp: '2020-01-01T00:00:00.000Z',
        mentions: [
          {
            kind: 'user',
            id: 'm1',
            label: '@u',
            start: 0,
            end: 2,
            userId: 'u1',
          },
        ],
      },
      {
        ensureChannelMessagesList: (id) => {
          if (!store[id]) store[id] = [];
          return store[id]!;
        },
        onDuplicateById: vi.fn(),
        resolveAuthorId: () => 'aResolved',
        appendChannelMessage,
        notifyIncomingChatMessage,
        applyAuthorHint,
      },
    );
    expect(appendChannelMessage).toHaveBeenCalledWith(
      ch,
      expect.objectContaining({
        id: 'm1',
        authorId: 'aResolved',
        content: 'hi',
      }),
    );
    expect(notifyIncomingChatMessage).toHaveBeenCalledWith({
      channelId: ch,
      authorId: 'aResolved',
      mentions: [
        {
          kind: 'user',
          id: 'm1',
          label: '@u',
          start: 0,
          end: 2,
          userId: 'u1',
        },
      ],
      authorDisplayName: undefined,
      authorAvatar: undefined,
      contentPreview: 'hi',
    });
    expect(applyAuthorHint).toHaveBeenCalledWith({
      userId: 'aResolved',
      displayName: undefined,
      avatarUrl: undefined,
    });
  });

  it('calls onDuplicateById and skips append when id already exists', () => {
    const notifyIncomingChatMessage = vi.fn();
    const ch = 'c1';
    const store: Record<
      string,
      import('@/composables/useChatMessages').RawMessage[]
    > = {
      [ch]: [
        {
          id: 'm1',
          authorId: 'a',
          content: 'old',
          timestamp: '2019-01-01T00:00:00.000Z',
        },
      ],
    };
    const onDuplicateById = vi.fn();
    const appendChannelMessage = vi.fn();
    ingestEchoRealtimeIncomingChatMessage(
      {
        id: 'm1',
        channelId: ch,
        authorId: 'a',
        content: 'dup',
        timestamp: '2020-01-01T00:00:00.000Z',
      },
      {
        ensureChannelMessagesList: (id) => {
          if (!store[id]) store[id] = [];
          return store[id]!;
        },
        onDuplicateById,
        resolveAuthorId: (p) => p.authorId,
        appendChannelMessage,
        notifyIncomingChatMessage,
      },
    );
    expect(onDuplicateById).toHaveBeenCalledWith(ch, 'm1');
    expect(appendChannelMessage).not.toHaveBeenCalled();
    expect(notifyIncomingChatMessage).not.toHaveBeenCalled();
  });
});
