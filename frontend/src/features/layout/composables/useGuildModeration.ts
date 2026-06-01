import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { useServerStore } from '@/stores/server';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import {
  postEchoModerationAction,
  postEchoVoiceModerate,
} from '@/api/echoClient';
import { isEchoAuthUserId, isEchoGraphId } from '@/utils/echoIds';
import { requestAppConfirm } from '@/utils/appDialogs';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import {
  MAX_ECHO_BAN_DURATION_MINUTES,
  MAX_ECHO_TIMEOUT_MINUTES,
} from '@/constants/echoModerationLimits';
import { canModerateMember } from '@/utils/memberProfiles';
import type { ChannelSummary } from '@shared/types';
import { isVoiceLikeChannelType } from '@/utils/voiceChannelKinds';
import type { Server } from '@shared/types/server';
import type { ChannelCategory } from '@/composables/useChannels';
import type { RolePreviewState } from '@/features/server-settings/composables/useRolePreview';
import type { PreviewChannelPermission } from '@/domain/chatRolePreviewPermissions';

export function useGuildModeration(deps: {
  serverStore: ReturnType<typeof useServerStore>;
  authSession: ReturnType<typeof useAuthSessionStore>;
  workspace: WorkspaceStateApi;
  selectedServer: ComputedRef<Server | undefined>;
  currentUser: ComputedRef<{ id: string } | undefined>;
  activeChannel: ComputedRef<ChannelSummary | null>;
  activeChannelContext: ComputedRef<{
    channel: ChannelSummary;
    category: ChannelCategory;
  } | null>;
  rolePreview: ComputedRef<RolePreviewState | null>;
  isRolePreviewActiveForServer: ComputedRef<boolean>;
  previewHasUiPermission: (permission: string) => boolean;
  previewCanModerateMembers: () => boolean;
  resolvePreviewChannelPermission: (
    channel: ChannelSummary | null | undefined,
    categoryDefaults: Partial<Record<string, boolean>> | undefined,
    permission: PreviewChannelPermission,
  ) => boolean;
  echoCanModerateMembers: Ref<boolean>;
  echoCanKickMembers: Ref<boolean>;
  echoCanBanMembers: Ref<boolean>;
  echoCanTimeoutMembers: Ref<boolean>;
  echoCanChangeNicknames: Ref<boolean>;
  echoCanManageNicknames: Ref<boolean>;
  echoCanManageMessages: Ref<boolean>;
  echoCanCreateInvite: Ref<boolean>;
  echoCanMuteVoiceMembers: Ref<boolean>;
  echoCanDeafenVoiceMembers: Ref<boolean>;
  echoCanMoveVoiceMembers: Ref<boolean>;
  echoCapabilitiesForServerId: Ref<string | null>;
  onLeaveVoice: () => void;
  /** After Echo moderation or nickname API success, refresh workspace so lists match the server. */
  hydrateWorkspace?: () => Promise<void>;
}) {
  const {
    serverStore,
    authSession,
    workspace,
    selectedServer,
    currentUser,
    activeChannel,
    activeChannelContext,
    rolePreview,
    isRolePreviewActiveForServer,
    previewHasUiPermission,
    previewCanModerateMembers,
    resolvePreviewChannelPermission,
    echoCanModerateMembers,
    echoCanKickMembers,
    echoCanBanMembers,
    echoCanTimeoutMembers,
    echoCanChangeNicknames,
    echoCanManageNicknames,
    echoCanManageMessages,
    echoCanCreateInvite,
    echoCanMuteVoiceMembers,
    echoCanDeafenVoiceMembers,
    echoCanMoveVoiceMembers,
    echoCapabilitiesForServerId,
    onLeaveVoice,
    hydrateWorkspace,
  } = deps;

  function echoCapsApplyToServer(serverId: string): boolean {
    return echoCapabilitiesForServerId.value === serverId;
  }

  function canModerateMemberInServerBase(targetUserId: string): boolean {
    const sid = selectedServer.value?.id;
    const cur = currentUser.value?.id;
    if (!sid || sid === 'echo' || !cur) return false;
    if (cur === targetUserId) return false;
    const ownerId = selectedServer.value?.ownerId;
    if (ownerId && targetUserId === ownerId) return false;
    return true;
  }

  function canModerateMemberInServer(targetUserId: string): boolean {
    if (!canModerateMemberInServerBase(targetUserId)) return false;
    const sid = selectedServer.value?.id;
    const cur = currentUser.value?.id;
    if (!sid || !cur) return false;
    if (isRolePreviewActiveForServer.value) {
      return previewCanModerateMembers();
    }
    if (!isEchoGraphId(sid)) {
      return canModerateMember(sid, cur, targetUserId);
    }
    return echoCapsApplyToServer(sid) && echoCanModerateMembers.value;
  }

  function canVcModerateMember(
    targetUserId: string,
    action:
      | 'serverMute'
      | 'serverDeafen'
      | 'disconnect'
      | 'move'
      | 'inviteToSpeak'
      | 'moveToAudience'
      | 'stopCamera'
      | 'stopScreenShare',
  ): boolean {
    if (!canModerateMemberInServerBase(targetUserId)) return false;
    const sid = selectedServer.value?.id;
    if (!sid) return false;
    if (isRolePreviewActiveForServer.value) {
      if (
        action === 'serverMute' ||
        action === 'inviteToSpeak' ||
        action === 'moveToAudience' ||
        action === 'stopCamera' ||
        action === 'stopScreenShare'
      ) {
        return previewHasUiPermission('muteMembers');
      }
      if (action === 'serverDeafen') {
        return previewHasUiPermission('deafenMembers');
      }
      if (action === 'move' || action === 'disconnect') {
        return previewHasUiPermission('moveMembers');
      }
      return false;
    }
    if (!isEchoGraphId(sid)) {
      const cur = currentUser.value?.id;
      if (!cur) return false;
      return canModerateMember(sid, cur, targetUserId);
    }
    if (!echoCapsApplyToServer(sid)) return false;
    if (
      action === 'serverMute' ||
      action === 'inviteToSpeak' ||
      action === 'moveToAudience' ||
      action === 'stopCamera' ||
      action === 'stopScreenShare'
    ) {
      return echoCanMuteVoiceMembers.value;
    }
    if (action === 'serverDeafen') return echoCanDeafenVoiceMembers.value;
    if (action === 'move' || action === 'disconnect') {
      return echoCanMoveVoiceMembers.value;
    }
    return false;
  }

  function canModerateMemberActionInServer(
    targetUserId: string,
    action: 'kick' | 'ban' | 'timeout' | 'untimeout',
  ): boolean {
    if (!canModerateMemberInServerBase(targetUserId)) return false;
    const sid = selectedServer.value?.id;
    const cur = currentUser.value?.id;
    if (!sid || !cur) return false;
    if (isRolePreviewActiveForServer.value) {
      const perm =
        action === 'kick'
          ? 'kickMembers'
          : action === 'ban'
            ? 'banMembers'
            : 'timeoutMembers';
      return previewHasUiPermission(perm);
    }
    if (!isEchoGraphId(sid)) {
      return canModerateMember(sid, cur, targetUserId);
    }
    if (!echoCapsApplyToServer(sid)) return false;
    if (action === 'kick') return echoCanKickMembers.value;
    if (action === 'ban') return echoCanBanMembers.value;
    return echoCanTimeoutMembers.value;
  }

  function isMemberCommunicationTimedOut(
    serverId: string,
    targetUserId: string,
  ): boolean {
    const epochMs =
      workspace.timeoutUntilByServerUser.value[serverId]?.[targetUserId];
    return (
      typeof epochMs === 'number' &&
      Number.isFinite(epochMs) &&
      epochMs > Date.now()
    );
  }

  function canChangeMemberNicknameInServer(targetUserId: string): boolean {
    const sid = selectedServer.value?.id;
    const cur = currentUser.value?.id;
    if (!sid || sid === 'echo' || !cur) return false;
    if (targetUserId === cur) {
      if (isRolePreviewActiveForServer.value) {
        return (
          previewHasUiPermission('changeNickname') ||
          previewHasUiPermission('manageNicknames')
        );
      }
      if (!isEchoGraphId(sid)) return true;
      return echoCapsApplyToServer(sid) && echoCanChangeNicknames.value;
    }
    if (!canModerateMemberInServerBase(targetUserId)) return false;
    if (isRolePreviewActiveForServer.value) {
      return previewHasUiPermission('manageNicknames');
    }
    return echoCapsApplyToServer(sid) && echoCanManageNicknames.value;
  }

  function canModerateMessageAuthor(authorId: string): boolean {
    const sid = selectedServer.value?.id;
    const cur = currentUser.value?.id;
    if (!sid || sid === 'echo' || !cur) return false;
    if (isRolePreviewActiveForServer.value) {
      const canManageMessages = resolvePreviewChannelPermission(
        activeChannelContext.value?.channel,
        activeChannelContext.value?.category.channelPermissionDefaults,
        'manageMessages',
      );
      if (!(previewCanModerateMembers() || canManageMessages)) return false;
      if (cur === authorId) return false;
      const ownerId = selectedServer.value?.ownerId;
      if (ownerId && authorId === ownerId) return false;
      return true;
    }
    if (!isEchoGraphId(sid)) {
      return canModerateMember(sid, cur, authorId);
    }
    if (!echoCapsApplyToServer(sid)) return false;
    if (!(echoCanModerateMembers.value || echoCanManageMessages.value))
      return false;
    if (cur === authorId) return false;
    const ownerId = selectedServer.value?.ownerId;
    if (ownerId && authorId === ownerId) return false;
    return true;
  }

  function canOpenInviteForServer(serverId: string): boolean {
    const uid = currentUser.value?.id;
    if (!serverId || serverId === 'echo' || !uid) return false;
    if (rolePreview.value?.serverId === serverId)
      return previewHasUiPermission('createInvite');
    if (!isEchoGraphId(serverId)) return true;
    if (serverStore.selectedServerId !== serverId) return true;
    const sel = selectedServer.value;
    if (sel?.id === serverId) {
      const ownerId = sel.ownerId;
      if (ownerId && uid === ownerId) return true;
    }
    return echoCapsApplyToServer(serverId) && echoCanCreateInvite.value;
  }

  const canInviteToCurrentServer = computed(() => {
    const sid = selectedServer.value?.id;
    if (!sid || sid === 'echo') return false;
    if (isRolePreviewActiveForServer.value)
      return previewHasUiPermission('createInvite');
    if (!isEchoGraphId(sid)) return true;
    const ownerId = selectedServer.value?.ownerId;
    const uid = currentUser.value?.id;
    if (ownerId && uid && ownerId === uid) return true;
    return echoCapsApplyToServer(sid) && echoCanCreateInvite.value;
  });

  const moderationModalOpen = ref(false);
  const moderationAction = ref<'kick' | 'ban' | 'timeout' | 'untimeout' | null>(
    null,
  );
  const moderationTargetUserId = ref<string | null>(null);

  const moderationTargetUser = computed(() => {
    const id = moderationTargetUserId.value;
    if (!id) return null;
    return workspace.users.value.find((u) => u.id === id) ?? null;
  });

  watch(moderationModalOpen, (open) => {
    if (!open) {
      moderationAction.value = null;
      moderationTargetUserId.value = null;
    }
  });

  function handleModerateUser(payload: {
    action: 'kick' | 'ban' | 'timeout';
    targetUserId: string;
    timeoutMinutes?: number;
  }) {
    const sid = selectedServer.value?.id;
    const cur = currentUser.value?.id;
    if (!sid || sid === 'echo' || !cur) return;
    const action =
      payload.action === 'timeout' &&
      isMemberCommunicationTimedOut(sid, payload.targetUserId)
        ? 'untimeout'
        : payload.action;
    if (!canModerateMemberActionInServer(payload.targetUserId, action)) return;
    moderationAction.value = action;
    moderationTargetUserId.value = payload.targetUserId;
    moderationModalOpen.value = true;
  }

  async function onModerationModalConfirm(
    payload?:
      | { timeoutMinutes: number }
      | {
          banDurationMinutes: number | null;
          reason: string;
          deleteRecentMessagesHours?: number;
        },
  ) {
    const sid = selectedServer.value?.id;
    const cur = currentUser.value?.id;
    const targetId = moderationTargetUserId.value;
    const action = moderationAction.value;
    if (!sid || sid === 'echo' || !cur || !targetId || !action) return;
    if (!canModerateMemberActionInServer(targetId, action)) return;

    moderationModalOpen.value = false;

    const banPayload =
      action === 'ban' && payload && 'banDurationMinutes' in payload
        ? payload
        : action === 'ban'
          ? {
              banDurationMinutes: null as number | null,
              reason: '',
              deleteRecentMessagesHours: 0,
            }
          : null;

    const token = authSession.accessToken;
    const useEchoApi =
      authSession.isAuthenticated &&
      isEchoGraphId(sid) &&
      isEchoAuthUserId(targetId);

    if (useEchoApi) {
      try {
        const meta: Record<string, unknown> = {};
        if (action === 'timeout') {
          const raw =
            payload && 'timeoutMinutes' in payload
              ? payload.timeoutMinutes
              : 60;
          const m = Math.min(
            MAX_ECHO_TIMEOUT_MINUTES,
            Math.max(1, Math.floor(Number(raw) || 60)),
          );
          meta.timeoutMinutes = m;
        } else if (action === 'ban' && banPayload) {
          const r = banPayload.reason.trim();
          if (r) meta.reason = r.slice(0, 500);
          if (
            typeof banPayload.banDurationMinutes === 'number' &&
            banPayload.banDurationMinutes > 0
          ) {
            meta.banDurationMinutes = Math.min(
              MAX_ECHO_BAN_DURATION_MINUTES,
              Math.floor(banPayload.banDurationMinutes),
            );
          }
          const allowedPurge = new Set([0, 1, 24, 72, 168]);
          const rawDel = banPayload.deleteRecentMessagesHours;
          const delH =
            typeof rawDel === 'number' &&
            Number.isFinite(rawDel) &&
            allowedPurge.has(Math.floor(rawDel))
              ? Math.floor(rawDel)
              : 0;
          if (delH > 0) meta.deleteRecentMessagesHours = delH;
        }
        await postEchoModerationAction(token ?? '', sid, {
          action,
          targetUserId: targetId,
          meta,
        });
        await hydrateWorkspace?.();
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Something didn't work. Try again.";
        dispatchAppToast(`Could not complete moderation: ${msg}`, 'warning');
      }
      return;
    }

    if (action === 'kick') {
      workspace.kickUserFromServer(sid, targetId);
    } else if (action === 'ban') {
      workspace.banUserFromServer(sid, targetId, {
        banDurationMinutes: banPayload!.banDurationMinutes,
        reason: banPayload!.reason,
      });
    } else if (action === 'timeout') {
      const timeoutMins =
        payload && 'timeoutMinutes' in payload ? payload.timeoutMinutes : 60;
      workspace.timeoutUserOnServer(sid, targetId, timeoutMins);
    } else {
      workspace.clearTimeoutUserOnServer(sid, targetId);
    }
  }

  function resolveVoiceChannelForModeration(
    serverId: string,
    ctxVoiceId?: string | null,
  ): ChannelSummary | null {
    const cid = ctxVoiceId?.trim();
    if (cid) {
      const cats = workspace.categoriesByServer.value[serverId] ?? [];
      for (const cat of cats) {
        const hit = cat.channels.find(
          (c) => c.id === cid && isVoiceLikeChannelType(c.type),
        );
        if (hit) return hit;
      }
    }
    const active = activeChannel.value;
    if (active && isVoiceLikeChannelType(active.type)) return active;
    return null;
  }

  async function handleVcModerate(payload: {
    action:
      | 'serverMute'
      | 'serverDeafen'
      | 'disconnect'
      | 'move'
      | 'inviteToSpeak'
      | 'moveToAudience'
      | 'stopCamera'
      | 'stopScreenShare';
    targetUserId: string;
    targetChannelId?: string;
    contextVoiceChannelId?: string;
  }) {
    const sid = selectedServer.value?.id;
    const cur = currentUser.value?.id;
    if (!sid || sid === 'echo' || !cur) return;
    const ch = resolveVoiceChannelForModeration(
      sid,
      payload.contextVoiceChannelId,
    );
    if (!ch || !isVoiceLikeChannelType(ch.type)) return;
    if (!canVcModerateMember(payload.targetUserId, payload.action)) return;

    const useEchoVoiceModerate =
      authSession.isAuthenticated &&
      isEchoGraphId(sid) &&
      isEchoAuthUserId(payload.targetUserId);

    if (payload.action === 'inviteToSpeak') {
      if (!useEchoVoiceModerate) return;
      try {
        await postEchoVoiceModerate(authSession.accessToken, sid, {
          action: 'invite_to_speak',
          targetUserId: payload.targetUserId,
        });
        await hydrateWorkspace?.();
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Something didn't work. Try again.";
        dispatchAppToast(`Could not invite to speak: ${msg}`, 'warning');
      }
    } else if (payload.action === 'moveToAudience') {
      if (!useEchoVoiceModerate) return;
      try {
        await postEchoVoiceModerate(authSession.accessToken, sid, {
          action: 'move_to_audience',
          targetUserId: payload.targetUserId,
        });
        await hydrateWorkspace?.();
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Something didn't work. Try again.";
        dispatchAppToast(`Could not move to audience: ${msg}`, 'warning');
      }
    } else if (payload.action === 'serverMute') {
      if (useEchoVoiceModerate) {
        const muted = !!ch.voiceServerMuteByUserId?.[payload.targetUserId];
        try {
          await postEchoVoiceModerate(authSession.accessToken, sid, {
            action: muted ? 'server_unmute' : 'server_mute',
            targetUserId: payload.targetUserId,
          });
          await hydrateWorkspace?.();
        } catch (e) {
          const msg =
            e instanceof Error
              ? e.message
              : "Something didn't work. Try again.";
          dispatchAppToast(`Could not update server mute: ${msg}`, 'warning');
        }
      } else {
        workspace.toggleVcServerMute(ch.id, payload.targetUserId);
      }
    } else if (payload.action === 'serverDeafen') {
      if (useEchoVoiceModerate) {
        const deafened = !!ch.voiceServerDeafenByUserId?.[payload.targetUserId];
        try {
          await postEchoVoiceModerate(authSession.accessToken, sid, {
            action: deafened ? 'server_undeafen' : 'server_deafen',
            targetUserId: payload.targetUserId,
          });
          await hydrateWorkspace?.();
        } catch (e) {
          const msg =
            e instanceof Error
              ? e.message
              : "Something didn't work. Try again.";
          dispatchAppToast(`Could not update server deafen: ${msg}`, 'warning');
        }
      } else {
        workspace.toggleVcServerDeafen(ch.id, payload.targetUserId);
      }
    } else if (
      payload.action === 'stopCamera' ||
      payload.action === 'stopScreenShare'
    ) {
      if (!useEchoVoiceModerate) return;
      const apiAction =
        payload.action === 'stopCamera' ? 'stop_camera' : 'stop_screen_share';
      try {
        await postEchoVoiceModerate(authSession.accessToken, sid, {
          action: apiAction,
          targetUserId: payload.targetUserId,
        });
      } catch (e) {
        const label =
          payload.action === 'stopCamera' ? 'camera' : 'screen share';
        const msg =
          e instanceof Error ? e.message : "Something didn't work. Try again.";
        dispatchAppToast(`Could not stop ${label}: ${msg}`, 'warning');
      }
    } else if (payload.action === 'move') {
      const dest = payload.targetChannelId?.trim();
      if (!dest) return;
      if (useEchoVoiceModerate) {
        try {
          await postEchoVoiceModerate(authSession.accessToken, sid, {
            action: 'move',
            targetUserId: payload.targetUserId,
            targetChannelId: dest,
          });
          await hydrateWorkspace?.();
        } catch (e) {
          const msg =
            e instanceof Error
              ? e.message
              : "Something didn't work. Try again.";
          dispatchAppToast(`Could not move member: ${msg}`, 'warning');
        }
      } else {
        workspace.moveUserBetweenVoiceChannels(
          sid,
          ch.id,
          dest,
          payload.targetUserId,
        );
      }
    } else {
      const ok = await requestAppConfirm({
        title: 'Disconnect this user?',
        message: 'Disconnect this user from the voice channel?',
        confirmLabel: 'Disconnect',
        danger: true,
      });
      if (!ok) return;
      if (useEchoVoiceModerate) {
        try {
          await postEchoVoiceModerate(authSession.accessToken, sid, {
            action: 'disconnect',
            targetUserId: payload.targetUserId,
          });
          await hydrateWorkspace?.();
        } catch (e) {
          const msg =
            e instanceof Error
              ? e.message
              : "Something didn't work. Try again.";
          dispatchAppToast(`Could not disconnect user: ${msg}`, 'warning');
        }
      } else {
        workspace.removeUserFromVoiceChannel(sid, ch.id, payload.targetUserId);
        if (payload.targetUserId === cur) {
          onLeaveVoice();
        }
      }
    }
  }

  return {
    canModerateMemberInServer,
    canModerateMemberActionInServer,
    canChangeMemberNicknameInServer,
    canModerateMessageAuthor,
    canOpenInviteForServer,
    canInviteToCurrentServer,
    moderationModalOpen,
    moderationAction,
    moderationTargetUserId,
    moderationTargetUser,
    handleModerateUser,
    onModerationModalConfirm,
    handleVcModerate,
    canVcModerateMember,
  };
}
