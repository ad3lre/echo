import { describe, expect, it } from 'vitest';
import {
  buildReportChannelCandidates,
  buildReportMessageCandidates,
  buildReportUserCandidates,
} from '@/features/safety/useReportModalPickers';

describe('useReportModalPickers', () => {
  it('prioritizes friends and filters users by search', () => {
    const rows = buildReportUserCandidates({
      friendIds: ['f1'],
      serverMemberIds: { s1: ['f1', 'm1'] },
      users: [
        { id: 'f1', name: 'Alice Friend', pfp: '', status: 'online' },
        {
          id: 'm1',
          name: 'Bob Member',
          username: 'bob',
          pfp: '',
          status: 'offline',
        },
      ],
      query: 'bob',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('m1');
  });

  it('lists text channels across servers', () => {
    const rows = buildReportChannelCandidates({
      servers: [{ id: 's1', name: 'Guild', imageUrl: '' }],
      categoriesByServer: {
        s1: [
          {
            id: 'c1',
            name: 'General',
            channels: [
              { id: 'ch1', name: 'general', type: 'text' },
              { id: 'ch2', name: 'voice', type: 'voice' },
            ],
          },
        ],
      },
      query: 'gen',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.channelId).toBe('ch1');
  });

  it('returns recent messages for a channel', () => {
    const rows = buildReportMessageCandidates({
      channelId: 'ch1',
      users: [{ id: 'u1', name: 'Alice', pfp: '', status: 'online' }],
      messages: {
        ch1: [
          {
            id: 'm1',
            authorId: 'u1',
            timestamp: '2026-01-01T00:00:00.000Z',
            content: 'hello world',
          },
        ],
      },
      query: '',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.messageId).toBe('m1');
    expect(rows[0]?.preview).toContain('hello');
  });
});
