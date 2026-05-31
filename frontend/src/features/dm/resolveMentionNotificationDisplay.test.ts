import { describe, expect, it } from 'vitest';
import type { ChannelCategory } from '@/composables/useChannels';
import {
  mentionNotificationLabelLooksUnresolved,
  resolveMentionNotificationAuthorName,
  resolveMentionNotificationChannelLabel,
} from './resolveMentionNotificationDisplay';

const SRV = '100000000000000001';
const CH = '100000000000000002';
const CAT = '100000000000000003';

const categoriesByServer: Record<string, ChannelCategory[]> = {
  [SRV]: [
    {
      id: CAT,
      name: 'Text',
      channels: [{ id: CH, name: 'general', type: 'text' }],
    },
  ],
};

describe('mentionNotificationLabelLooksUnresolved', () => {
  it('flags raw graph ids and dm shell ids', () => {
    expect(mentionNotificationLabelLooksUnresolved(CH, CH)).toBe(true);
    expect(
      mentionNotificationLabelLooksUnresolved('dm-user-1', 'dm-user-1'),
    ).toBe(true);
  });

  it('accepts human labels', () => {
    expect(mentionNotificationLabelLooksUnresolved('general')).toBe(false);
    expect(mentionNotificationLabelLooksUnresolved('Alex')).toBe(false);
  });
});

describe('resolveMentionNotificationChannelLabel', () => {
  it('resolves guild channel from workspace tree', () => {
    expect(
      resolveMentionNotificationChannelLabel({
        channelId: CH,
        findChannelContextById: () => null,
        categoriesByServer,
        echoDmPeerByChannelId: new Map(),
        echoDmThreadIds: new Set(),
        groupDMs: {},
        users: [],
      }),
    ).toBe('general');
  });

  it('resolves persisted DM via peer map', () => {
    const dmCh = '100000000000000099';
    expect(
      resolveMentionNotificationChannelLabel({
        channelId: dmCh,
        findChannelContextById: () => null,
        categoriesByServer: {},
        echoDmPeerByChannelId: new Map([[dmCh, 'user-peer']]),
        echoDmThreadIds: new Set([dmCh]),
        groupDMs: {},
        users: [{ id: 'user-peer', name: 'River' }],
      }),
    ).toBe('River');
  });

  it('never returns the raw channel id for unknown guild channels', () => {
    const unknown = '100000000000000088';
    const label = resolveMentionNotificationChannelLabel({
      channelId: unknown,
      findChannelContextById: () => null,
      categoriesByServer: {},
      echoDmPeerByChannelId: new Map(),
      echoDmThreadIds: new Set(),
      groupDMs: {},
      users: [],
    });
    expect(label).toBe('Channel');
    expect(label).not.toBe(unknown);
  });
});

describe('resolveMentionNotificationAuthorName', () => {
  it('prefers message author display name', () => {
    expect(
      resolveMentionNotificationAuthorName({
        userId: '100000000000000010',
        authorDisplayName: 'Casey',
        users: [],
      }),
    ).toBe('Casey');
  });

  it('falls back to roster name then Someone', () => {
    expect(
      resolveMentionNotificationAuthorName({
        userId: 'u1',
        users: [{ id: 'u1', name: 'Jamie' }],
      }),
    ).toBe('Jamie');
    expect(
      resolveMentionNotificationAuthorName({
        userId: '100000000000000010',
        users: [],
      }),
    ).toBe('Someone');
  });
});
