import { computed, nextTick, watch, ref, type Ref, type ShallowRef } from 'vue';
import type { useServerStore } from '@/stores/server';
import type { WorkspaceStateApi } from '@/composables/useEchoWorkspace';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { SettingsSection } from '@/features/settings/types';
import type { ServerSettingsSection } from '@/features/server-settings/types';
import type { ChannelSummary } from '@shared/types';
import {
  deriveHasGuildChannelChrome,
  deriveMainSurface,
  isDmThreadId,
  type NavState,
} from '@/features/layout/mainSurface';
import { useRailNavigation } from './useRailNavigation';
import { createDmRailIntents } from './useAppLayoutDmIntents';
import { useUrlNavigationSync } from '@/features/layout/composables/useUrlNavigationSync';
import {
  registerEchoProductDeepLinkNavigator,
  flushPendingEchoProductDeepLink,
} from '@/platform/desktopProductDeepLink';
import {
  logShellNav,
  logShellNavWithStack,
} from '@/features/layout/shellNavDebugLog';
import { emitActiveChannelNavDiagnostic } from '@/features/layout/emitActiveChannelNavDiagnostic';
import { beginChatSwitch } from '@/features/layout/chatSwitchPerfTrace';
import { isServerEmptyOnboarding as isServerEmptyOnboardingDomain } from '@/services/domain/workspaceShellSelection';
import { isEchoGraphId } from '@/utils/echoIds';

type CategoryRow = {
  name: string;
  channels: { id: string; type: string }[];
};

const LAST_VISITED_SERVER_CHANNEL_STORAGE_KEY =
  'echo-last-visited-server-channel-v1';

