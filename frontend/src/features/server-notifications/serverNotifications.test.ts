import { describe, expect, it } from 'vitest';
import type { MentionEntity } from '@shared/types';
import {
  applyAttentionNotificationLevel,
  classifyAttentionPingKind,
  mergeAttentionPingKinds,
} from '@shared/attentionPing';
import { describeServerPingKind } from '@/features/server-notifications/serverPing';
import { getServerNotificationSummary } from '@/features/server-notifications/types';

describe('shared attention ping authority', () => {
  it('returns personal for a matching user mention', () => {
    const mentions: MentionEntity[] = [
      {
        id: '1',
        kind: 'user',
        label: 'Ada',
        userId: 'u9',
        start: 0,
        end: 4,
      },
    ];

    expect(
      classifyAttentionPingKind(mentions, {
        userId: 'u9',
        username: 'ada',
      }),
    ).toBe('personal');
  });

  it('returns broadcast for @everyone / @active', () => {
    expect(
      classifyAttentionPingKind(
        [
          {
            id: '1',
            kind: 'everyone',
            label: 'everyone',
            start: 0,
            end: 9,
          },
        ],
        { userId: 'u1' },
      ),
    ).toBe('broadcast');

    expect(
      classifyAttentionPingKind(
        [
          {
            id: '2',
            kind: 'active',
            label: 'Active',
            start: 0,
            end: 7,
          },
        ],
        { userId: 'u1' },
      ),
    ).toBe('broadcast');
  });

  it('returns role when roleId is in the member set', () => {
    const mentions: MentionEntity[] = [
      {
        id: '1',
        kind: 'role',
        label: 'Mods',
        roleId: 'role-mod',
        start: 0,
        end: 5,
      },
    ];

    expect(
      classifyAttentionPingKind(mentions, {
        userId: 'u1',
        memberRoleIds: new Set(['role-mod']),
      }),
    ).toBe('role');
    expect(
      classifyAttentionPingKind(mentions, {
        userId: 'u1',
        memberRoleIds: new Set(['other']),
      }),
    ).toBe(null);
  });

  it('prefers personal over role and broadcast', () => {
    const mentions: MentionEntity[] = [
      {
        id: '1',
        kind: 'everyone',
        label: 'everyone',
        start: 0,
        end: 9,
      },
      {
        id: '2',
        kind: 'role',
        label: 'Team',
        roleId: 'r1',
        start: 10,
        end: 15,
      },
      {
        id: '3',
        kind: 'user',
        label: 'Me',
        userId: 'u1',
        start: 16,
        end: 19,
      },
    ];

    expect(
      classifyAttentionPingKind(mentions, {
        userId: 'u1',
        memberRoleIds: new Set(['r1']),
      }),
    ).toBe('personal');
  });

  it('ignores channel mentions and merges by strength', () => {
    expect(
      classifyAttentionPingKind(
        [
          {
            id: '1',
            kind: 'channel',
            label: 'general',
            channelId: 'ch1',
            start: 0,
            end: 8,
          },
        ],
        { userId: 'u1' },
      ),
    ).toBe(null);

    expect(mergeAttentionPingKinds('broadcast', 'personal')).toBe('personal');
    expect(mergeAttentionPingKinds('role', 'broadcast')).toBe('role');
    expect(mergeAttentionPingKinds(null, 'role')).toBe('role');
  });

  it('applies notification levels consistently', () => {
    expect(
      applyAttentionNotificationLevel('mentions_direct', 'broadcast'),
    ).toBe(null);
    expect(applyAttentionNotificationLevel('mentions_direct', 'personal')).toBe(
      'personal',
    );
    expect(applyAttentionNotificationLevel('none', 'personal')).toBe(null);
  });

  it('classifies personal ping when target user id is stored on mention id', () => {
    expect(
      classifyAttentionPingKind(
        [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            kind: 'user',
            label: 'Friend',
            start: 0,
            end: 7,
          },
        ],
        { userId: '550e8400-e29b-41d4-a716-446655440001' },
      ),
    ).toBe('personal');
  });

  it('matches mention label to display name when username differs', () => {
    expect(
      classifyAttentionPingKind(
        [
          {
            id: 'm1',
            kind: 'user',
            label: 'Ada Lovelace',
            start: 0,
            end: 12,
          },
        ],
        {
          userId: 'other',
          username: 'ada_login',
          displayName: 'Ada Lovelace',
        },
      ),
    ).toBe('personal');
  });
});

describe('server notification presentation', () => {
  it('summarizes notification levels from shared types', () => {
    expect(getServerNotificationSummary('all')).toBe('All messages');
    expect(getServerNotificationSummary('mentions')).toBe(
      'Mentions and direct mentions',
    );
    expect(getServerNotificationSummary('mentions_direct')).toBe(
      'Direct mentions only',
    );
    expect(getServerNotificationSummary('none')).toBe('Nothing');
  });

  it('describes the shared ping kinds for the UI', () => {
    expect(describeServerPingKind('personal')).toBe('Unread personal mention');
    expect(describeServerPingKind('role')).toBe('Unread role mention');
    expect(describeServerPingKind('broadcast')).toBe(
      'Unread @everyone or @Active',
    );
  });
});
