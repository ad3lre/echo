import { describe, expect, it } from 'vitest';
import type { EchoWorkspaceEventSummary } from '@/api/echoClient';
import {
  formatStageModeLabel,
  isStageEventWithinPlanningWindow,
  parseStageModeFromDescription,
  pickNearestStagePlanningEvent,
  withStageModeInDescription,
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
  it('parses stage mode from description', () => {
    expect(
      parseStageModeFromDescription('Join us [stage:youtube_live] tonight'),
    ).toBe('youtube_live');
  });

  it('maps legacy activity youtube tag to youtube live', () => {
    expect(parseStageModeFromDescription('Old [activity:youtube] tag')).toBe(
      'youtube_live',
    );
  });

  it('parses voice-only stage mode tags', () => {
    expect(parseStageModeFromDescription('Audio only [stage:voice_only]')).toBe(
      'voice_only',
    );
    expect(parseStageModeFromDescription('Legacy [stage:vc_only]')).toBe(
      'voice_only',
    );
  });

  it('formats stage mode labels', () => {
    expect(formatStageModeLabel('youtube_live')).toBe('YouTube live');
    expect(formatStageModeLabel('voice_only')).toBe('Voice only');
  });

  it('appends stage mode tag to description', () => {
    expect(withStageModeInDescription('Hello', true)).toContain(
      '[stage:youtube_live]',
    );
    expect(withStageModeInDescription('Hello', 'voice_only')).toContain(
      '[stage:voice_only]',
    );
    expect(withStageModeInDescription('[stage:youtube_live]', false)).toBe('');
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
