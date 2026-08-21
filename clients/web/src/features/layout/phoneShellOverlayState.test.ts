import { describe, expect, it } from 'vitest';
import {
  hasActivePhoneGuildChannel,
  shouldOpenPhoneMembersOverlayOnEnteringPhone,
  shouldResetPhoneServersUiState,
} from '@/features/layout/phoneShellOverlayState';

describe('phoneShellOverlayState', () => {
  it('resets servers UI when leaving the servers tab', () => {
    expect(shouldResetPhoneServersUiState('servers', 'home')).toBe(true);
    expect(shouldResetPhoneServersUiState('servers', 'explore')).toBe(true);
    expect(shouldResetPhoneServersUiState('home', 'servers')).toBe(false);
    expect(shouldResetPhoneServersUiState('servers', 'servers')).toBe(false);
  });

  it('reopens overlay when entering phone with expanded members', () => {
    expect(
      shouldOpenPhoneMembersOverlayOnEnteringPhone({
        memberPanelCollapsed: false,
      }),
    ).toBe(true);
    expect(
      shouldOpenPhoneMembersOverlayOnEnteringPhone({
        memberPanelCollapsed: true,
      }),
    ).toBe(false);
  });

  it('detects active guild channel for phone navigation', () => {
    expect(hasActivePhoneGuildChannel('srv-1', 'ch-1')).toBe(true);
    expect(hasActivePhoneGuildChannel('srv-1', '')).toBe(false);
    expect(hasActivePhoneGuildChannel(null, 'ch-1')).toBe(false);
  });
});
