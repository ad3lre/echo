import {
  computed,
  nextTick,
  ref,
  watch,
  type ComputedRef,
  type Ref,
  type MaybeRefOrGetter,
  toValue,
} from 'vue';
import type { useServerStore } from '@/stores/server';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import {
  createEchoServer,
  patchEchoServerPreferences,
  postEchoDiscordImportRunFull,
  postEchoJoinDirectoryServer,
  postEchoJoinWithInviteToken,
  uploadServerBrandingFile,
} from '@/api/echoClient';
import { EchoApiError } from '@/api/echo/transport';
import {
  extractInviteTokenFromUserInput,
  extractVoiceChannelIdFromInviteUserInput,
} from '@/utils/inviteLinkParse';
import { isEchoGraphId } from '@/utils/echoIds';
import { UIErrorBus } from '@/utils/uiErrorBus';
import type { UIErrorSeverity } from '@/utils/uiErrorBus';
import {
  dispatchAppToast,
  dispatchAppToastDetail,
} from '@/utils/controllerMissingAction';
import {
  isEchoUpgradeRequiredJoinError,
  requestGuestExploreJoinBlockedModal,
} from '@/utils/guestJoinExploreBlockedDialog';

import {
  applyNavStateToRefs,
  navStateFromRefs,
  reduceNavigation,
} from '@/features/layout/navigationReducer';
import type { RailTab } from '@/features/layout/mainSurface';
import type { DmSubView } from '@/features/layout/mainSurface';

export type JoinEchoInviteFromChatResult =
  | { ok: true; serverId: string; alreadyMember: boolean }
  | { ok: false; error: string; needsAuth?: boolean };

