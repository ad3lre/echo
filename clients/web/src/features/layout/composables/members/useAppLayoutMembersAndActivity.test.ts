import { describe, expect, it } from 'vitest';
import { isMembersColumnVisibleForShell } from './useAppLayoutMembersAndActivity';

const base = {
  useCompactPhoneTabShell: false,
  isExploreView: false,
  memberPanelCollapsedEffective: false,
  isDmUiContext: false,
  isServerEmptyOnboarding: false,
  isViewingVoiceChannel: false,
  vcActivitySurfaceOpen: false,
  callOverlayType: 'none',
  mainSurfaceType: 'serverText' as const,
};

describe('isMembersColumnVisibleForShell', () => {
  it('shows members on a normal guild text surface', () => {
    expect(isMembersColumnVisibleForShell(base)).toBe(true);
  });

  it('hides members while viewing a voice channel', () => {
    expect(
      isMembersColumnVisibleForShell({
        ...base,
        isViewingVoiceChannel: true,
      }),
    ).toBe(false);
  });

  it('hides members while VC activities are open even on a text channel', () => {
    expect(
      isMembersColumnVisibleForShell({
        ...base,
        isViewingVoiceChannel: false,
        vcActivitySurfaceOpen: true,
      }),
    ).toBe(false);
  });
});
