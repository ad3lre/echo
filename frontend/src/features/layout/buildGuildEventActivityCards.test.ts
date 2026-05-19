import { describe, expect, it } from 'vitest';
import { buildGuildEventActivityCardsFromMyRsvps } from '@/features/layout/buildGuildEventActivityCards';
import type { EchoWorkspaceMyEventRsvp } from '@/services/domain/workspaceEchoApiSnapshot';

function rsvp(p: Partial<EchoWorkspaceMyEventRsvp>): EchoWorkspaceMyEventRsvp {
  return {
    id: 'e1',
    serverId: 'srv',
    serverName: 'S',
    serverImageUrl: '',
    title: 'T',
    imageUrl: '',
    startsAt: '2026-06-01T18:00:00.000Z',
    endsAt: '2026-06-01T19:00:00.000Z',
    channelId: null,
    channelName: null,
    goingCount: 0,
    maxAttendees: null,
    ...p,
  };
}

describe('buildGuildEventActivityCardsFromMyRsvps', () => {
  it('skips echo home, sorts by start time, and formats channel labels', () => {
    const cards = buildGuildEventActivityCardsFromMyRsvps({
      rsvps: [
        rsvp({
          id: 'late',
          serverId: 'srv-a',
          serverName: 'Alpha',
          title: 'Later',
          imageUrl: 'https://example.com/cover.png',
          startsAt: '2026-07-01T12:00:00.000Z',
          endsAt: '2026-07-01T13:00:00.000Z',
          channelId: 'ch1',
          channelName: 'announcements',
          goingCount: 5,
        }),
        rsvp({
          id: 'echo-skip',
          serverId: 'echo',
          serverName: 'Echo',
          title: 'X',
          startsAt: '2026-05-01T12:00:00.000Z',
          endsAt: '2026-05-01T13:00:00.000Z',
        }),
        rsvp({
          id: 'early',
          serverId: 'srv-b',
          serverName: 'Beta',
          title: 'Sooner',
          startsAt: '2026-06-10T09:00:00.000Z',
          endsAt: '2026-06-10T10:00:00.000Z',
          channelId: null,
          channelName: null,
          goingCount: 1,
        }),
      ],
      getChannelDisplayName: (n) => `#${n}`,
    });

    expect(cards.map((c) => c.eventId)).toEqual(['early', 'late']);
    expect(cards[0]!.title).toBe('Sooner');
    expect(cards[1]!.channelDisplayName).toBe('#announcements');
    expect(cards[1]!.goingCount).toBe(5);
    expect(cards[1]!.eventImageUrl).toBe('https://example.com/cover.png');
  });
});
