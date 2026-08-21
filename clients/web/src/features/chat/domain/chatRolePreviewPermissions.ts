/**
 * Server role-preview permission math (channel + category overrides).
 *
 * **Routed channel vs UI surface:** All “can send” evaluation in the app is keyed to the
 * **currently routed** `activeChannelId` / `activeChannel` from layout, not to a secondary
 * UI surface (e.g. voice side chat uses the same routed channel as the main shell). If you add
 * split view, pop-out windows, or “send from channel A while viewing B”, this model must be
 * revisited — pass an explicit target channel into the evaluator instead of assuming routing.
 */
import type { ChannelPermissionKey, ChannelSummary } from '@shared/types';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import { resolveEffectiveChannelPermission } from '@/features/chat/domain/channelPermissions';

export type PreviewChannelPermission =
  | 'viewChannel'
  | 'sendMessages'
  | 'mentionEveryone'
  | 'createInvite'
  | 'manageMessages'
  | 'manageChannel'
  | 'connect'
  | 'video'
  | 'useExternalEmoji';

export const PREVIEW_CHANNEL_PERMISSION_MAP: Record<
  PreviewChannelPermission,
  { ui: string; channel: ChannelPermissionKey }
> = {
  viewChannel: { ui: 'viewChannels', channel: 'viewChannel' },
  sendMessages: { ui: 'sendMessages', channel: 'sendMessages' },
  mentionEveryone: { ui: 'mentionEveryone', channel: 'mentionEveryone' },
  createInvite: { ui: 'createInvite', channel: 'createInvite' },
  manageMessages: { ui: 'manageMessages', channel: 'manageMessages' },
  manageChannel: { ui: 'manageChannels', channel: 'manageChannel' },
  connect: { ui: 'connectToVoice', channel: 'connect' },
  video: { ui: 'video', channel: 'video' },
  useExternalEmoji: { ui: 'useExternalEmoji', channel: 'useExternalEmoji' },
};

/** Preview role UI check when preview is already known to match the selected server. */
export function previewRoleHasUiPermission(
  uiPermissions: readonly string[] | undefined,
  permission: string,
): boolean {
  const set = new Set(uiPermissions ?? []);
  return set.has('administrator') || set.has(permission);
}

export type RolePreviewForPermissions = {
  serverId: string;
  uiPermissions: readonly string[];
};

export function resolvePreviewChannelPermission(
  preview: RolePreviewForPermissions | null | undefined,
  selectedServerId: string | undefined,
  channel: ChannelSummary | null | undefined,
  categoryDefaults: Partial<Record<ChannelPermissionKey, boolean>> | undefined,
  permission: PreviewChannelPermission,
  hasUiPermission: (permission: string) => boolean,
): boolean {
  if (!preview || preview.serverId !== selectedServerId) return true;
  if (hasUiPermission('administrator')) return true;
  const mapping = PREVIEW_CHANNEL_PERMISSION_MAP[permission];
  return resolveEffectiveChannelPermission({
    baseAllowed: hasUiPermission(mapping.ui),
    categoryDefaults,
    channelPermissions: channel?.channelPermissions ?? null,
    key: mapping.channel,
  });
}

export function findChannelContextById(
  categories: ChannelCategory[],
  channelId: string | null | undefined,
): { channel: ChannelSummary; category: ChannelCategory } | null {
  if (!channelId) return null;
  for (const category of categories) {
    const channel = category.channels.find((entry) => entry.id === channelId);
    if (channel) return { channel, category };
  }
  return null;
}

/** Effective `useExternalEmoji` from category defaults + channel overrides (no role preview). */
export function liveChannelAllowsUseExternalEmoji(ctx: {
  channel: ChannelSummary;
  category: ChannelCategory;
}): boolean {
  return resolveEffectiveChannelPermission({
    baseAllowed: true,
    categoryDefaults: ctx.category.channelPermissionDefaults,
    channelPermissions: ctx.channel.channelPermissions ?? null,
    key: 'useExternalEmoji',
  });
}

/**
 * Binary flags passed into `rolePreviewOutgoingBlockReason` after `contentTypes` is normalized
 * in `useChatPermissions` (`poll` → includesPoll, `media` → includesMedia). Add matching flags
 * here when you extend `OutgoingContentType` (e.g. sticker) and implement the new branch order.
 */
export type RolePreviewOutgoingAttempt = {
  includesPoll: boolean;
  includesMedia: boolean;
  includesExternalEmoji: boolean;
  includesMassMention: boolean;
};

export type RolePreviewOutgoingBlockReasonCode =
  | 'send_messages'
  | 'create_polls'
  | 'send_media'
  | 'use_external_emoji'
  | 'mention_everyone';

export function rolePreviewOutgoingBlockReasonCode(
  p: {
    isRolePreviewActiveForServer: boolean;
    activeChannel: { id: string } | null | undefined;
    channelId: string;
    canSendMessages: boolean;
    canCreatePolls: boolean;
    canUploadFiles: boolean;
    canUseExternalEmoji: boolean;
    canMentionEveryone: boolean;
  } & RolePreviewOutgoingAttempt,
): RolePreviewOutgoingBlockReasonCode | null {
  if (
    p.isRolePreviewActiveForServer &&
    p.activeChannel &&
    p.channelId === p.activeChannel.id &&
    !p.canSendMessages
  ) {
    return 'send_messages';
  }
  if (p.isRolePreviewActiveForServer && p.includesPoll && !p.canCreatePolls) {
    return 'create_polls';
  }
  if (p.isRolePreviewActiveForServer && p.includesMedia && !p.canUploadFiles) {
    return 'send_media';
  }
  if (
    p.isRolePreviewActiveForServer &&
    p.includesExternalEmoji &&
    !p.canUseExternalEmoji
  ) {
    return 'use_external_emoji';
  }
  if (
    p.isRolePreviewActiveForServer &&
    p.includesMassMention &&
    !p.canMentionEveryone
  ) {
    return 'mention_everyone';
  }
  return null;
}
