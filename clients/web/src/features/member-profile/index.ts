/**
 * Member profile UI. Layout mounts popouts; dm/settings reuse `widgets`.
 * Justification: popouts were parked in layout as “shell-owned”; other features
 * already imported them, so layout was composer and library at once.
 */
export type { MemberRoleManagementSpec } from './roleManagement';
export * from './widgets';

export { default as BioExternalLink } from './components/BioExternalLink.vue';
export { default as ExpandedProfileModal } from './components/ExpandedProfileModal.vue';
export { default as MemberProfileContent } from './components/MemberProfileContent.vue';
export { default as MemberProfileHeader } from './components/MemberProfileHeader.vue';
export { default as MemberProfilePopout } from './components/MemberProfilePopout.vue';
export { default as MemberProfileRolePanel } from './components/MemberProfileRolePanel.vue';
export { default as MemberProfileVoiceActions } from './components/MemberProfileVoiceActions.vue';
export { default as SelfProfilePopout } from './components/SelfProfilePopout.vue';
