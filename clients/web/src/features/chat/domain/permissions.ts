/**
 * Outgoing **UX** gate: maps caller-supplied capability booleans to a block reason string.
 * For live chat, those booleans must come from the server (`EchoChannelCapabilitiesDto`), not from
 * client-side RBAC math — see `useChatPermissions` + `useAppLayoutLiveChannelCaps`.
 */
import { rolePreviewOutgoingBlockReasonCode } from '@/features/chat/domain/chatRolePreviewPermissions';

export type OutgoingContentType =
  | 'text'
  | 'media'
  | 'poll'
  | 'externalEmoji'
  | 'massMention';

export function attemptFlags(contentTypes: OutgoingContentType[] | undefined) {
  const types = contentTypes?.length
    ? contentTypes
    : (['text'] as OutgoingContentType[]);
  return {
    includesPoll: types.includes('poll'),
    includesMedia: types.includes('media'),
    includesExternalEmoji: types.includes('externalEmoji'),
    includesMassMention: types.includes('massMention'),
  };
}

export type OutgoingBlockReason =
  | {
      kind: 'role_preview';
      code:
        | 'send_messages'
        | 'create_polls'
        | 'send_media'
        | 'use_external_emoji'
        | 'mention_everyone';
      roleName?: string | null;
    }
  | {
      kind: 'capability';
      code: 'send_messages' | 'use_external_emoji' | 'mention_everyone';
    };

export function getOutgoingBlockReasonDomain(params: {
  isRolePreviewActiveForServer: boolean;
  activeChannel: { id: string } | null | undefined;
  channelId: string;
  roleName?: string | null;
  canSendMessages: boolean;
  canCreatePolls: boolean;
  canUploadFiles: boolean;
  canUseExternalEmoji: boolean;
  canMentionEveryone: boolean;
  includesPoll: boolean;
  includesMedia: boolean;
  includesExternalEmoji: boolean;
  includesMassMention: boolean;
}): OutgoingBlockReason | null {
  const previewCode = rolePreviewOutgoingBlockReasonCode({
    isRolePreviewActiveForServer: params.isRolePreviewActiveForServer,
    activeChannel: params.activeChannel,
    channelId: params.channelId,
    canSendMessages: params.canSendMessages,
    canCreatePolls: params.canCreatePolls,
    canUploadFiles: params.canUploadFiles,
    canUseExternalEmoji: params.canUseExternalEmoji,
    canMentionEveryone: params.canMentionEveryone,
    includesPoll: params.includesPoll,
    includesMedia: params.includesMedia,
    includesExternalEmoji: params.includesExternalEmoji,
    includesMassMention: params.includesMassMention,
  });
  if (previewCode) {
    return {
      kind: 'role_preview',
      code: previewCode,
      roleName: params.roleName,
    };
  }
  if (!params.canSendMessages) {
    return { kind: 'capability', code: 'send_messages' };
  }
  if (
    !params.isRolePreviewActiveForServer &&
    params.includesExternalEmoji &&
    !params.canUseExternalEmoji
  ) {
    return { kind: 'capability', code: 'use_external_emoji' };
  }
  if (
    !params.isRolePreviewActiveForServer &&
    params.includesMassMention &&
    !params.canMentionEveryone
  ) {
    return { kind: 'capability', code: 'mention_everyone' };
  }
  return null;
}
