import type { WorkspaceStateRefs } from './types';

export function useWorkspaceModerationActions(refs: WorkspaceStateRefs) {
  const {
    bannedUserIdsByServer,
    banMetaByServer,
    timeoutUntilByServerUser,
    vcServerMuteByChannel,
    vcServerDeafenByChannel,
    categoriesByServer,
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
    const list = categoriesByServer.value[serverId];
    if (list === undefined) return false;
    let changed = false;
    const nextList = list.map((cat) => ({
      ...cat,
      channels: cat.channels.map((ch) => {
        if (ch.id !== channelId || ch.type !== 'voice') return ch;
        const ids =
          (ch as { voiceParticipantIds?: string[] }).voiceParticipantIds ?? [];
        if (!ids.includes(userId)) return ch;
        changed = true;
        return {
          ...ch,
          voiceParticipantIds: ids.filter((id) => id !== userId),
        } as typeof ch;
      }),
    }));
    if (!changed) return false;
    categoriesByServer.value = {
      ...categoriesByServer.value,
      [serverId]: nextList,
    };
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
    let fromHasUser = false;
    let toExists = false;
    for (const cat of list) {
      for (const ch of cat.channels) {
        if (ch.type !== 'voice') continue;
        const ids =
          (ch as { voiceParticipantIds?: string[] }).voiceParticipantIds ?? [];
        if (ch.id === fromChannelId && ids.includes(userId)) fromHasUser = true;
        if (ch.id === toChannelId) toExists = true;
      }
    }
    if (!fromHasUser || !toExists) return false;
    const nextList = list.map((cat) => ({
      ...cat,
      channels: cat.channels.map((ch) => {
        if (ch.type !== 'voice') return ch;
        const ids =
          (ch as { voiceParticipantIds?: string[] }).voiceParticipantIds ?? [];
        if (ch.id === fromChannelId) {
          if (!ids.includes(userId)) return ch;
          return {
            ...ch,
            voiceParticipantIds: ids.filter((id) => id !== userId),
          } as typeof ch;
        }
        if (ch.id === toChannelId) {
          if (ids.includes(userId)) return ch;
          return {
            ...ch,
            voiceParticipantIds: [...ids, userId],
          } as typeof ch;
        }
        return ch;
      }),
    }));
    categoriesByServer.value = {
      ...categoriesByServer.value,
      [serverId]: nextList,
    };
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
