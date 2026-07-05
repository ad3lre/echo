import type { MobileBottomTabId } from '@/features/layout/mobileBottomTab';

/** Leaving the Servers tab should dismiss guild-only phone overlays. */
export function shouldResetPhoneServersUiState(
  prevTab: MobileBottomTabId,
  nextTab: MobileBottomTabId,
): boolean {
  return prevTab === 'servers' && nextTab !== 'servers';
}

/** When entering the phone tab shell with an expanded members panel, reopen the overlay. */
export function shouldOpenPhoneMembersOverlayOnEnteringPhone(opts: {
  memberPanelCollapsed: boolean;
}): boolean {
  return !opts.memberPanelCollapsed;
}

export function hasActivePhoneGuildChannel(
  selectedServerId: string | null | undefined,
  activeChannelId: string,
): boolean {
  return Boolean(selectedServerId?.trim() && activeChannelId.trim());
}
