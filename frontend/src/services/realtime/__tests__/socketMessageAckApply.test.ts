import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyEchoMessageAck } from '../socketMessageAckApply';
import type { Message } from '@shared/types';
import {
  _resetAllIndexesForTesting,
  getChannelIndex,
} from '@/features/chat/domain/channelMessageIndex';

beforeEach(() => {
  _resetAllIndexesForTesting();
});

function baseMessage(over: Partial<Message> = {}): Message {
  return {
    id: 'mid',
    channelId: 'cid',
    authorId: 'aid',
    content: 'hello',
    timestamp: '2020-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('applyEchoMessageAck', () => {
  it('appends when channel list is missing or empty', () => {
    const appendChannelMessage = vi.fn();
    const materializeChannelAfterIndexMutation = vi.fn();
    const finalize = vi.fn();
    const m = baseMessage();
    applyEchoMessageAck(m, {
      getChannelList: () => undefined,
      materializeChannelAfterIndexMutation,
      appendChannelMessage,
      finalizePendingSend: finalize,
    });
    expect(appendChannelMessage).toHaveBeenCalledTimes(1);
    expect(appendChannelMessage.mock.calls[0]![0]).toBe('cid');
    expect(appendChannelMessage.mock.calls[0]![1]).toMatchObject({
      id: 'mid',
      authorId: 'aid',
      content: 'hello',
    });
    expect(materializeChannelAfterIndexMutation).not.toHaveBeenCalled();
    expect(finalize).toHaveBeenCalledWith('mid');
  });

  it('updates existing row when channel already has the client id', () => {
    const store: Record<
      string,
      import('@/composables/useChatMessages').RawMessage[]
    > = {
      cid: [
        {
          id: 'mid',
          authorId: 'aid',
          content: 'optimistic',
          timestamp: '2019-01-01T00:00:00.000Z',
        },
      ],
    };
    const appendChannelMessage = vi.fn();
    const materializeChannelAfterIndexMutation = vi.fn((ch: string) => {
      const index = getChannelIndex(ch);
      store[ch] = index.sorted.value as (typeof store)[string];
    });
    const m = baseMessage({ content: 'server' });
    applyEchoMessageAck(m, {
      getChannelList: (ch) => store[ch],
      materializeChannelAfterIndexMutation,
      appendChannelMessage,
      finalizePendingSend: vi.fn(),
    });
    expect(appendChannelMessage).not.toHaveBeenCalled();
    expect(materializeChannelAfterIndexMutation).toHaveBeenCalled();
    expect(store.cid![0]!.content).toBe('server');
  });

  it('inserts when channel has messages but not this id', () => {
    const store: Record<
      string,
      import('@/composables/useChatMessages').RawMessage[]
    > = {
      cid: [
        {
          id: 'other',
          authorId: 'x',
          content: 'a',
          timestamp: '2019-06-01T00:00:00.000Z',
        },
      ],
    };
    const appendChannelMessage = vi.fn();
    const materializeChannelAfterIndexMutation = vi.fn((ch: string) => {
      const index = getChannelIndex(ch);
      store[ch] = index.sorted.value as (typeof store)[string];
    });
    const m = baseMessage({ id: 'newid', content: 'b' });
    applyEchoMessageAck(m, {
      getChannelList: (ch) => store[ch],
      materializeChannelAfterIndexMutation,
      appendChannelMessage,
      finalizePendingSend: vi.fn(),
    });
    expect(appendChannelMessage).not.toHaveBeenCalled();
    expect(store.cid!.some((r) => r.id === 'newid')).toBe(true);
  });

  it('calls onAfterIndexedAck only after indexed merge path', () => {
    const after = vi.fn();
    const store: Record<
      string,
      import('@/composables/useChatMessages').RawMessage[]
    > = {
      cid: [
        {
          id: 'mid',
          authorId: 'a',
          content: 'x',
          timestamp: '2019-01-01T00:00:00.000Z',
        },
      ],
    };
    applyEchoMessageAck(baseMessage(), {
      getChannelList: (ch) => store[ch],
      materializeChannelAfterIndexMutation: (ch) => {
        const index = getChannelIndex(ch);
        store[ch] = index.sorted.value as (typeof store)[string];
      },
      appendChannelMessage: vi.fn(),
      onAfterIndexedAck: after,
      finalizePendingSend: vi.fn(),
    });
    expect(after).toHaveBeenCalledWith('cid');
  });
});
