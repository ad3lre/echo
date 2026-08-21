import { computed, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { createChatPermissions } from './useChatPermissions';

describe('useChatPermissions', () => {
  it('returns a timeout-specific send state when live channel caps report communication timeout', () => {
    const liveChannelCapabilities = ref({
      canViewChannel: true,
      canSendMessages: false,
      canCreatePolls: false,
      canUploadFiles: false,
      canMentionEveryone: false,
      canUseExternalEmoji: false,
      canManageChannel: false,
      communicationTimeoutActive: true,
      communicationTimeoutUntil: '2030-01-01T00:00:00.000Z',
      communicationTimeoutUntilEpochMs: Date.parse('2030-01-01T00:00:00.000Z'),
    });
    const api = createChatPermissions({
      activeChannelId: ref('c1'),
      activeChannel: computed(() => ({ id: 'c1' }) as any),
      rawCategories: computed(() => []),
      rolePreview: { value: null },
      selectedServerId: computed(() => 's1'),
      isRolePreviewActiveForServer: computed(() => false),
      isInDMMode: computed(() => false),
      isGroupDM: computed(() => false),
      liveChannelCapabilities,
    });

    expect(api.getSendState({ channelId: 'c1' })).toEqual({
      allowed: false,
      blockReason: 'You are in a communication timeout in this server.',
      blockKind: 'timeout',
      communicationTimeoutUntilEpochMs: Date.parse('2030-01-01T00:00:00.000Z'),
    });
  });

  it('keeps generic permission denial when send is blocked without timeout', () => {
    const api = createChatPermissions({
      activeChannelId: ref('c1'),
      activeChannel: computed(() => ({ id: 'c1' }) as any),
      rawCategories: computed(() => []),
      rolePreview: { value: null },
      selectedServerId: computed(() => 's1'),
      isRolePreviewActiveForServer: computed(() => false),
      isInDMMode: computed(() => false),
      isGroupDM: computed(() => false),
      liveChannelCapabilities: ref({
        canViewChannel: true,
        canSendMessages: false,
        canCreatePolls: false,
        canUploadFiles: false,
        canMentionEveryone: false,
        canUseExternalEmoji: false,
        canManageChannel: false,
        communicationTimeoutActive: false,
        communicationTimeoutUntil: null,
        communicationTimeoutUntilEpochMs: null,
      }),
    });

    expect(api.getSendState({ channelId: 'c1' })).toEqual({
      allowed: false,
      blockReason: 'You cannot send messages in this channel.',
      blockKind: 'permission',
      communicationTimeoutUntilEpochMs: null,
    });
  });

  it('blocks broadcast mentions when live channel caps deny them', () => {
    const api = createChatPermissions({
      activeChannelId: ref('c1'),
      activeChannel: computed(() => ({ id: 'c1' }) as any),
      rawCategories: computed(() => []),
      rolePreview: { value: null },
      selectedServerId: computed(() => 's1'),
      isRolePreviewActiveForServer: computed(() => false),
      isInDMMode: computed(() => false),
      isGroupDM: computed(() => false),
      liveChannelCapabilities: ref({
        canViewChannel: true,
        canSendMessages: true,
        canCreatePolls: true,
        canUploadFiles: true,
        canMentionEveryone: false,
        canUseExternalEmoji: true,
        canManageChannel: false,
        communicationTimeoutActive: false,
        communicationTimeoutUntil: null,
        communicationTimeoutUntilEpochMs: null,
      }),
    });

    expect(
      api.getSendState({
        channelId: 'c1',
        contentTypes: ['text', 'massMention'],
      }),
    ).toEqual({
      allowed: false,
      blockReason: 'You cannot mention @everyone or @active in this channel.',
      blockKind: 'permission',
      communicationTimeoutUntilEpochMs: null,
    });
  });
});
