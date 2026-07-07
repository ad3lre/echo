import type { VcActivityUiPhase } from '@/features/voice/vcActivityTypes';

export type GuildMobileVoiceDockVisibilitySnapshot = {
  /** Connected to guild voice on compact mobile (base gate). */
  connected: boolean;
  voiceSideChatCollapsed: boolean;
  isSettingsModalOpen: boolean;
  isServerSettingsModalOpen: boolean;
  guildMobileVcLobbyOpen: boolean;
  forwardModalOpen: boolean;
  vcActivityPhase: VcActivityUiPhase;
  mobileChannelSheetOpen: boolean;
  mobileMembersOverlayOpen: boolean;
  memberPopoutOpen: boolean;
};

/** Full-screen or sheet overlays that must sit above the floating voice dock. */
export function guildMobileVoiceDockObscuredByOverlay(
  snapshot: GuildMobileVoiceDockVisibilitySnapshot,
): boolean {
  if (!snapshot.voiceSideChatCollapsed) return true;
  if (snapshot.isSettingsModalOpen) return true;
  if (snapshot.isServerSettingsModalOpen) return true;
  if (snapshot.guildMobileVcLobbyOpen) return true;
  if (snapshot.forwardModalOpen) return true;
  if (snapshot.vcActivityPhase === 'pick') return true;
  if (snapshot.mobileChannelSheetOpen) return true;
  if (snapshot.mobileMembersOverlayOpen) return true;
  if (snapshot.memberPopoutOpen) return true;
  return false;
}

export function shouldShowGuildMobileVoiceDock(
  snapshot: GuildMobileVoiceDockVisibilitySnapshot,
): boolean {
  if (!snapshot.connected) return false;
  if (guildMobileVoiceDockObscuredByOverlay(snapshot)) return false;
  return true;
}
