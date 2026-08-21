import { describe, it, expect } from 'vitest';
import { getOutgoingBlockReasonDomain } from '@/features/chat/domain/permissions';

describe('permissions domain', () => {
  it('returns null when allowed and no preview', () => {
    const r = getOutgoingBlockReasonDomain({
      isRolePreviewActiveForServer: false,
      activeChannel: null,
      channelId: 'c1',
      roleName: null,
      canSendMessages: true,
      canCreatePolls: true,
      canUploadFiles: true,
      canUseExternalEmoji: true,
      canMentionEveryone: true,
      includesPoll: false,
      includesMedia: false,
      includesExternalEmoji: false,
      includesMassMention: false,
    });
    expect(r).toBeNull();
  });

  it('blocks external emoji when not allowed and not preview', () => {
    const r = getOutgoingBlockReasonDomain({
      isRolePreviewActiveForServer: false,
      activeChannel: null,
      channelId: 'c1',
      roleName: null,
      canSendMessages: true,
      canCreatePolls: true,
      canUploadFiles: true,
      canUseExternalEmoji: false,
      canMentionEveryone: true,
      includesPoll: false,
      includesMedia: false,
      includesExternalEmoji: true,
      includesMassMention: false,
    });
    expect(r).toEqual({ kind: 'capability', code: 'use_external_emoji' });
  });

  it('blocks sends when live channel denies sendMessages', () => {
    const r = getOutgoingBlockReasonDomain({
      isRolePreviewActiveForServer: false,
      activeChannel: { id: 'c1' },
      channelId: 'c1',
      roleName: null,
      canSendMessages: false,
      canCreatePolls: false,
      canUploadFiles: false,
      canUseExternalEmoji: true,
      canMentionEveryone: true,
      includesPoll: false,
      includesMedia: false,
      includesExternalEmoji: false,
      includesMassMention: false,
    });
    expect(r).toEqual({ kind: 'capability', code: 'send_messages' });
  });

  it('blocks broadcast mentions when channel denies them', () => {
    const r = getOutgoingBlockReasonDomain({
      isRolePreviewActiveForServer: false,
      activeChannel: { id: 'c1' },
      channelId: 'c1',
      roleName: null,
      canSendMessages: true,
      canCreatePolls: true,
      canUploadFiles: true,
      canUseExternalEmoji: true,
      canMentionEveryone: false,
      includesPoll: false,
      includesMedia: false,
      includesExternalEmoji: false,
      includesMassMention: true,
    });
    expect(r).toEqual({ kind: 'capability', code: 'mention_everyone' });
  });
});
