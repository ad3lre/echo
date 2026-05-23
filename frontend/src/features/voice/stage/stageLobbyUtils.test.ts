import { describe, expect, it } from 'vitest';
import type { EchoWorkspaceEventSummary } from '@/api/echoClient';
import {
  formatVcActivityDisplayTitle,
  isStageEventWithinPlanningWindow,
  parsePlannedActivityKeyFromDescription,
  pickNearestStagePlanningEvent,
} from '@/features/voice/stage/stageLobbyUtils';

function ev(
  partial: Partial<EchoWorkspaceEventSummary> & {
    channelId: string;
    startsAt: string;
    endsAt: string;
  },
): EchoWorkspaceEventSummary {
  return {
    id: 'e1',
    serverId: 's1',
    title: 'Test',
    description: '',
    imageUrl: '',
    timezoneLabel: null,
    channelName: null,
    customLocation: null,
    goingCount: 0,
    maxAttendees: null,
    userRsvp: null,
    ...partial,
  };
}

describe('stageLobbyUtils', () => {
  it('parses activity tag from description', () => {
    expect(
      parsePlannedActivityKeyFromDescription(
        'Join us [activity:youtube] tonight',
      ),
    ).toBe('youtube');
  });

  it('formats activity keys for display', () => {
    expect(formatVcActivityDisplayTitle('youtube')).toBe('YouTube');
    expect(formatVcActivityDisplayTitle('tic_tac_toe')).toBe('Tic-Tac-Toe');
  });

  it('picks stage event within one hour', () => {
    const now = Date.parse('2026-05-22T12:00:00Z');
    const rows = [
      ev({
        channelId: 'stage-1',
        startsAt: '2026-05-22T12:30:00Z',
        endsAt: '2026-05-22T14:00:00Z',
      }),
      ev({
        channelId: 'other',
        startsAt: '2026-05-22T12:15:00Z',
        endsAt: '2026-05-22T13:00:00Z',
      }),
    ];
    const picked = pickNearestStagePlanningEvent(rows, 'stage-1', now);
    expect(picked?.id).toBe('e1');
    expect(isStageEventWithinPlanningWindow(picked!, now)).toBe(true);
  });
});
