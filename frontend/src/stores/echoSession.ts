import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { EchoWorkspaceState } from '@/api/echoClient';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import type { ChannelCategory } from '@/composables/useChannels';
import {
  clearWorkspaceMessagesRecord,
  replaceWorkspaceMessagesSnapshot,
} from '@/services/realtime/channelMessageAuthority';
import {
  type EchoWorkspacePresencePatch,
  type EchoWorkspaceDiscordPresencePatch,
  type EchoWorkspaceLastOnlinePatch,
  type EchoWorkspaceDiscoverableServer,
  type EchoWorkspaceSessionApplyRefs,
  type EchoWorkspaceSessionUser,
  applyWorkspaceSnapshotToEchoSession,
  applyVoiceRosterDeltaToEchoSession,
  getEffectiveWorkspaceVersion,
  mergeMembersByServerInEchoSession,
  noteWorkspaceEventVersionOnEchoSession,
  patchPresenceBatchOnEchoSession,
  patchPresenceOnEchoSession,
  patchDiscordPresenceBatchOnEchoSession,
  patchLastOnlineBatchOnEchoSession,
  replaceUsersInEchoSession,
  setDiscoverableServerRowsOnEchoSession,
  setLiveSyncConnectedOnEchoSession,
  sessionAcceptsIncomingVersion,
} from '@/services/domain/workspaceSession';
import type { EchoWorkspaceEvent } from '@shared/types/socket';
import {
  fetchDiscordVoiceMirrorRoster,
  type DiscordVoiceMirrorRosterMember,
} from '@/api/echo/discordVoiceMirror';

type WorkspaceMembersMap = NonNullable<EchoWorkspaceState['membersByServer']>;

