import { describe, expect, it } from 'vitest';
import {
  formatVoiceChannelUserLimitLabel,
  getVoiceChannelUserLimitTone,
  getVoiceChannelUserLimitUi,
  hasVoiceChannelUserLimit,
  shouldShowVoiceChannelSidebarOccupancy,
} from './voiceChannelUserLimit';

describe('voiceChannelUserLimit', () => {
  it('treats zero or missing limit as unlimited', () => {
    expect(hasVoiceChannelUserLimit(0)).toBe(false);
    expect(hasVoiceChannelUserLimit(undefined)).toBe(false);
    expect(getVoiceChannelUserLimitUi(3, 0)).toBeNull();
  });

  it('formats count/limit labels', () => {
    expect(formatVoiceChannelUserLimitLabel(2, 5)).toBe('2/5');
    expect(getVoiceChannelUserLimitUi(10, 10)?.label).toBe('10/10');
    expect(getVoiceChannelUserLimitUi(10, 10)?.tone).toBe('full');
  });

  it('uses warning tone near capacity', () => {
    expect(getVoiceChannelUserLimitTone(4, 5)).toBe('warning');
    expect(getVoiceChannelUserLimitTone(2, 5)).toBe('muted');
  });

  it('gates sidebar occupancy like channel list', () => {
    expect(
      shouldShowVoiceChannelSidebarOccupancy({
        participantCount: 2,
        userLimit: 5,
        channelId: 'c1',
        currentVoiceChannelId: 'c1',
        hoveredChannelId: 'c1',
      }),
    ).toBe(false);
    expect(
      shouldShowVoiceChannelSidebarOccupancy({
        participantCount: 2,
        userLimit: 5,
        channelId: 'c1',
        currentVoiceChannelId: null,
        hoveredChannelId: null,
      }),
    ).toBe(true);
  });
});
