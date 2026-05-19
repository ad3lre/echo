import { watch, type Ref } from 'vue';
import type { ChannelSummary } from '@shared/types';
import type { ChannelCategory } from '@/composables/useChannels';

export function useAppLayoutRolePreviewVoiceGuard(deps: {
  isRolePreviewActiveForServer: Ref<boolean>;
  rolePreview: Ref<{ roleId?: string } | null | undefined>;
  currentVoiceChannelId: Ref<string | null>;
  findChannelContextById: (channelId: string | null | undefined) => {
    channel: ChannelSummary;
    category: ChannelCategory;
  } | null;
  resolvePreviewChannelPermission: (
    channel: ChannelSummary | undefined,
    defaults: ChannelCategory['channelPermissionDefaults'],
    permission: 'viewChannel' | 'connect',
  ) => boolean;
  previewHasUiPermission: (perm: string) => boolean;
  handleLeaveVoice: () => void;
  vcVideo: Ref<boolean>;
  handleJoinVoice: (payload: {
    channelId: string;
    channelName: string;
  }) => void;
}) {
  watch(
    () =>
      [
        deps.isRolePreviewActiveForServer.value,
        deps.currentVoiceChannelId.value,
        deps.rolePreview.value?.roleId,
      ] as const,
    () => {
      if (!deps.isRolePreviewActiveForServer.value) return;
      const voiceContext = deps.findChannelContextById(
        deps.currentVoiceChannelId.value,
      );
      if (
        voiceContext &&
        (!deps.resolvePreviewChannelPermission(
          voiceContext.channel,
          voiceContext.category.channelPermissionDefaults,
          'viewChannel',
        ) ||
          !deps.resolvePreviewChannelPermission(
            voiceContext.channel,
            voiceContext.category.channelPermissionDefaults,
            'connect',
          ))
      ) {
        deps.handleLeaveVoice();
      }
      if (!deps.previewHasUiPermission('video') && deps.vcVideo.value) {
        deps.vcVideo.value = false;
      }
    },
  );

  function handleJoinVoiceIfAllowed(payload: {
    channelId: string;
    channelName: string;
  }) {
    const context = deps.findChannelContextById(payload.channelId);
    if (
      deps.isRolePreviewActiveForServer.value &&
      !deps.resolvePreviewChannelPermission(
        context?.channel,
        context?.category.channelPermissionDefaults,
        'connect',
      )
    ) {
      return;
    }
    deps.handleJoinVoice(payload);
  }

  function updateVcVideoIfAllowed(next: boolean) {
    if (
      next &&
      deps.isRolePreviewActiveForServer.value &&
      !deps.previewHasUiPermission('video')
    )
      return;
    deps.vcVideo.value = next;
  }

  function canJoinPreviewVoiceChannel(channelId: string): boolean {
    if (!deps.isRolePreviewActiveForServer.value) return true;
    const context = deps.findChannelContextById(channelId);
    return (
      deps.resolvePreviewChannelPermission(
        context?.channel,
        context?.category.channelPermissionDefaults,
        'viewChannel',
      ) &&
      deps.resolvePreviewChannelPermission(
        context?.channel,
        context?.category.channelPermissionDefaults,
        'connect',
      )
    );
  }

  return {
    handleJoinVoiceIfAllowed,
    updateVcVideoIfAllowed,
    canJoinPreviewVoiceChannel,
  };
}