export const useEchoSessionStore = defineStore('echoSession', () => {
  const users = ref<EchoWorkspaceSessionUser[]>([]);
  /**
   * Last-known presence from `/presence` batch + `presence:update` for any user id.
   * `patchPresence` only mutates `users` rows that already exist; this map keeps authors
   * who appear in message history but are not yet merged into `users` in sync for chat UI.
   */
  const presenceByUserId = ref<Record<string, string>>({});
  const presenceMobileByUserId = ref<Record<string, true>>({});
  const discordOnlineByUserId = ref<Record<string, true>>({});
  const lastOnlineAtByUserId = ref<Record<string, string>>({});
  const servers = ref<EchoWorkspaceState['servers']>([]);
  const categoriesByServer = ref<Record<string, ChannelCategory[]>>({});
  const discoverableServers = ref<EchoWorkspaceDiscoverableServer[]>([]);
  const messages = ref<Record<string, RawMessage[]>>({});
  const serverMemberIds = ref<Record<string, string[]>>({});
  /** Last roster from workspace snapshots (used when serverMemberIds is empty/stale). */
  const workspaceMembersByServer = ref<WorkspaceMembersMap>({});
  const workspaceVersion = ref('0');
  const liveSyncConnected = ref(false);
  const lastWorkspaceEventVersion = ref('0');
  const lastSnapshotFetchedAtMs = ref(0);
  const upcomingEventsByServerId = ref<
    EchoWorkspaceState['upcomingEventsByServerId']
  >({});
  const myEventRsvps = ref<EchoWorkspaceState['myEventRsvps']>([]);
  /** Discord VC roster lines keyed by Echo voice channel id (display-only mirrors). */
  const discordVoiceMirrorRosterByEchoChannelId = ref<
    Record<string, DiscordVoiceMirrorRosterMember[]>
  >({});

  const sessionApplyRefs: EchoWorkspaceSessionApplyRefs = {
    users,
    presenceByUserId,
    presenceMobileByUserId,
    discordOnlineByUserId,
    lastOnlineAtByUserId,
    servers,
    categoriesByServer,
    discoverableServers,
    messages,
    serverMemberIds,
    workspaceMembersByServer,
    workspaceVersion,
    liveSyncConnected,
    lastWorkspaceEventVersion,
    lastSnapshotFetchedAtMs,
    upcomingEventsByServerId,
    myEventRsvps,
  };

  const effectiveVersion = computed(() =>
    getEffectiveWorkspaceVersion(
      lastWorkspaceEventVersion.value,
      workspaceVersion.value,
    ),
  );

  function acceptsIncomingVersion(nextVersion: string | undefined): boolean {
    return sessionAcceptsIncomingVersion(
      nextVersion,
      lastWorkspaceEventVersion.value,
      workspaceVersion.value,
    );
  }

  function replaceUsers(nextUsers: EchoWorkspaceSessionUser[]): void {
    replaceUsersInEchoSession(sessionApplyRefs, nextUsers);
  }

  function mergeMembersByServer(
    membersByServer:
      | NonNullable<EchoWorkspaceState['membersByServer']>
      | undefined,
  ): void {
    mergeMembersByServerInEchoSession(sessionApplyRefs, membersByServer);
  }

  function applyWorkspaceSnapshot(state: EchoWorkspaceState): boolean {
    return applyWorkspaceSnapshotToEchoSession(sessionApplyRefs, state);
  }

  function noteWorkspaceEventVersion(version: string | undefined): boolean {
    return noteWorkspaceEventVersionOnEchoSession(sessionApplyRefs, version);
  }

  function setDiscoverableServerRows(
    rows: EchoWorkspaceDiscoverableServer[],
  ): void {
    setDiscoverableServerRowsOnEchoSession(sessionApplyRefs, rows);
  }

  function setMessages(nextMessages: Record<string, RawMessage[]>): void {
    replaceWorkspaceMessagesSnapshot(nextMessages);
  }

  function patchPresence(
    userId: string,
    status: string,
    opts?: { mobileSurface?: boolean },
  ): void {
    patchPresenceOnEchoSession(sessionApplyRefs, userId, status, opts);
  }

  function patchPresenceBatch(
    patches: readonly EchoWorkspacePresencePatch[],
  ): void {
    patchPresenceBatchOnEchoSession(sessionApplyRefs, patches);
  }

  function patchDiscordPresenceBatch(
    patches: readonly EchoWorkspaceDiscordPresencePatch[],
  ): void {
    patchDiscordPresenceBatchOnEchoSession(sessionApplyRefs, patches);
  }

  function patchLastOnlineBatch(
    patches: readonly EchoWorkspaceLastOnlinePatch[],
  ): void {
    patchLastOnlineBatchOnEchoSession(sessionApplyRefs, patches);
  }

  function setLiveSyncConnected(connected: boolean): void {
    setLiveSyncConnectedOnEchoSession(sessionApplyRefs, connected);
  }

  function applyVoiceRosterDelta(payload: EchoWorkspaceEvent): void {
    if (!payload.voiceRosterDelta) return;
    applyVoiceRosterDeltaToEchoSession(sessionApplyRefs, payload.voiceRosterDelta);
  }

  function mergeDiscordVoiceMirrorFromSocket(
    payload: NonNullable<EchoWorkspaceEvent['discordVoiceMirror']>,
  ): void {
    const next = { ...discordVoiceMirrorRosterByEchoChannelId.value };
    for (const row of payload.channels) {
      next[row.echoChannelId] = row.members.map((m) => ({
        discordUserId: m.discordUserId,
        username: m.username,
        globalName: m.globalName,
        avatar: m.avatar,
      }));
    }
    discordVoiceMirrorRosterByEchoChannelId.value = next;
  }

  async function refreshDiscordVoiceMirrorRosters(
    token: string,
    serverIds: string[],
  ): Promise<void> {
    const t = token.trim();
    if (!t || serverIds.length === 0) return;
    const next = { ...discordVoiceMirrorRosterByEchoChannelId.value };
    await Promise.all(
      serverIds.map(async (sid) => {
        try {
          const r = await fetchDiscordVoiceMirrorRoster(t, sid);
          for (const c of r.channels) {
            if (c.echoChannelId) {
              next[c.echoChannelId] = c.members.map((m) => ({
                discordUserId: m.discordUserId,
                username: m.username,
                globalName: m.globalName,
                avatar: m.avatar,
              }));
            }
          }
        } catch {
          /* ignore per-server */
        }
      }),
    );
    discordVoiceMirrorRosterByEchoChannelId.value = next;
  }

  function resetSessionState(): void {
    clearWorkspaceMessagesRecord();
    presenceByUserId.value = {};
    presenceMobileByUserId.value = {};
    discordOnlineByUserId.value = {};
    lastOnlineAtByUserId.value = {};
    users.value = [];
    servers.value = [];
    categoriesByServer.value = {};
    discoverableServers.value = [];
    serverMemberIds.value = {};
    workspaceMembersByServer.value = {};
    workspaceVersion.value = '0';
    liveSyncConnected.value = false;
    lastWorkspaceEventVersion.value = '0';
    lastSnapshotFetchedAtMs.value = 0;
    discordVoiceMirrorRosterByEchoChannelId.value = {};
    upcomingEventsByServerId.value = {};
    myEventRsvps.value = [];
  }

  return {
    users,
    presenceByUserId,
    presenceMobileByUserId,
    discordOnlineByUserId,
    lastOnlineAtByUserId,
    servers,
    categoriesByServer,
    discoverableServers,
    messages,
    serverMemberIds,
    workspaceMembersByServer,
    workspaceVersion,
    liveSyncConnected,
    lastWorkspaceEventVersion,
    lastSnapshotFetchedAtMs,
    discordVoiceMirrorRosterByEchoChannelId,
    upcomingEventsByServerId,
    myEventRsvps,
    effectiveVersion,
    acceptsIncomingVersion,
    replaceUsers,
    mergeMembersByServer,
    applyWorkspaceSnapshot,
    noteWorkspaceEventVersion,
    setDiscoverableServerRows,
    setMessages,
    patchPresence,
    patchPresenceBatch,
    patchDiscordPresenceBatch,
    patchLastOnlineBatch,
    setLiveSyncConnected,
    mergeDiscordVoiceMirrorFromSocket,
    applyVoiceRosterDelta,
    refreshDiscordVoiceMirrorRosters,
    resetSessionState,
  };
});

export type EchoSessionStore = ReturnType<typeof useEchoSessionStore>;