function readLastVisitedServerChannelMap(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LAST_VISITED_SERVER_CHANNEL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [serverId, channelId] of Object.entries(parsed)) {
      if (
        typeof serverId === 'string' &&
        serverId.trim() &&
        typeof channelId === 'string' &&
        channelId.trim()
      ) {
        out[serverId.trim()] = channelId.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeLastVisitedServerChannelMap(map: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      LAST_VISITED_SERVER_CHANNEL_STORAGE_KEY,
      JSON.stringify(map),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export interface UseAppLayoutShellNavigationOptions {
  base: string;
  activeRailTab: Ref<NavState['rail']>;
  isDMPanelOpen: Ref<boolean>;
  isMoreServersPanelOpen: Ref<boolean>;
  pfpBarExpanded: Ref<boolean>;
  activeChannelId: Ref<string>;
  selectedDMUserId: Ref<string | null>;
  dmActiveTab: Ref<NavState['dmSubView']>;
  selectedMessageRequestId: Ref<string | null>;
  serverStore: ReturnType<typeof useServerStore>;
  workspace: WorkspaceStateApi;
  authSession: ReturnType<typeof useAuthSessionStore>;
  echoDmThreadIds: Ref<Set<string>>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  selectDmUser: (userId: string) => Promise<string | null>;
  getLatestDmPeerUserIdForRail: () => string | null;
  /** When set, DM rail button restores the top inbox row (1:1 or group). */
  getLatestDmInboxTargetForRail?: () =>
    | { kind: 'user'; userId: string }
    | { kind: 'group'; channelId: string }
    | null;
  /** When set with {@link getLatestDmInboxTargetForRail}, opens group threads from the rail. */
  selectGroupDMFromRail?: (channelId: string) => void;
  findChannelContextById: (channelId: string | null | undefined) => {
    channel?: ChannelSummary;
    category: { channelPermissionDefaults?: unknown };
  } | null;
  getFirstTextChannelId: (cats: CategoryRow[]) => string;
  canOpenServerSettingsForServer: (serverId: string) => boolean;
  isSettingsModalOpen: Ref<boolean>;
  settingsModalInitialSection: Ref<SettingsSection | null>;
  settingsModalActiveSection: Ref<SettingsSection>;
  isServerSettingsModalOpen: Ref<boolean>;
  serverSettingsModalInitialSection: Ref<ServerSettingsSection | null>;
  serverSettingsModalActiveSection: Ref<ServerSettingsSection>;
  /** Optional; when set, included in DM-panel close debug log (after `useAppLayoutDmCalls`). */
  dmCallWithUserId?: Ref<string | null>;
  /** When set, emits session nav diagnostic on distinct `activeChannelId` changes (same watch as shell log). */
  navDiagnosticsTraceId?: string;
  /** Wired after `useAppLayoutGroupDm`; opens group DM from server-rail avatar stack. */
  selectGroupDmForIncomingRail?: ShallowRef<
    ((channelId: string) => void) | undefined
  >;
  isGuestUser?: () => boolean;
  onGuestDmBlocked?: () => void;
  isCompactShell: Ref<boolean>;
}

export function useAppLayoutShellNavigation(
  opts: UseAppLayoutShellNavigationOptions,
) {
  const lastVisitedChannelByServerId = ref<Record<string, string>>(
    readLastVisitedServerChannelMap(),
  );

  const isDmThreadChannelActive = computed(
    () =>
      isDmThreadId(opts.activeChannelId.value) ||
      opts.echoDmThreadIds.value.has(opts.activeChannelId.value),
  );

  const railNav = useRailNavigation({
    activeRailTab: opts.activeRailTab,
    isDMPanelOpen: opts.isDMPanelOpen,
    isMoreServersPanelOpen: opts.isMoreServersPanelOpen,
    pfpBarExpanded: opts.pfpBarExpanded,
    activeChannelId: opts.activeChannelId,
    selectedDMUserId: opts.selectedDMUserId,
    dmActiveTab: opts.dmActiveTab,
    selectedMessageRequestId: opts.selectedMessageRequestId,
    selectedServerId: computed(() => opts.serverStore.selectedServerId),
    selectDM: opts.selectDmUser,
    getLatestDMUserId: opts.getLatestDmPeerUserIdForRail,
    getLatestDmInboxTarget: opts.getLatestDmInboxTargetForRail,
    selectGroupDM: opts.selectGroupDMFromRail,
    isPersistedEchoDmThread: (cid) => opts.echoDmThreadIds.value.has(cid),
    isDmThreadActive: isDmThreadChannelActive,
    isGuestUser: opts.isGuestUser,
    onGuestDmBlocked: opts.onGuestDmBlocked,
    isCompactShell: opts.isCompactShell,
  });

  const {
    selectServersTab: selectServersTabRaw,
    selectExploreTab,
    selectDMTab,
    closeDMPanel,
    dispatchNav,
  } = railNav;

  function channelExistsInServer(
    serverId: string,
    channelId: string | null | undefined,
  ): channelId is string {
    if (!channelId) return false;
    const cats = (opts.workspace.categoriesByServer.value[serverId] ??
      []) as CategoryRow[];
    return cats.some((category) =>
      category.channels.some((channel) => channel.id === channelId),
    );
  }

  function resolveImmediateServerChannelId(
    serverId: string,
    preferredChannelId?: string | null,
  ): string {
    const cats = (opts.workspace.categoriesByServer.value[serverId] ??
      []) as CategoryRow[];
    const channelIds = new Set<string>();
    for (const category of cats) {
      for (const channel of category.channels) {
        if (channel.id) channelIds.add(channel.id);
      }
    }
    const hasChannel = (id: string | null | undefined): id is string =>
      typeof id === 'string' && !!id && channelIds.has(id);
    const prefRaw =
      typeof preferredChannelId === 'string' ? preferredChannelId.trim() : '';
    if (prefRaw) {
      if (hasChannel(prefRaw)) return prefRaw;
      /** Jump / deep-link targets may refer to a channel not yet present in the cached tree (e.g. race after hydrate). */
      if (isEchoGraphId(prefRaw)) return prefRaw;
    }
    const remembered = lastVisitedChannelByServerId.value[serverId];
    if (hasChannel(remembered)) return remembered;
    if (hasChannel(opts.activeChannelId.value))
      return opts.activeChannelId.value;
    return opts.getFirstTextChannelId(cats);
  }

  function openServerSurface(
    serverId: string,
    preferredChannelId?: string | null,
  ) {
    if (!serverId || serverId === 'echo') {
      selectServersTabRaw();
      return;
    }
    const nextChannelId = resolveImmediateServerChannelId(
      serverId,
      preferredChannelId,
    );
    opts.serverStore.selectServer(serverId);
    selectServersTabRaw();
    opts.activeChannelId.value = nextChannelId;
  }

  function rememberLastChannelForServer(
    serverId: string | null | undefined,
    channelId: string | null | undefined,
  ): void {
    const sid = serverId?.trim();
    const cid = channelId?.trim();
    if (!sid || sid === 'echo' || !cid) return;
    if (!channelExistsInServer(sid, cid)) return;
    if (lastVisitedChannelByServerId.value[sid] === cid) return;
    lastVisitedChannelByServerId.value = {
      ...lastVisitedChannelByServerId.value,
      [sid]: cid,
    };
    writeLastVisitedServerChannelMap(lastVisitedChannelByServerId.value);
  }

  /**
   * Wraps the raw rail navigation to pre-resolve the guild text channel in the
   * same synchronous tick.  Without this, the reducer sets activeChannelId to
   * the placeholder `'general'`, then a watcher rewrites it to the real channel
   * — causing every downstream watcher (socket join, history load, pins, caps,
   * presence) to fire *twice*.
   */
  function selectServersTab() {
    const preferred = opts.serverStore.pickPreferredGuildServerId();
    if (preferred && preferred !== 'echo') {
      openServerSurface(preferred);
      return;
    }
    selectServersTabRaw();
  }

  const {
    selectIncomingDmFromRail,
    selectIncomingGroupDmFromRail,
    openDmInboxFromRailOverflow,
  } = createDmRailIntents({
    activeRailTab: opts.activeRailTab,
    isDMPanelOpen: opts.isDMPanelOpen,
    selectedDMUserId: opts.selectedDMUserId,
    activeChannelId: opts.activeChannelId,
    dmActiveTab: opts.dmActiveTab,
    selectedMessageRequestId: opts.selectedMessageRequestId,
    pfpBarExpanded: opts.pfpBarExpanded,
    echoDmPeerByChannelId: opts.echoDmPeerByChannelId,
    dispatchNav,
    selectDmUser: opts.selectDmUser,
    selectGroupDm: opts.selectGroupDmForIncomingRail,
    isGuestUser: opts.isGuestUser,
    onGuestDmBlocked: opts.onGuestDmBlocked,
  });

  const workspaceReadyForServerEmptyUi = computed(() => {
    if (opts.workspace.loading.value) return false;
    if (!opts.authSession.isAuthenticated) return true;
    return opts.workspace.fromApi.value === true;
  });

  const isServerEmptyOnboarding = computed(() => {
    return isServerEmptyOnboardingDomain({
      activeRailTab: opts.activeRailTab.value,
      serverCount: opts.serverStore.servers.length,
      selectedServerId: opts.serverStore.selectedServerId,
      categoriesForServer:
        (opts.serverStore.selectedServerId
          ? opts.workspace.categoriesByServer.value[
              opts.serverStore.selectedServerId
            ]
          : []) ?? [],
      workspaceReady: workspaceReadyForServerEmptyUi.value,
    });
  });

  function shellNavState(): NavState {
    return {
      rail: opts.activeRailTab.value,
      dmSubView: opts.dmActiveTab.value,
      activeChannelId: opts.activeChannelId.value,
      selectedServerId: opts.serverStore.selectedServerId,
    };
  }

  const mainSurface = computed(() =>
    deriveMainSurface(shellNavState(), {
      isServerEmptyOnboarding: isServerEmptyOnboarding.value,
      getServerChannelInfo: (channelId: string) => {
        if (isDmThreadId(channelId)) return null;
        const ctx = opts.findChannelContextById(channelId);
        if (!ctx?.channel) return null;
        const t = ctx.channel.type;
        if (t === 'voice') return { type: 'voice' as const };
        if (t === 'forum') return { type: 'forum' as const };
        return {
          type: 'text' as const,
          ...(typeof (ctx.channel as any).parentChannelId === 'string' &&
          (ctx.channel as any).parentChannelId.trim()
            ? { parentChannelId: (ctx.channel as any).parentChannelId.trim() }
            : {}),
        };
      },
      isPersistedEchoDmThread: (cid: string) =>
        opts.echoDmThreadIds.value.has(cid),
      selectedMessageRequestId: opts.selectedMessageRequestId.value,
    }),
  );

  watch(
    () => ({
      rail: opts.activeRailTab.value,
      selectedServerId: opts.serverStore.selectedServerId ?? null,
      channelId: opts.activeChannelId.value,
      mainSurfaceType: mainSurface.value.type,
    }),
    (next, prev) => {
      if (!prev) return;
      if (
        next.rail === prev.rail &&
        next.selectedServerId === prev.selectedServerId &&
        next.channelId === prev.channelId
      ) {
        return;
      }
      beginChatSwitch(next);
    },
  );

  const workspaceReady = computed(() => !opts.workspace.loading.value);

  function openServerSettingsFromUrl(sid: string) {
    opts.serverStore.selectServer(sid);
    opts.isServerSettingsModalOpen.value = true;
  }

  function closeDmPanelWhenServerChannelSurface() {
    if (opts.activeRailTab.value !== 'servers') return;
    const surface = mainSurface.value;
    const shouldClose =
      deriveHasGuildChannelChrome(surface) ||
      surface.type === 'serverEmptyOnboarding';
    if (!shouldClose) return;
    if (opts.isDMPanelOpen.value) {
      logShellNav('closeDmPanelWhenServerChannelSurface', 'closing_dm_panel', {
        mainSurfaceType: surface.type,
        activeChannelId: opts.activeChannelId.value,
        dmCallWithUserId: opts.dmCallWithUserId?.value ?? null,
      });
    }
    opts.isDMPanelOpen.value = false;
  }

  watch(
    () => [mainSurface.value.type, opts.activeRailTab.value] as const,
    () => {
      closeDmPanelWhenServerChannelSurface();
    },
    { flush: 'post' },
  );

  watch(
    () => opts.activeChannelId.value,
    (to, from) => {
      logShellNavWithStack('activeChannelId', 'changed', {
        from,
        to,
        rail: opts.activeRailTab.value,
        selectedServerId: opts.serverStore.selectedServerId,
        dmCallWithUserId: opts.dmCallWithUserId?.value ?? null,
        mainSurfaceType: mainSurface.value.type,
        echoDmThreadIdCount: opts.echoDmThreadIds.value.size,
        inEchoDmSet: opts.echoDmThreadIds.value.has(to),
      });
      if (opts.navDiagnosticsTraceId) {
        const traceId = opts.navDiagnosticsTraceId;
        const next = to;
        const prev = from;
        // Match former `useAppLayoutActiveChannelDiagnostics` (`flush: 'post'`) without changing this watch's flush for shell logs.
        void nextTick(() => {
          emitActiveChannelNavDiagnostic({
            traceId,
            next,
            prev,
          });
        });
      }
    },
  );

  watch(
    () =>
      [
        opts.activeRailTab.value,
        opts.serverStore.selectedServerId,
        opts.activeChannelId.value,
      ] as const,
    ([rail, selectedServerId, activeChannelId]) => {
      if (rail !== 'servers') return;
      rememberLastChannelForServer(selectedServerId, activeChannelId);
    },
  );

  const urlNavSync = useUrlNavigationSync({
    base: opts.base,
    workspaceReady,
    activeRailTab: opts.activeRailTab,
    dmActiveTab: opts.dmActiveTab,
    activeChannelId: opts.activeChannelId,
    isDMPanelOpen: opts.isDMPanelOpen,
    selectedDMUserId: opts.selectedDMUserId,
    selectedMessageRequestId: opts.selectedMessageRequestId,
    serverStore: opts.serverStore,
    workspace: opts.workspace,
    authSession: opts.authSession,
    mainSurface,
    echoDmThreadIds: opts.echoDmThreadIds,
    isSettingsModalOpen: opts.isSettingsModalOpen,
    settingsModalInitialSection: opts.settingsModalInitialSection,
    settingsModalActiveSection: opts.settingsModalActiveSection,
    isServerSettingsModalOpen: opts.isServerSettingsModalOpen,
    serverSettingsModalInitialSection: opts.serverSettingsModalInitialSection,
    serverSettingsModalActiveSection: opts.serverSettingsModalActiveSection,
    selectExploreTab,
    selectServersTab,
    openServerSurface,
    findChannelContextById: opts.findChannelContextById,
    getFirstTextChannelId: opts.getFirstTextChannelId,
    canOpenServerSettingsForServer: opts.canOpenServerSettingsForServer,
    openServerSettingsFromUrl,
  });

  registerEchoProductDeepLinkNavigator({
    applyFromBrowserLocation: urlNavSync.applyFromBrowserLocation,
    isWorkspaceReady: () => workspaceReady.value,
  });

  watch(workspaceReady, (ready) => {
    if (ready) flushPendingEchoProductDeepLink();
  });

  return {
    openServerSurface,
    selectServersTab,
    /** Servers rail without jumping to a preferred guild (compact “back to rail” / layer pop). */
    selectServersRailOnly: selectServersTabRaw,
    selectExploreTab,
    selectDMTab,
    closeDMPanel,
    dispatchNav,
    selectIncomingDmFromRail,
    selectIncomingGroupDmFromRail,
    openDmInboxFromRailOverflow,
    shellNavState,
    mainSurface,
    isServerEmptyOnboarding,
    openServerSettingsFromUrl,
  };
}
