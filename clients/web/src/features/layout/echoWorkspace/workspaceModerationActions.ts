import type { WorkspaceStateRefs } from './types';
import {
  patchEphemeralMoveUserBetweenChannels,
  patchEphemeralRemoveUserFromChannel,
} from '@/features/layout/echoWorkspace/workspaceVoiceEphemeral';

export function useWorkspaceModerationActions(refs: WorkspaceStateRefs) {
  const {
    bannedUserIdsByServer,
    banMetaByServer,
    timeoutUntilByServerUser,
    vcServerMuteByChannel,
    vcServerDeafenByChannel,
    categoriesByServer,
    voiceEphemeralByChannelId,
  } = refs;

  function kickUserFromServer(_serverId: string, _userId: string): boolean {
    return true;
  }

  function banUserFromServer(
    _serverId: string,
    _userId: string,
    _opts?: { banDurationMinutes?: number | null; reason?: string },
  ): boolean {
    return true;
  }

  function timeoutUserOnServer(
    serverId: string,
    userId: string,
    minutes: number,
  ): boolean {
    const nextUntil = Date.now() + Math.max(1, Math.floor(minutes)) * 60_000;
    timeoutUntilByServerUser.value = {
      ...timeoutUntilByServerUser.value,
      [serverId]: {
        ...(timeoutUntilByServerUser.value[serverId] ?? {}),
        [userId]: nextUntil,
      },
    };
    return true;
  }

  function clearTimeoutUserOnServer(serverId: string, userId: string): boolean {
    const byServer = timeoutUntilByServerUser.value[serverId];
    if (!byServer || !(userId in byServer)) return false;
    const nextByServer = { ...byServer };
    delete nextByServer[userId];
    timeoutUntilByServerUser.value = {
      ...timeoutUntilByServerUser.value,
      [serverId]: nextByServer,
    };
    return true;
  }

  function isUserBannedFromServer(serverId: string, userId: string): boolean {
    const ids = bannedUserIdsByServer.value[serverId] ?? [];
    if (!ids.includes(userId)) return false;
    const meta = banMetaByServer.value[serverId]?.[userId];
    const exp = meta?.expiresAt;
    if (exp != null && Date.now() > exp) {
      const nextIds = ids.filter((id) => id !== userId);
      const nextMeta = { ...(banMetaByServer.value[serverId] ?? {}) };
      delete nextMeta[userId];
      bannedUserIdsByServer.value = {
        ...bannedUserIdsByServer.value,
        [serverId]: nextIds,
      };
      banMetaByServer.value = {
        ...banMetaByServer.value,
        [serverId]: nextMeta,
      };
      return false;
    }
    return true;
  }

  function clearVcModerationForUserOnChannel(
    channelId: string,
    userId: string,
  ) {
    const mutePer = { ...(vcServerMuteByChannel.value[channelId] ?? {}) };
    delete mutePer[userId];
    vcServerMuteByChannel.value = {
      ...vcServerMuteByChannel.value,
      [channelId]: mutePer,
    };
    const deafPer = { ...(vcServerDeafenByChannel.value[channelId] ?? {}) };
    delete deafPer[userId];
    vcServerDeafenByChannel.value = {
      ...vcServerDeafenByChannel.value,
      [channelId]: deafPer,
    };
  }

  function toggleVcServerMute(channelId: string, userId: string) {
    const per = { ...(vcServerMuteByChannel.value[channelId] ?? {}) };
    if (per[userId]) delete per[userId];
    else per[userId] = true;
    vcServerMuteByChannel.value = {
      ...vcServerMuteByChannel.value,
      [channelId]: per,
    };
  }

  function toggleVcServerDeafen(channelId: string, userId: string) {
    const per = { ...(vcServerDeafenByChannel.value[channelId] ?? {}) };
    if (per[userId]) delete per[userId];
    else per[userId] = true;
    vcServerDeafenByChannel.value = {
      ...vcServerDeafenByChannel.value,
      [channelId]: per,
    };
  }

  function removeUserFromVoiceChannel(
    serverId: string,
    channelId: string,
    userId: string,
  ): boolean {
    if (categoriesByServer.value[serverId] === undefined) return false;
    const next = new Map(voiceEphemeralByChannelId.value);
    if (!patchEphemeralRemoveUserFromChannel(next, channelId, userId)) {
      return false;
    }
    voiceEphemeralByChannelId.value = next;
    clearVcModerationForUserOnChannel(channelId, userId);
    return true;
  }

  function moveUserBetweenVoiceChannels(
    serverId: string,
    fromChannelId: string,
    toChannelId: string,
    userId: string,
  ): boolean {
    if (fromChannelId === toChannelId) return true;
    const list = categoriesByServer.value[serverId];
    if (list === undefined) return false;
    let toExists = false;
    for (const cat of list) {
      for (const ch of cat.channels) {
        if (
          ch.id === toChannelId &&
          (ch.type === 'voice' || ch.type === 'stage')
        ) {
          toExists = true;
        }
      }
    }
    if (!toExists) return false;
    const next = new Map(voiceEphemeralByChannelId.value);
    if (
      !patchEphemeralMoveUserBetweenChannels(
        next,
        fromChannelId,
        toChannelId,
        userId,
      )
    ) {
      return false;
    }
    voiceEphemeralByChannelId.value = next;
    clearVcModerationForUserOnChannel(fromChannelId, userId);
    return true;
  }

  return {
    kickUserFromServer,
    banUserFromServer,
    timeoutUserOnServer,
    clearTimeoutUserOnServer,
    isUserBannedFromServer,
    toggleVcServerMute,
    toggleVcServerDeafen,
    removeUserFromVoiceChannel,
    moveUserBetweenVoiceChannels,
  };
}
