import { describe, expect, it } from 'vitest';
import {
  guildMobileVoiceDockObscuredByOverlay,
  shouldShowGuildMobileVoiceDock,
  type GuildMobileVoiceDockVisibilitySnapshot,
} from './guildMobileVoiceDockVisibility';

const base: GuildMobileVoiceDockVisibilitySnapshot = {
  connected: true,
  voiceSideChatCollapsed: true,
  isSettingsModalOpen: false,
  isServerSettingsModalOpen: false,
  guildMobileVcLobbyOpen: false,
  forwardModalOpen: false,
  vcActivityPhase: 'closed',
  mobileChannelSheetOpen: false,
  mobileMembersOverlayOpen: false,
  memberPopoutOpen: false,
};

describe('shouldShowGuildMobileVoiceDock', () => {
  it('shows when connected and no overlay is open', () => {
    expect(shouldShowGuildMobileVoiceDock(base)).toBe(true);
  });

  it('hides when not connected', () => {
    expect(shouldShowGuildMobileVoiceDock({ ...base, connected: false })).toBe(
      false,
    );
  });

  it('hides when voice chat overlay is open', () => {
    expect(
      shouldShowGuildMobileVoiceDock({
        ...base,
        voiceSideChatCollapsed: false,
      }),
    ).toBe(false);
  });

  it('hides when user or server settings is open', () => {
    expect(
      shouldShowGuildMobileVoiceDock({
        ...base,
        isSettingsModalOpen: true,
      }),
    ).toBe(false);
    expect(
      shouldShowGuildMobileVoiceDock({
        ...base,
        isServerSettingsModalOpen: true,
      }),
    ).toBe(false);
  });

  it('hides for lobby sheet, forward modal, and activity picker', () => {
    expect(
      shouldShowGuildMobileVoiceDock({
        ...base,
        guildMobileVcLobbyOpen: true,
      }),
    ).toBe(false);
    expect(
      shouldShowGuildMobileVoiceDock({
        ...base,
        forwardModalOpen: true,
      }),
    ).toBe(false);
    expect(
      shouldShowGuildMobileVoiceDock({
        ...base,
        vcActivityPhase: 'pick',
      }),
    ).toBe(false);
  });

  it('hides for phone channel sheet, members overlay, and member popout', () => {
    expect(
      shouldShowGuildMobileVoiceDock({
        ...base,
        mobileChannelSheetOpen: true,
      }),
    ).toBe(false);
    expect(
      shouldShowGuildMobileVoiceDock({
        ...base,
        mobileMembersOverlayOpen: true,
      }),
    ).toBe(false);
    expect(
      shouldShowGuildMobileVoiceDock({
        ...base,
        memberPopoutOpen: true,
      }),
    ).toBe(false);
  });

  it('still shows during an active activity (not picker)', () => {
    expect(
      shouldShowGuildMobileVoiceDock({
        ...base,
        vcActivityPhase: 'youtube',
      }),
    ).toBe(true);
  });
});

describe('guildMobileVoiceDockObscuredByOverlay', () => {
  it('is false with a clear stack', () => {
    expect(guildMobileVoiceDockObscuredByOverlay(base)).toBe(false);
  });
});
