import type { OutgoingBlockReason } from '@/services/domain/permissions';

function rolePreviewRoleLabel(roleName: string | null | undefined): string {
  const trimmed = typeof roleName === 'string' ? roleName.trim() : '';
  return trimmed ? trimmed : 'This role';
}

export function formatOutgoingBlockReason(reason: OutgoingBlockReason): string {
  if (reason.kind === 'capability') {
    if (reason.code === 'send_messages')
      return 'You cannot send messages in this channel.';
    if (reason.code === 'use_external_emoji')
      return 'You cannot use custom emoji in this channel.';
    return 'You cannot mention @everyone or @active in this channel.';
  }

  const role = rolePreviewRoleLabel(reason.roleName);
  if (reason.code === 'send_messages')
    return `"${role}" cannot send messages in this channel.`;
  if (reason.code === 'create_polls')
    return `"${role}" cannot create polls here.`;
  if (reason.code === 'send_media')
    return `"${role}" cannot send media in this channel.`;
  if (reason.code === 'use_external_emoji')
    return `"${role}" cannot use external emoji in this channel.`;
  return `"${role}" cannot mention @everyone or @active in this channel.`;
}
