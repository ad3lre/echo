import { beforeEach, describe, expect, it } from 'vitest';
import type { EchoApiMessage } from '@/api/echo/messages';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { _resetAllIndexesForTesting } from '@/features/chat/domain/channelMessageIndex';
import { bindChannelMessageBuckets } from '@/services/realtime/channelMessageAuthority';
import { messageWindowAuthority } from '@/services/realtime/messageWindowAuthority';
import { replaceChannelMessagesFromHistory } from '@/services/realtime/channelMessageAuthority';
import { applyPrefetchedWorkspaceChannelMessages } from '@/services/orchestration/echoWorkspaceChannelPrefetch';
import { ref } from 'vue';

function apiMsg(id: string, content: string): EchoApiMessage {
  return {
    id,
    channelId: 'ch-prefetch',
    authorId: 'u1',
    content,
    timestamp: '2026-05-24T12:13:00.000Z',
    messageFormatVersion: 1,
    contentSchemaVersion: 1,
  };
}

function rawMsg(id: string, content: string): RawMessage {
  return {
    id,
    authorId: 'u1',
    content,
    timestamp: '2026-05-24T12:13:00.000Z',
  };
}

describe('applyPrefetchedWorkspaceChannelMessages', () => {
  const channelId = 'ch-prefetch';

  beforeEach(() => {
    _resetAllIndexesForTesting();
    messageWindowAuthority._resetForTesting();
    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    messageWindowAuthority.setActiveChannel(channelId);
  });

  it('replaces when the channel bucket is empty', () => {
    applyPrefetchedWorkspaceChannelMessages(channelId, [
      apiMsg('m1', 'hello'),
      apiMsg('m2', 'world'),
    ]);
    const list = messageWindowAuthority.getIndex(channelId).sorted.value;
    expect(list.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('does not remove fresher local rows when prefetch response is stale', () => {
    replaceChannelMessagesFromHistory(channelId, [
      rawMsg('m1', 'hello'),
      rawMsg('m2', 'world'),
      rawMsg('m3', 'meow'),
    ]);
    applyPrefetchedWorkspaceChannelMessages(channelId, [
      apiMsg('m1', 'hello'),
      apiMsg('m2', 'world'),
    ]);
    const list = messageWindowAuthority.getIndex(channelId).sorted.value;
    expect(list.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('appends rows present only in the prefetch page', () => {
    replaceChannelMessagesFromHistory(channelId, [
      rawMsg('m1', 'hello'),
      rawMsg('m2', 'world'),
    ]);
    applyPrefetchedWorkspaceChannelMessages(channelId, [
      apiMsg('m1', 'hello'),
      apiMsg('m2', 'world'),
      apiMsg('m3', 'meow'),
    ]);
    const list = messageWindowAuthority.getIndex(channelId).sorted.value;
    expect(list.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });
});