export function useAddServerFlow(deps: {
  serverStore: ReturnType<typeof useServerStore>;
  authSession: ReturnType<typeof useAuthSessionStore>;
  workspace: WorkspaceStateApi;
  currentUser: ComputedRef<{ id: string } | undefined>;
  activeChannelId: Ref<string>;
  activeRailTab: Ref<RailTab>;
  dmActiveTab: Ref<DmSubView>;
  isAddServerModalOpen: Ref<boolean>;
  addServerInitialView: Ref<'initial' | 'create' | 'join'>;
  isMoreServersPanelOpen: Ref<boolean>;
  isMoreServersPinned: Ref<boolean>;
  newlyCreatedServerId: Ref<string | null>;
  getFirstTextChannelId: (
    cats: { name: string; channels: { id: string; type: string }[] }[],
  ) => string;
  hydrateWorkspace: () => Promise<void>;
  sendMessage: (channelId: string, content: string) => void;
  inviteLinkForServer: ComputedRef<string>;
  selectedServer: ComputedRef<{ name: string } | undefined>;
  isExploreView: MaybeRefOrGetter<boolean>;
  /** When Explore / discover join needs a signed-in user (Echo mode). */
  onPromptSignIn?: () => void;
  /** Clear Echo snowflake DM thread ids when switching to servers rail (join/create server). */
  isPersistedEchoDmThread?: (channelId: string) => boolean;
  /**
   * Resolve a persisted Echo graph DM channel id for a friend before sending the invite DM.
   * Without this, legacy `dm-{userId}` fails the socket with UNKNOWN_CHANNEL.
   */
  ensurePersistedDirectDmChannelId?: (peerUserId: string) => Promise<string>;
}) {
  const {
    serverStore,
    authSession,
    workspace,
    currentUser,
    activeChannelId,
    activeRailTab,
    dmActiveTab,
    isAddServerModalOpen,
    addServerInitialView,
    isMoreServersPanelOpen,
    isMoreServersPinned,
    newlyCreatedServerId,
    getFirstTextChannelId,
    hydrateWorkspace,
    sendMessage,
    inviteLinkForServer,
    selectedServer,
    isExploreView,
    onPromptSignIn,
    isPersistedEchoDmThread,
    ensurePersistedDirectDmChannelId,
  } = deps;

  const addServerJoinError = ref('');
  /** True while create/import API work runs after the user submits Add Server (modal stays open). */
  const addServerCreateBusy = ref(false);
  const delay = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  function getJoinFeedbackMessage(error: unknown, fallback: string): string {
    if (
      error instanceof EchoApiError &&
      error.body.detail?.trim() === 'BANNED_FROM_SERVER'
    ) {
      return 'You are banned from this server.';
    }
    if (
      error instanceof Error &&
      /banned from this server/i.test(error.message)
    ) {
      return 'You are banned from this server.';
    }
    if (error instanceof EchoApiError && error.body.message.trim()) {
      return error.body.message.trim();
    }
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }
    return fallback;
  }

  /**
   * Join/create/import feedback: always store `addServerJoinError` for inline UI.
   * When the Add Server modal is open, the shell info banner sits *under* the modal overlay,
   * so we also fire a high z-index toast. When the modal is closed, keep the banner for parity
   * with other flows (Explore, etc.).
   */
  function surfaceAddServerFlowFeedback(
    message: string,
    severity: UIErrorSeverity = 'error',
    context = 'add_server_flow',
  ) {
    addServerJoinError.value = message;
    if (isAddServerModalOpen.value) {
      dispatchAppToastDetail({
        message,
        severity: severity === 'warning' ? 'warning' : 'error',
        durationMs: severity === 'warning' ? 5200 : 6500,
      });
    } else {
      UIErrorBus.emit({
        context,
        severity,
        userMessage: message,
      });
    }
  }

  function resolveChannelIdAfterJoin(
    serverId: string,
    preferredChannelId?: string | null,
  ): string | undefined {
    const pid = preferredChannelId?.trim();
    const cats = workspace.categoriesByServer.value[serverId] ?? [];
    if (pid) {
      for (const cat of cats) {
        for (const ch of cat.channels ?? []) {
          if (ch.id === pid) return pid;
        }
      }
    }
    return getFirstTextChannelId(cats);
  }

  function focusJoinedServerInShell(
    serverId: string,
    preferredChannelId?: string | null,
  ) {
    serverStore.selectServer(serverId);
    const pick = resolveChannelIdAfterJoin(serverId, preferredChannelId);
    const navRefs = { activeRailTab, dmActiveTab, activeChannelId };
    let next = reduceNavigation(
      navStateFromRefs({
        rail: activeRailTab.value,
        dmSubView: dmActiveTab.value,
        activeChannelId: activeChannelId.value,
        selectedServerId: serverStore.selectedServerId ?? null,
      }),
      { type: 'SELECT_SERVERS_TAB' },
      isPersistedEchoDmThread ? { isPersistedEchoDmThread } : undefined,
    );
    applyNavStateToRefs(next, navRefs);
    if (pick) {
      next = reduceNavigation(
        navStateFromRefs({
          rail: activeRailTab.value,
          dmSubView: dmActiveTab.value,
          activeChannelId: activeChannelId.value,
          selectedServerId: serverStore.selectedServerId ?? null,
        }),
        { type: 'SELECT_CHANNEL', channelId: pick },
      );
      applyNavStateToRefs(next, navRefs);
    }
  }

  function hasChannelId(
    cats: { name: string; channels: { id: string; type: string }[] }[],
    channelId: string,
  ): boolean {
    for (const cat of cats) {
      for (const ch of cat.channels ?? []) {
        if (ch.id === channelId) return true;
      }
    }
    return false;
  }

  async function hydrateDiscordImportUntilReady(opts: {
    serverId: string;
    nextFromFull: string;
    defaultChannelId: string;
  }): Promise<void> {
    const { serverId, nextFromFull, defaultChannelId } = opts;
    // Import completion can be slightly eventual; retry a few hydrates so users
    // don't need a manual browser refresh to see imported channels.
    const retryBackoffMs = [320, 700, 1200];
    for (let i = 0; i < retryBackoffMs.length; i += 1) {
      const cats = workspace.categoriesByServer.value[serverId] ?? [];
      const ready = nextFromFull
        ? hasChannelId(cats, nextFromFull)
        : cats.some((cat) =>
            (cat.channels ?? []).some((ch) => ch.id !== defaultChannelId),
          );
      if (ready) return;
      await delay(retryBackoffMs[i]);
      await hydrateWorkspace();
    }
  }

  watch(
    () => isAddServerModalOpen.value,
    (open) => {
      if (open) addServerJoinError.value = '';
      if (open) void workspace.refreshExploreDirectory();
    },
  );

  watch(
    () => toValue(isExploreView),
    (explore) => {
      if (explore) void workspace.refreshExploreDirectory();
    },
  );

  function openAddServerModal(
    initialView: 'initial' | 'create' | 'join' = 'initial',
  ) {
    if (!authSession.isAuthenticated) {
      onPromptSignIn?.();
      return;
    }
    addServerInitialView.value = initialView;
    /** Open after the requested step is committed so `AddServerModal` (async) never mounts with a stale `initialView`. */
    void nextTick(() => {
      isAddServerModalOpen.value = true;
    });
  }

  async function joinEchoServerWithInviteRaw(
    raw: string,
  ): Promise<JoinEchoInviteFromChatResult> {
    if (!authSession.isAuthenticated) {
      return {
        ok: false,
        error: 'Sign in to join this server.',
        needsAuth: true,
      };
    }
    /** Cookie sessions omit `accessToken`; `echoFetch` uses `credentials: 'include'`. */
    const token = authSession.accessToken?.trim() ?? '';
    const tok = extractInviteTokenFromUserInput(raw);
    if (!tok) return { ok: false, error: 'That invite link is invalid.' };
    const voiceHint = extractVoiceChannelIdFromInviteUserInput(raw);
    try {
      const { serverId, alreadyMember } = await postEchoJoinWithInviteToken(
        token,
        tok,
      );
      await hydrateWorkspace();
      focusJoinedServerInShell(serverId, voiceHint);
      return { ok: true, serverId, alreadyMember };
    } catch (e) {
      return {
        ok: false,
        error: getJoinFeedbackMessage(e, 'Could not join this server.'),
      };
    }
  }

  async function handleJoinWithInviteLink(raw: string) {
    addServerJoinError.value = '';
    const r = await joinEchoServerWithInviteRaw(raw);
    if (!r.ok) {
      surfaceAddServerFlowFeedback(r.error, 'error', 'invite_join');
      return;
    }
    if (r.alreadyMember) {
      addServerJoinError.value =
        'You’re already in that server — opened it for you.';
    }
    isAddServerModalOpen.value = false;
  }

  async function handleCreateServer(payload: {
    name: string;
    importFromDiscord?: boolean;
    /** Discord snowflake for export bundle under bot/exports `*_{guildId}`. */
    discordGuildId?: string;
    iconUrl?: string;
    iconFile?: File;
  }) {
    if (!authSession.isAuthenticated) {
      dispatchAppToast('Sign in to create a server.', 'warning');
      onPromptSignIn?.();
      return;
    }

    addServerCreateBusy.value = true;
    /** Cookie sessions omit `accessToken`; `echoFetch` uses `credentials: 'include'`. */
    const token = authSession.accessToken?.trim() ?? '';
    const nativeIconFile = !payload.importFromDiscord
      ? payload.iconFile
      : undefined;
    const nativeIconDataUrl =
      !payload.importFromDiscord && !nativeIconFile
        ? (payload.iconUrl?.trim() ?? '')
        : '';

    try {
      addServerJoinError.value = '';
      let serverId: string;
      let defaultChannelId: string;
      /** When set, branding was saved after create; workspace hydrate may have been coalesced with an in-flight fetch from `workspace_invalidated` before the PATCH. */
      let uploadedServerIconPublicUrl: string | null = null;
      if (nativeIconFile) {
        const created = await createEchoServer(token, { name: payload.name });
        serverId = created.serverId;
        defaultChannelId = created.defaultChannelId;
        try {
          const url = await uploadServerBrandingFile(
            token,
            serverId,
            'server_icon',
            nativeIconFile,
          );
          await patchEchoServerPreferences(token, serverId, { iconUrl: url });
          uploadedServerIconPublicUrl = url;
        } catch (e) {
          /** Usually `POST /uploads/presign` 503 when S3/R2 is not configured (`UPLOADS_NOT_CONFIGURED`). */
          const fromApi =
            e instanceof Error && e.message.trim() ? e.message.trim() : '';
          dispatchAppToast(
            fromApi
              ? `Server created, but the icon was not saved: ${fromApi}`
              : 'Server created, but the icon could not be uploaded. You can add one in server settings.',
            'warning',
          );
        }
      } else {
        const created = await createEchoServer(token, {
          name: payload.name,
          ...(nativeIconDataUrl ? { iconUrl: nativeIconDataUrl } : {}),
        });
        serverId = created.serverId;
        defaultChannelId = created.defaultChannelId;
      }
      if (payload.importFromDiscord) {
        const dg = payload.discordGuildId?.trim();
        let nextFromFull = '';
        try {
          const full = await postEchoDiscordImportRunFull(token, serverId, {
            ...(dg ? { discordGuildId: dg } : {}),
          });
          nextFromFull =
            typeof full.nextChannelId === 'string'
              ? full.nextChannelId.trim()
              : '';
        } catch (e) {
          /** Drop the busy overlay first so `joinError` is not trapped under the blur layer. */
          addServerCreateBusy.value = false;
          const detail = getJoinFeedbackMessage(
            e,
            'Discord import did not finish.',
          );
          const msg = `${detail} The server was created without the Discord layout — open Server Settings → Discord and run the import steps or refresh from export.`;
          surfaceAddServerFlowFeedback(msg, 'warning', 'discord_import');
          dispatchAppToast(msg, 'warning');
        }
        await hydrateWorkspace();
        if (!addServerJoinError.value) {
          await hydrateDiscordImportUntilReady({
            serverId,
            nextFromFull,
            defaultChannelId,
          });
        }
        serverStore.selectServer(serverId);
        const cats = workspace.categoriesByServer.value[serverId] ?? [];
        const firstLive = getFirstTextChannelId(cats);
        activeChannelId.value = nextFromFull || firstLive || defaultChannelId;
        if (!firstLive && !nextFromFull) {
          dispatchAppToast(
            'Discord import is still syncing channels. If they do not appear in a few seconds, refresh.',
            'info',
          );
        }
        activeRailTab.value = 'servers';
        newlyCreatedServerId.value = serverId;
        if (!isMoreServersPinned.value) {
          isMoreServersPanelOpen.value = false;
        }
        isAddServerModalOpen.value = false;
        return;
      }
      await hydrateWorkspace();
      if (uploadedServerIconPublicUrl) {
        /**
         * Second fetch: `hydrateEchoFromApi` dedupes concurrent calls. Server create emits
         * `workspace_invalidated` while icon upload + PATCH are still running, so the first
         * awaited hydrate can resolve a snapshot taken before `icon_url` was updated.
         */
        await hydrateWorkspace();
        serverStore.updateServerImageUrl(serverId, uploadedServerIconPublicUrl);
      }
      isAddServerModalOpen.value = false;
      serverStore.selectServer(serverId);
      activeChannelId.value = defaultChannelId;
      activeRailTab.value = 'servers';
      newlyCreatedServerId.value = serverId;
      if (!isMoreServersPinned.value) {
        isMoreServersPanelOpen.value = false;
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Could not create the server. Check your connection and try again.';
      surfaceAddServerFlowFeedback(msg, 'error', 'create_echo_server');
    } finally {
      addServerCreateBusy.value = false;
    }
  }

  async function handleJoinDiscoverableServer(entry: {
    id?: string;
    name: string;
    pfp: string;
  }) {
    addServerJoinError.value = '';

    function finishMockJoin(serverId: string) {
      isAddServerModalOpen.value = false;
      focusJoinedServerInShell(serverId);
      const uid = currentUser.value?.id;
      if (uid) {
        const cur = workspace.serverMemberIds.value[serverId] ?? [];
        if (!cur.includes(uid)) {
          workspace.serverMemberIds.value = {
            ...workspace.serverMemberIds.value,
            [serverId]: [...cur, uid],
          };
        }
      }
      if (!isMoreServersPinned.value) {
        isMoreServersPanelOpen.value = false;
      }
    }

    const token = authSession.accessToken?.trim() ?? '';
    const graphId =
      entry.id?.trim() && isEchoGraphId(entry.id) ? entry.id.trim() : '';
    const entryName = entry.name.trim();
    const entryPfp = entry.pfp.trim();

    function resolveGraphIdFromDirectoryRows(
      rows: Array<{ id?: string; name: string; pfp: string }>,
    ): string {
      for (const row of rows) {
        const rid = (row.id ?? '').trim();
        if (!rid || !isEchoGraphId(rid)) continue;
        if (entryPfp && row.pfp.trim() === entryPfp) return rid;
        if (entryName && row.name.trim() === entryName) return rid;
      }
      return '';
    }

    if (graphId && authSession.isAuthenticated) {
      const already = serverStore.servers.some((s) => s.id === graphId);
      if (already) {
        isAddServerModalOpen.value = false;
        focusJoinedServerInShell(graphId);
        if (!isMoreServersPinned.value) {
          isMoreServersPanelOpen.value = false;
        }
        return;
      }
    }

    if (!authSession.isAuthenticated) {
      dispatchAppToast('Sign in to join servers from Explore.', 'warning');
      onPromptSignIn?.();
      return;
    }

    let resolvedGraphId = graphId;

    if (!resolvedGraphId && authSession.isAuthenticated) {
      await workspace.refreshExploreDirectory();
      resolvedGraphId = resolveGraphIdFromDirectoryRows(
        workspace.discoverableServers.value,
      );
    }

    if (resolvedGraphId) {
      try {
        const rows = workspace.discoverableServers.value;
        if (
          rows.length > 0 &&
          !rows.some((s) => (s.id ?? '').trim() === resolvedGraphId)
        ) {
          surfaceAddServerFlowFeedback(
            'This server is no longer listed in Explore — the directory was just updated.',
            'warning',
            'explore_join_directory',
          );
          return;
        }
        const { serverId, alreadyMember } = await postEchoJoinDirectoryServer(
          token,
          resolvedGraphId,
        );
        await hydrateWorkspace();
        const wasAddServerModalOpen = isAddServerModalOpen.value;
        isAddServerModalOpen.value = false;
        focusJoinedServerInShell(serverId);
        if (!isMoreServersPinned.value) {
          isMoreServersPanelOpen.value = false;
        }
        if (alreadyMember && wasAddServerModalOpen) {
          addServerJoinError.value =
            'You’re already in that server — opened it for you.';
        }
      } catch (e) {
        if (isEchoUpgradeRequiredJoinError(e)) {
          addServerJoinError.value =
            'Guests can’t join from Explore — create an account or use an invite link.';
          await requestGuestExploreJoinBlockedModal(
            e instanceof EchoApiError ? e.body.message : undefined,
          );
          return;
        }
        const msg = getJoinFeedbackMessage(e, 'Could not join this server.');
        surfaceAddServerFlowFeedback(msg, 'error', 'explore_join_directory');
      }
      return;
    }

    const match =
      workspace.servers.value.find((s) => s.imageUrl === entry.pfp) ??
      workspace.servers.value.find((s) => s.name === entry.name);
    if (match) {
      finishMockJoin(match.id);
      return;
    }
    const missingId = (entry.id ?? '').startsWith('explore-');
    surfaceAddServerFlowFeedback(
      missingId
        ? 'This Explore listing has no valid server id. Refresh the page and try again.'
        : 'Could not join this server. If you are using Echo, pick a server from the directory list or use an invite link.',
      'error',
      'explore_join_directory',
    );
  }

  function handleInviteFriend(
    friendId: string,
    voiceChannelId?: string | null,
    voiceChannelName?: string | null,
  ) {
    void (async () => {
      const uid = currentUser.value?.id;
      if (!uid) {
        dispatchAppToast('Sign in to send invite links to friends.', 'info');
        return;
      }
      const link = inviteLinkForServer.value.trim();
      if (!link) {
        dispatchAppToast(
          'Invite link is unavailable for this server right now.',
          'warning',
        );
        return;
      }
      const serverName = selectedServer.value?.name?.trim() ?? '';
      const vcName = voiceChannelName?.trim();
      // Build invite message with voice context if applicable
      let text: string;
      if (vcName && voiceChannelId) {
        text = `🔊 Join me in ${serverName || 'voice'}: ${vcName}\n${link}`;
      } else if (serverName) {
        text = `${serverName}\n${link}`;
      } else {
        text = link;
      }
      let channelId = `dm-${friendId}`;
      if (ensurePersistedDirectDmChannelId) {
        try {
          const resolved = await ensurePersistedDirectDmChannelId(friendId);
          const trimmed = resolved?.trim();
          if (!trimmed) {
            dispatchAppToast(
              'Could not open a direct message to send the invite. Try again.',
              'warning',
            );
            return;
          }
          channelId = trimmed;
        } catch {
          dispatchAppToast('Could not send the invite. Try again.', 'warning');
          return;
        }
      }
      sendMessage(channelId, text);
    })();
  }

  const inviteableFriends = computed(() => {
    const curId = currentUser.value?.id;
    if (!curId) return [];
    const friendIds = workspace.friendIds.value ?? [];
    return workspace.users.value
      .filter((u) => u.id !== curId && friendIds.includes(u.id))
      .map((u) => ({
        id: u.id,
        name: u.name,
        pfp: u.pfp,
      }));
  });

  return {
    addServerJoinError,
    addServerCreateBusy,
    openAddServerModal,
    joinEchoServerWithInviteRaw,
    handleJoinWithInviteLink,
    handleCreateServer,
    handleJoinDiscoverableServer,
    handleInviteFriend,
    inviteableFriends,
  };
}
