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
  postEchoDiscordImportPostSetup,
  postEchoDiscordImportRunFull,
  postEchoJoinDirectoryServer,
  postEchoJoinWithInviteToken,
  uploadServerBrandingFile,
} from '@/api/echoClient';
import { fetchEchoInvitePreview } from '@/api/echo/invitesAndDirectory';
import { fetchEchoJoinApplicationPreview } from '@/api/echo/serverApplications';
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
  buildDiscoverableJoinConfirmPreview,
  buildInviteJoinConfirmPreview,
} from '@/features/layout/composables/joinServerConfirmPreview';
import type { JoinServerConfirmPreview } from '@/features/layout/composables/useJoinServerConfirmModal';
import type { ServerApplicationModalPayload } from '@/features/layout/composables/useServerApplicationModal';
import {
  applyNavStateToRefs,
  navStateFromRefs,
  reduceNavigation,
} from '@/features/layout/navigationReducer';
import type { RailTab } from '@/features/layout/mainSurface';
import type { DmSubView } from '@/features/layout/mainSurface';

export type JoinEchoInviteFromChatResult =
  | {
      ok: true;
      serverId: string;
      alreadyMember: boolean;
      applicationSubmitted?: boolean;
    }
  | { ok: false; error: string; needsAuth?: boolean; cancelled?: boolean };

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
  requestJoinServerConfirm: (
    preview: JoinServerConfirmPreview,
  ) => Promise<boolean>;
  finishJoinServerConfirmModal: () => void;
  requestServerApplicationModal: (
    payload: ServerApplicationModalPayload,
  ) => Promise<'submitted' | 'cancelled'>;
  finishServerApplicationModal: () => void;
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
    requestJoinServerConfirm,
    finishJoinServerConfirmModal,
    requestServerApplicationModal,
    finishServerApplicationModal,
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

  function readApplicationRequired(
    error: unknown,
  ): { serverId: string; source: 'invite' | 'directory' } | null {
    if (!(error instanceof EchoApiError)) return null;
    if (error.status !== 409) return null;
    if (error.body.code !== 'APPLICATION_REQUIRED') return null;
    const serverId =
      typeof error.body.serverId === 'string' ? error.body.serverId.trim() : '';
    if (!serverId) return null;
    const source =
      error.body.source === 'directory' ? 'directory' : 'invite';
    return { serverId, source };
  }

  async function resolveApplicationPayloadForInvite(
    inviteToken: string,
    serverId: string,
  ): Promise<ServerApplicationModalPayload | null> {
    const pv = await fetchEchoInvitePreview(inviteToken);
    if (pv?.applicationForm) {
      return {
        serverId,
        source: 'invite',
        inviteToken,
        applicationForm: pv.applicationForm,
        serverName: pv.name,
        iconUrl: pv.iconUrl,
      };
    }
    const tok = authSession.accessToken?.trim() ?? '';
    if (!tok) return null;
    const j = await fetchEchoJoinApplicationPreview(tok, serverId);
    return {
      serverId,
      source: 'invite',
      inviteToken,
      applicationForm: j.applicationForm,
      serverName: pv?.name,
      iconUrl: pv?.iconUrl,
    };
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

  async function executeJoinEchoServerWithInvite(
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
      const appReq = readApplicationRequired(e);
      if (appReq) {
        try {
          const modalPayload = await resolveApplicationPayloadForInvite(
            tok,
            appReq.serverId,
          );
          if (modalPayload) {
            const out = await requestServerApplicationModal(modalPayload);
            if (out === 'submitted') {
              return {
                ok: true,
                serverId: appReq.serverId,
                alreadyMember: false,
                applicationSubmitted: true,
              };
            }
            return { ok: false, error: '', cancelled: true };
          }
        } finally {
          finishServerApplicationModal();
        }
      }
      return {
        ok: false,
        error: getJoinFeedbackMessage(e, 'Could not join this server.'),
      };
    }
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
    const preview = await buildInviteJoinConfirmPreview(raw);
    const confirmed = await requestJoinServerConfirm(preview);
    if (!confirmed) return { ok: false, error: '', cancelled: true };
    try {
      return await executeJoinEchoServerWithInvite(raw);
    } finally {
      finishJoinServerConfirmModal();
    }
  }

  async function handleJoinWithInviteLink(raw: string) {
    addServerJoinError.value = '';
    const r = await joinEchoServerWithInviteRaw(raw);
    if (!r.ok) {
      if (r.cancelled) return;
      surfaceAddServerFlowFeedback(r.error, 'error', 'invite_join');
      return;
    }
    if (r.applicationSubmitted) {
      addServerJoinError.value =
        'Your application was submitted. You’ll get access if a moderator approves it.';
      isAddServerModalOpen.value = false;
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
    /** After run-full: enable bridge on all text/forum + voice mirror on voice. */
    discordPostImportSyncAllChannels?: boolean;
    /** After run-full: import last N messages into each empty text/forum channel (throttled). */
    discordPostImportRecentMessages?: boolean;
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
          const wantSync = payload.discordPostImportSyncAllChannels === true;
          const wantMsgs = payload.discordPostImportRecentMessages === true;
          if (wantSync || wantMsgs) {
            try {
              const post = await postEchoDiscordImportPostSetup(
                token,
                serverId,
                {
                  syncAllChannels: wantSync,
                  importRecentMessages: wantMsgs,
                  messageLimit: 90,
                },
              );
              const mf = post.messages?.failures?.length ?? 0;
              const bf = post.sync?.bridges.failures?.length ?? 0;
              const vf = post.sync?.voice.failures?.length ?? 0;
              if (mf + bf + vf > 0) {
                dispatchAppToast(
                  `Discord setup finished with some issues (${mf + bf + vf} channel(s)). Check Server Settings → Discord or channel settings.`,
                  'warning',
                );
              } else {
                const parts: string[] = [];
                if (wantMsgs && post.messages) {
                  parts.push(
                    `${post.messages.importedTotal} message(s) imported`,
                  );
                }
                if (wantSync && post.sync) {
                  parts.push(
                    `${post.sync.bridges.applied} bridge(s), ${post.sync.voice.enabled} voice mirror(s)`,
                  );
                }
                if (parts.length) {
                  dispatchAppToast(parts.join(' · '), 'info');
                }
              }
            } catch (postErr) {
              const postDetail = getJoinFeedbackMessage(
                postErr,
                'Optional Discord setup did not finish.',
              );
              dispatchAppToast(
                `${postDetail} You can enable bridges or import messages from Server Settings → Discord and each channel.`,
                'warning',
              );
            }
          }
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

  function resolveDiscoverableDirectoryRow(entry: {
    id?: string;
    name: string;
    pfp: string;
  }) {
    const graphId =
      entry.id?.trim() && isEchoGraphId(entry.id) ? entry.id.trim() : '';
    const entryName = entry.name.trim();
    const entryPfp = entry.pfp.trim();
    const rows = workspace.discoverableServers.value;
    if (graphId) {
      const byId = rows.find((r) => (r.id ?? '').trim() === graphId);
      if (byId) return byId;
    }
    if (entryPfp) {
      const byPfp = rows.find((r) => r.pfp.trim() === entryPfp);
      if (byPfp) return byPfp;
    }
    if (entryName) {
      return rows.find((r) => r.name.trim() === entryName);
    }
    return undefined;
  }

  async function handleJoinDiscoverableServer(entry: {
    id?: string;
    name: string;
    pfp: string;
    memberCount?: number;
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
      const directoryRow = resolveDiscoverableDirectoryRow(entry);
      const confirmPreview = buildDiscoverableJoinConfirmPreview({
        name: entryName || directoryRow?.name || 'Server',
        pfp: entryPfp || directoryRow?.pfp || '',
        memberCount: entry.memberCount ?? directoryRow?.memberCount,
        description: directoryRow?.description,
      });
      const confirmed = await requestJoinServerConfirm(confirmPreview);
      if (!confirmed) return;

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
        const appReq = readApplicationRequired(e);
        if (appReq?.source === 'directory') {
          try {
            const j = await fetchEchoJoinApplicationPreview(
              token,
              resolvedGraphId,
            );
            const out = await requestServerApplicationModal({
              serverId: appReq.serverId,
              source: 'directory',
              applicationForm: j.applicationForm,
              serverName: entryName || directoryRow?.name,
              iconUrl: entryPfp || directoryRow?.pfp,
            });
            if (out === 'submitted') {
              addServerJoinError.value =
                'Your application was submitted. You’ll get access if a moderator approves it.';
              isAddServerModalOpen.value = false;
              if (!isMoreServersPinned.value) {
                isMoreServersPanelOpen.value = false;
              }
              return;
            }
          } finally {
            finishServerApplicationModal();
          }
        }
        const msg = getJoinFeedbackMessage(e, 'Could not join this server.');
        surfaceAddServerFlowFeedback(msg, 'error', 'explore_join_directory');
      } finally {
        finishJoinServerConfirmModal();
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
