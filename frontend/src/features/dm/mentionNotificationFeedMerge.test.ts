import { describe, expect, it } from 'vitest';
import type { EchoMentionNotificationRow } from '@shared/types';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import {
  MENTION_NOTIFICATION_FAILED_PREVIEW,
  MENTION_NOTIFICATION_STUB_PREVIEW,
} from '@/features/dm/mentionNotificationAuthority';
import {
  mapServerMentionRowsToDmRows,
  mergeMentionNotificationRows,
} from './mentionNotificationFeedMerge';

function serverRow(
  partial: Partial<EchoMentionNotificationRow> &
    Pick<EchoMentionNotificationRow, 'channelId' | 'messageId'>,
): EchoMentionNotificationRow {
  return {
    key: `${partial.channelId}:${partial.messageId}`,
    channelKind: 'server',
    authorId: 'author-1',
    authorName: 'Ada',
    content: 'hey @you',
    timestamp: '2026-05-31T12:00:00.000Z',
    mentionKinds: ['user'],
    ...partial,
  };
}

function clientRow(
  partial: Partial<DmMentionNotificationRow> &
    Pick<DmMentionNotificationRow, 'channelId' | 'messageId'>,
): DmMentionNotificationRow {
  return {
    key: `${partial.channelId}:${partial.messageId}`,
    channelLabel: 'general',
    authorId: 'author-1',
    authorName: 'Ada',
    preview: 'live message',
    timestamp: '2026-05-31T12:00:00.000Z',
    mentionKinds: ['user'],
    ...partial,
  };
}

describe('mapServerMentionRowsToDmRows', () => {
  it('derives a single-line preview from raw content', () => {
    const rows = mapServerMentionRowsToDmRows([
      serverRow({
        channelId: 'c1',
        messageId: 'm1',
        content: 'line one\nline two @you',
      }),
    ]);
    expect(rows[0]?.key).toBe('c1:m1');
    expect(rows[0]?.preview).toContain('line one');
    expect(rows[0]?.preview).not.toContain('\n');
  });

  it('falls back to an ellipsis for empty content', () => {
    const rows = mapServerMentionRowsToDmRows([
      serverRow({ channelId: 'c1', messageId: 'm1', content: '' }),
    ]);
    expect(rows[0]?.preview).toBe('…');
  });
});

describe('mergeMentionNotificationRows', () => {
  it('prefers server rows and appends client-only live rows', () => {
    const server = mapServerMentionRowsToDmRows([
      serverRow({
        channelId: 'c1',
        messageId: 'm1',
        timestamp: '2026-05-31T12:00:00.000Z',
      }),
    ]);
    const client = [
      clientRow({
        channelId: 'c2',
        messageId: 'm2',
        timestamp: '2026-05-31T13:00:00.000Z',
      }),
    ];
    const merged = mergeMentionNotificationRows(server, client);
    expect(merged.map((r) => r.key)).toEqual(['c2:m2', 'c1:m1']);
  });

  it('keeps the server body when both feeds have the row', () => {
    const server = mapServerMentionRowsToDmRows([
      serverRow({ channelId: 'c1', messageId: 'm1', content: 'server body' }),
    ]);
    const client = [
      clientRow({ channelId: 'c1', messageId: 'm1', preview: 'client body' }),
    ];
    const merged = mergeMentionNotificationRows(server, client);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.preview).toBe('server body');
  });

  it('lets a real client body replace a server placeholder', () => {
    const server: DmMentionNotificationRow[] = [
      clientRow({
        channelId: 'c1',
        messageId: 'm1',
        preview: MENTION_NOTIFICATION_STUB_PREVIEW,
      }),
    ];
    const client = [
      clientRow({ channelId: 'c1', messageId: 'm1', preview: 'real body' }),
    ];
    const merged = mergeMentionNotificationRows(server, client);
    expect(merged[0]?.preview).toBe('real body');
  });

  it('does not let a placeholder client row override a real server body', () => {
    const server = mapServerMentionRowsToDmRows([
      serverRow({ channelId: 'c1', messageId: 'm1', content: 'server body' }),
    ]);
    const client = [
      clientRow({
        channelId: 'c1',
        messageId: 'm1',
        preview: MENTION_NOTIFICATION_FAILED_PREVIEW,
      }),
    ];
    const merged = mergeMentionNotificationRows(server, client);
    expect(merged[0]?.preview).toBe('server body');
  });

  it('drops client stub when server covers the same channel with a different messageId', () => {
    // The attention snapshot uses `latestUnreadMessageId` (m10 — a plain message)
    // as the stub anchor, while the server found the actual @mention at m7.
    // Without this fix both rows would appear: one real, one phantom loading stub.
    const server = mapServerMentionRowsToDmRows([
      serverRow({ channelId: 'c1', messageId: 'm7', content: 'hey @you' }),
    ]);
    const client = [
      clientRow({
        channelId: 'c1',
        messageId: 'm10',
        preview: MENTION_NOTIFICATION_STUB_PREVIEW,
      }),
    ];
    const merged = mergeMentionNotificationRows(server, client);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.messageId).toBe('m7');
    expect(merged[0]?.preview).toBe('hey @you');
  });

  it('drops a client stub when another client row for the channel already resolved', () => {
    const mentionId = '1420070400000000001';
    const newerUnreadId = '1420070400000000099';
    const client = [
      clientRow({
        channelId: 'c1',
        messageId: mentionId,
        preview: 'discord @you ping',
        timestamp: '2026-06-06T12:00:00.000Z',
      }),
      clientRow({
        channelId: 'c1',
        messageId: newerUnreadId,
        preview: MENTION_NOTIFICATION_STUB_PREVIEW,
        timestamp: '2026-06-06T12:01:00.000Z',
      }),
    ];
    const merged = mergeMentionNotificationRows([], client);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.messageId).toBe(mentionId);
    expect(merged[0]?.preview).toBe('discord @you ping');
  });

  it('keeps a real client row for the same channel even when server covers it', () => {
    // A live websocket message (m11) arrived after the server fetch — it has a
    // resolved preview and should always be kept alongside the server row.
    const server = mapServerMentionRowsToDmRows([
      serverRow({ channelId: 'c1', messageId: 'm7', content: 'hey @you' }),
    ]);
    const client = [
      clientRow({
        channelId: 'c1',
        messageId: 'm11',
        preview: 'live mention @you',
      }),
    ];
    const merged = mergeMentionNotificationRows(server, client);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.messageId).sort()).toEqual(['m11', 'm7']);
  });
});
