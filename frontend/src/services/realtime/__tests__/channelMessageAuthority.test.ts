import { beforeEach, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { _resetAllIndexesForTesting } from '@/features/chat/domain/channelMessageIndex';
import {
  bindChannelMessageBuckets,
  hasChannelMessageInBucket,
  insertChannelMessageFromHistory,
  replaceChannelMessagesFromHistory,
  restoreChannelMessageReactions,
  updateChannelMessageInBucket,
} from '../channelMessageAuthority';

function makeMessage(
  id: string,
  authorId: string,
  timestamp: string,
): RawMessage {
  return {
    id,
    authorId,
    timestamp,
    content: id,
  };
}

describe('channelMessageAuthority', () => {
  beforeEach(() => {
    _resetAllIndexesForTesting();
    bindChannelMessageBuckets(ref({}));
  });

  it('insertChannelMessageFromHistory dedupes by id and materializes the sorted bucket once', () => {
    replaceChannelMessagesFromHistory('ch-1', [
      makeMessage('m2', 'u2', '2026-04-10T12:02:00.000Z'),
    ]);

    const firstInsert = insertChannelMessageFromHistory(
      'ch-1',
      makeMessage('m1', 'u1', '2026-04-10T12:01:00.000Z'),
    );
    expect(firstInsert.inserted).toBe(true);
    expect(firstInsert.messages.map((message) => message.id)).toEqual([
      'm1',
      'm2',
    ]);

    const duplicateInsert = insertChannelMessageFromHistory(
      'ch-1',
      makeMessage('m1', 'u1', '2026-04-10T12:01:00.000Z'),
    );
    expect(duplicateInsert.inserted).toBe(false);
    expect(duplicateInsert.messages.map((message) => message.id)).toEqual([
      'm1',
      'm2',
    ]);
  });

  it('updateChannelMessageInBucket patches an existing row without reintroducing direct index writes', () => {
    replaceChannelMessagesFromHistory('ch-2', [
      makeMessage('m1', 'u1', '2026-04-10T12:01:00.000Z'),
    ]);

    const updated = updateChannelMessageInBucket('ch-2', 'm1', {
      content: 'patched',
    });
    expect(updated.updated).toBe(true);
    expect(updated.messages[0]?.content).toBe('patched');

    const missing = updateChannelMessageInBucket('ch-2', 'missing', {
      content: 'ignored',
    });
    expect(missing.updated).toBe(false);
    expect(missing.messages.map((message) => message.id)).toEqual(['m1']);
  });

  it('replaceChannelMessagesFromHistory does not drop rows when the channel is already populated', () => {
    replaceChannelMessagesFromHistory('ch-merge', [
      makeMessage('m1', 'u1', '2026-04-10T12:01:00.000Z'),
      makeMessage('m2', 'u2', '2026-04-10T12:02:00.000Z'),
      makeMessage('m3', 'u3', '2026-04-10T12:03:00.000Z'),
    ]);
    replaceChannelMessagesFromHistory('ch-merge', [
      makeMessage('m1', 'u1', '2026-04-10T12:01:00.000Z'),
      makeMessage('m2', 'u2', '2026-04-10T12:02:00.000Z'),
    ]);
    const list = hasChannelMessageInBucket('ch-merge', 'm3');
    expect(list).toBe(true);
  });

  it('restoreChannelMessageReactions clones rollback payloads and exposes presence checks', () => {
    replaceChannelMessagesFromHistory('ch-3', [
      makeMessage('m1', 'u1', '2026-04-10T12:01:00.000Z'),
    ]);

    const previousReactions = [{ emoji: ':wave:', count: 1, userIds: ['u2'] }];

    const restored = restoreChannelMessageReactions(
      'ch-3',
      'm1',
      previousReactions,
    );

    expect(restored.updated).toBe(true);
    expect(hasChannelMessageInBucket('ch-3', 'm1')).toBe(true);
    expect(hasChannelMessageInBucket('ch-3', 'missing')).toBe(false);
    expect(restored.messages[0]?.reactions).toEqual(previousReactions);
    expect(restored.messages[0]?.reactions?.[0]?.userIds).not.toBe(
      previousReactions[0]?.userIds,
    );

    previousReactions[0]?.userIds.push('u9');
    expect(restored.messages[0]?.reactions?.[0]?.userIds).toEqual(['u2']);
  });
});
