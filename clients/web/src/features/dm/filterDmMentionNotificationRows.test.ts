import { describe, expect, it } from 'vitest';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import type { DmMentionNotificationRow } from './collectDmMentionNotifications';
import {
  buildMentionNotificationSourceChips,
  filterDmMentionNotificationRows,
  mentionNotificationRowIsRead,
  rowMatchesNotificationSource,
} from './filterDmMentionNotificationRows';

function row(
  partial: Partial<DmMentionNotificationRow>,
): DmMentionNotificationRow {
  return {
    key: 'k',
    channelId: 'c1',
    channelLabel: 'general',
    messageId: 'm1',
    authorId: 'a1',
    authorName: 'A',
    preview: 'hi',
    timestamp: '2020-01-01T00:00:00.000Z',
    mentionKinds: ['user'],
    ...partial,
  };
}

/** Valid Echo graph ids (decimal snowflakes) for `isEchoGraphId` / channel tree. */
const SRV = '100000000000000001';
const CH_GUILD = '100000000000000002';
const CAT = '100000000000000003';

const categoriesByServer: Record<string, ChannelCategory[]> = {
  [SRV]: [
    {
      id: CAT,
      name: 'Cat',
      channels: [{ id: CH_GUILD, name: 'general', type: 'text' }],
    },
  ],
};

describe('mentionNotificationRowIsRead', () => {
  it('uses per-channel last-read vs message id', () => {
    expect(
      mentionNotificationRowIsRead(row({ channelId: 'c', messageId: '5' }), {
        c: '10',
      }),
    ).toBe(true);
    expect(
      mentionNotificationRowIsRead(row({ channelId: 'c', messageId: '15' }), {
        c: '10',
      }),
    ).toBe(false);
  });
});

describe('rowMatchesNotificationSource', () => {
  it('matches DMs', () => {
    expect(
      rowMatchesNotificationSource(
        row({ channelId: 'dm-u1' }),
        { kind: 'dms' },
        {},
        () => false,
      ),
    ).toBe(true);
    expect(
      rowMatchesNotificationSource(
        row({ channelId: 'ch-guild' }),
        { kind: 'dms' },
        categoriesByServer,
        () => false,
      ),
    ).toBe(false);
  });

  it('matches server by channel tree', () => {
    expect(
      rowMatchesNotificationSource(
        row({ channelId: CH_GUILD }),
        { kind: 'server', serverId: SRV },
        categoriesByServer,
        () => false,
      ),
    ).toBe(true);
    expect(
      rowMatchesNotificationSource(
        row({ channelId: CH_GUILD }),
        { kind: 'server', serverId: '100000000000000099' },
        categoriesByServer,
        () => false,
      ),
    ).toBe(false);
  });
});

describe('filterDmMentionNotificationRows', () => {
  it('applies unread preset', () => {
    const rows = [
      row({
        key: 'a',
        channelId: 'c',
        messageId: '100',
      }),
      row({
        key: 'b',
        channelId: 'c',
        messageId: '200',
      }),
    ];
    const out = filterDmMentionNotificationRows({
      rows,
      preset: 'unread',
      source: { kind: 'all' },
      readStateByChannelId: { c: '150' },
      categoriesByServer: {},
      isPersistedEchoDmThread: () => false,
    });
    expect(out.map((r) => r.messageId)).toEqual(['200']);
  });
});

describe('buildMentionNotificationSourceChips', () => {
  it('includes All and server chips only', () => {
    const chips = buildMentionNotificationSourceChips({
      rows: [
        row({
          channelId: 'dm-x',
          channelLabel: 'friend',
          key: '1',
        }),
        row({
          channelId: CH_GUILD,
          channelLabel: 'general',
          key: '2',
        }),
      ],
      categoriesByServer,
      serverNameById: { [SRV]: 'Acme' },
    });
    expect(chips.map((c) => c.key)).toEqual(['all', `server:${SRV}`]);
    expect(chips.find((c) => c.key === `server:${SRV}`)?.label).toBe('Acme');
    expect(chips.find((c) => c.key === 'all')?.visual.kind).toBe('none');
    expect(chips.find((c) => c.key === `server:${SRV}`)?.visual.kind).toBe(
      'none',
    );
  });

  it('uses server guild icons as image visuals when available', () => {
    const chips = buildMentionNotificationSourceChips({
      rows: [
        row({
          channelId: CH_GUILD,
          channelLabel: 'general',
          key: '1',
        }),
      ],
      categoriesByServer,
      serverNameById: { [SRV]: 'Acme' },
      serverImageUrlById: { [SRV]: 'https://cdn.example/guild.png' },
    });

    expect(chips.find((c) => c.key === `server:${SRV}`)?.visual).toEqual({
      kind: 'image',
      url: 'https://cdn.example/guild.png',
      alt: 'Acme',
    });
  });
});
