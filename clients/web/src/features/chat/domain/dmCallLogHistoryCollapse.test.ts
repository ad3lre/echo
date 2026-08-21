import { describe, expect, it } from 'vitest';
import type { MessageWithAuthor } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  DM_CALL_LOG_HISTORY_VISIBLE_CAP,
  DM_CALL_ROLLUP_MESSAGE_ID_PREFIX,
  buildDmCallLogPresentation,
  dmCallRollupRevealKey,
  isDmCallRollupCollapseMessageId,
  parseDmCallRollupMessageId,
} from './dmCallLogHistoryCollapse';
import { buildMessageWithAuthor } from '@/features/chat/domain/messageWithAuthor';

function rawCallLog(id: string, ts: string): RawMessage {
  return {
    id,
    authorId: 'system',
    systemMessage: true,
    authorDisplayName: 'Call',
    timestamp: ts,
    content: '📞 test',
    contentText: '📞 test',
  };
}

function mwFromRaw(
  raw: RawMessage,
): MessageWithAuthor & { channelName?: string } {
  return buildMessageWithAuthor(raw, new Map(), {});
}

describe('buildDmCallLogPresentation', () => {
  it('leaves short runs unchanged', () => {
    const ids = ['m1', 'm2'];
    const entities = new Map<string, RawMessage>([
      ['m1', rawCallLog('local_dm_call_log:a', '2025-01-01T00:00:00.000Z')],
      ['m2', rawCallLog('local_dm_call_log:b', '2025-01-01T00:01:00.000Z')],
    ]);
    const messages = new Map<
      string,
      MessageWithAuthor & { channelName?: string }
    >();
    for (const id of ids) {
      const r = entities.get(id)!;
      messages.set(id, mwFromRaw(r));
    }
    const out = buildDmCallLogPresentation(
      ids,
      entities,
      messages,
      'dm-ch-1',
      new Set(),
    );
    expect(out.displayOrderedIds).toEqual(ids);
    expect(out.mergedEntities.size).toBe(entities.size);
  });

  it('collapses long runs to rollup + last N visible', () => {
    const ids: string[] = [];
    const entities = new Map<string, RawMessage>();
    const messages = new Map<
      string,
      MessageWithAuthor & { channelName?: string }
    >();
    for (let i = 0; i < 7; i++) {
      const id = `local_dm_call_log:test${i}`;
      ids.push(id);
      const raw = rawCallLog(id, `2025-01-01T00:0${i}:00.000Z`);
      entities.set(id, raw);
      messages.set(id, mwFromRaw(raw));
    }
    const out = buildDmCallLogPresentation(
      ids,
      entities,
      messages,
      'dm-ch-1',
      new Set(),
    );
    expect(out.displayOrderedIds.length).toBe(
      1 + DM_CALL_LOG_HISTORY_VISIBLE_CAP,
    );
    expect(isDmCallRollupCollapseMessageId(out.displayOrderedIds[0]!)).toBe(
      true,
    );
    const tail = out.displayOrderedIds.slice(1);
    expect(tail).toEqual(ids.slice(-DM_CALL_LOG_HISTORY_VISIBLE_CAP));
  });

  it('expands full run when reveal key is set', () => {
    const ids: string[] = [];
    const entities = new Map<string, RawMessage>();
    const messages = new Map<
      string,
      MessageWithAuthor & { channelName?: string }
    >();
    for (let i = 0; i < 7; i++) {
      const id = `local_dm_call_log:exp${i}`;
      ids.push(id);
      const raw = rawCallLog(id, `2025-01-01T00:0${i}:00.000Z`);
      entities.set(id, raw);
      messages.set(id, mwFromRaw(raw));
    }
    const reveal = new Set([dmCallRollupRevealKey('dm-ch-1', ids[0]!)]);
    const out = buildDmCallLogPresentation(
      ids,
      entities,
      messages,
      'dm-ch-1',
      reveal,
    );
    expect(out.displayOrderedIds).toEqual(ids);
  });
});

describe('parseDmCallRollupMessageId', () => {
  it('round-trips rollup ids', () => {
    const firstHidden = 'local_dm_call_log:x';
    const id = `${DM_CALL_ROLLUP_MESSAGE_ID_PREFIX}dm-ch-1:${firstHidden}`;
    expect(parseDmCallRollupMessageId(id)).toEqual({
      channelId: 'dm-ch-1',
      firstHiddenMessageId: firstHidden,
    });
  });
});
