import { beforeEach, describe, expect, it } from 'vitest';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  getChannelIndex,
  _resetAllIndexesForTesting,
} from '@/features/chat/domain/channelMessageIndex';
import {
  ECHO_CHANNEL_MESSAGES_CLIENT_CAP_ACTIVE,
  ECHO_CHANNEL_MESSAGES_CLIENT_CAP_BACKGROUND,
  resolveEchoChannelMessagesClientCap,
} from '@/features/layout/echoWorkspace/echoChannelMessageWindow';
import {
  applyEchoChannelClientCapToBucket,
  writeSortedMessagesForChannel,
} from '@/features/chat/domain/channelMessageBucket';

/** Decimal snowflake-shaped id (passes `isEchoGraphId`). */
const CH = '1492135186257805312';

function msg(id: string, t: string, content: string): RawMessage {
  return {
    id,
    authorId: '1492135186257805313',
    timestamp: t,
    content,
  };
}

describe('writeSortedMessagesForChannel', () => {
  beforeEach(() => {
    _resetAllIndexesForTesting();
  });

  it('writes sorted slice into the bucket record', () => {
    const bucket: Record<string, RawMessage[]> = {};
    const raw = [
      msg('m2', '2026-04-10T13:00:01.000Z', 'b'),
      msg('m1', '2026-04-10T13:00:00.000Z', 'a'),
    ];
    const index = getChannelIndex(CH, raw);
    const sorted = writeSortedMessagesForChannel(bucket, CH, index);
    expect(sorted.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(bucket[CH]).toBe(sorted);
  });
});

describe('resolveEchoChannelMessagesClientCap', () => {
  it('uses the higher cap for the active channel id', () => {
    expect(resolveEchoChannelMessagesClientCap(CH, CH)).toBe(
      ECHO_CHANNEL_MESSAGES_CLIENT_CAP_ACTIVE,
    );
    expect(resolveEchoChannelMessagesClientCap(CH, `${CH}0`)).toBe(
      ECHO_CHANNEL_MESSAGES_CLIENT_CAP_BACKGROUND,
    );
  });
});

describe('applyEchoChannelClientCapToBucket', () => {
  beforeEach(() => {
    _resetAllIndexesForTesting();
  });

  it('trims head when over cap and flags active channel for pagination refresh', () => {
    const bucket: Record<string, RawMessage[]> = {};
    const rows: RawMessage[] = [];
    for (let i = 0; i < 6; i++) {
      rows.push(msg(`m${i}`, `2026-04-10T13:00:0${i}.000Z`, `c${i}`));
    }
    const index = getChannelIndex(CH, rows);
    writeSortedMessagesForChannel(bucket, CH, index);
    expect(bucket[CH]!.length).toBe(6);

    const r = applyEchoChannelClientCapToBucket(bucket, CH, {
      activeChannelId: CH,
      cap: 4,
    });
    expect(r.applied).toBe(true);
    expect(r.refreshHasMoreOlderForActiveChannel).toBe(true);
    expect(r.evictedHead.map((m) => m.id)).toEqual(['m0', 'm1']);
    expect(bucket[CH]!.length).toBe(4);
    expect(bucket[CH]!.map((m) => m.id)).toEqual(['m2', 'm3', 'm4', 'm5']);
  });

  it('does not set refresh flag when capped channel is not active', () => {
    const bucket: Record<string, RawMessage[]> = {};
    const rows = [
      msg('m0', '2026-04-10T13:00:00.000Z', 'a'),
      msg('m1', '2026-04-10T13:00:01.000Z', 'b'),
      msg('m2', '2026-04-10T13:00:02.000Z', 'c'),
    ];
    const index = getChannelIndex(CH, rows);
    writeSortedMessagesForChannel(bucket, CH, index);

    const r = applyEchoChannelClientCapToBucket(bucket, CH, {
      activeChannelId: '1492135186257805999',
      cap: 2,
    });
    expect(r.applied).toBe(true);
    expect(r.refreshHasMoreOlderForActiveChannel).toBe(false);
    expect(bucket[CH]!.length).toBe(2);
  });

  it('returns applied false when under cap', () => {
    const bucket: Record<string, RawMessage[]> = {};
    const rows = [msg('m0', '2026-04-10T13:00:00.000Z', 'a')];
    const index = getChannelIndex(CH, rows);
    writeSortedMessagesForChannel(bucket, CH, index);

    const r = applyEchoChannelClientCapToBucket(bucket, CH, {
      activeChannelId: CH,
      cap: 10,
    });
    expect(r.applied).toBe(false);
    expect(r.refreshHasMoreOlderForActiveChannel).toBe(false);
    expect(bucket[CH]!.length).toBe(1);
  });

  it('no-ops for non-graph channel id', () => {
    const bucket: Record<string, RawMessage[]> = {
      mock: [msg('m0', '2026-04-10T13:00:00.000Z', 'a')],
    };
    const r = applyEchoChannelClientCapToBucket(bucket, 'mock', {
      activeChannelId: 'mock',
      cap: 1,
    });
    expect(r.applied).toBe(false);
    expect(bucket.mock.length).toBe(1);
  });
});
