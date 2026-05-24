import {
  onMounted,
  onUnmounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import type { useServerStore } from '@/stores/server';
import type { WorkspaceStateApi } from '@/composables/useEchoWorkspace';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { SettingsSection } from '@/features/settings/types';
import type { ServerSettingsSection } from '@/features/server-settings/types';
import {
  reduceNavigation,
  navStateFromRefs,
  applyNavStateToRefs,
} from '@/features/layout/navigationReducer';
import type { MainSurface, NavState } from '@/features/layout/mainSurface';
import { logShellNav } from '@/features/layout/shellNavDebugLog';
import { normalizeBrowserPathParsed } from '@/features/layout/urlNavigationLocationNormalize';
import {
  buildModalSearchPatchFromState,
  planModalQueryEffectsFromUrl,
} from '@/features/layout/urlNavigationModalPolicy';
import {
  pickFallbackParsedPath,
  resolveGuildPath,
  type UrlNavigationResolveContext,
} from '@/services/orchestration/urlNavigationResolve';
import {
  formatAppPathname,
  isAppNavPath,
  mergeModalSearchParams,
  parseAppPathname,
  parseModalQueries,
  parsedPathFromMainSurface,
  shouldReplaceHistoryLeavingExploreForDmPath,
  type EchoParsedPath,
} from '@/features/layout/urlNavigation';
import { isEchoGraphId } from '@/utils/echoIds';

export interface UseUrlNavigationSyncOptions {
  base: string;
  /** After initial workspace load (`!workspace.loading`). */
  workspaceReady: ComputedRef<boolean>;
  activeRailTab: Ref<NavState['rail']>;
  dmActiveTab: Ref<NavState['dmSubView']>;
  activeChannelId: Ref<string>;
  isDMPanelOpen: Ref<boolean>;
  selectedDMUserId: Ref<string | null>;
  selectedMessageRequestId: Ref<string | null>;
  serverStore: ReturnType<typeof useServerStore>;
  workspace: WorkspaceStateApi;
  authSession: ReturnType<typeof useAuthSessionStore>;
  mainSurface: ComputedRef<MainSurface>;
  echoDmThreadIds: Ref<Set<string>>;
  isSettingsModalOpen: Ref<boolean>;
  settingsModalInitialSection: Ref<SettingsSection | null>;
  settingsModalActiveSection: Ref<SettingsSection>;
  isServerSettingsModalOpen: Ref<boolean>;
  serverSettingsModalInitialSection: Ref<ServerSettingsSection | null>;
  serverSettingsModalActiveSection: Ref<ServerSettingsSection>;
  selectExploreTab: () => void;
  selectServersTab: () => void;
  openServerSurface: (serverId: string, channelId?: string | null) => void;
  getFirstTextChannelId: (
    cats: { name: string; channels: { id: string; type: string }[] }[],
  ) => string;
  canOpenServerSettingsForServer: (serverId: string) => boolean;
  /** Select server + open modal without switching rail (preserves DM/explore path + queries). */
  openServerSettingsFromUrl: (serverId: string) => void;
  /** Resolve guild channel rows; DM deep links use this to avoid treating server channels as DM threads. */
  findChannelContextById: (channelId: string | null | undefined) => {
    channel?: unknown;
  } | null;
}

function withHash(pathAndSearch: string): string {
  if (typeof window === 'undefined') return pathAndSearch;
  const h = window.location.hash;
  return h ? `${pathAndSearch}${h}` : pathAndSearch;
}

export function useUrlNavigationSync(opts: UseUrlNavigationSyncOptions) {
  const applyingFromUrl = ref(false);
  const initialNavigationApplied = ref(false);

  function navigationResolveContext(): UrlNavigationResolveContext {
    return {
      servers: opts.serverStore.servers,
      categoriesByServer: opts.workspace.categoriesByServer.value,
      getFirstTextChannelId: opts.getFirstTextChannelId,
    };
  }

  function shellNavState(): NavState {
    return {
      rail: opts.activeRailTab.value,
      dmSubView: opts.dmActiveTab.value,
      activeChannelId: opts.activeChannelId.value,
      selectedServerId: opts.serverStore.selectedServerId ?? null,
    };
  }

  function applyDmSubPath(parsed: EchoParsedPath) {
    opts.serverStore.selectServer('echo');
    let nav = navStateFromRefs({
      rail: opts.activeRailTab.value,
      dmSubView: opts.dmActiveTab.value,
      activeChannelId: opts.activeChannelId.value,
      selectedServerId: opts.serverStore.selectedServerId ?? null,
    });
    nav = reduceNavigation(nav, { type: 'SELECT_DM_RAIL' });
    switch (parsed.kind) {
      case 'dm_idle':
        nav = reduceNavigation(nav, {
          type: 'SET_DM_SUBVIEW',
          subView: 'messages',
        });
        applyNavStateToRefs(nav, {
          activeRailTab: opts.activeRailTab,
          dmActiveTab: opts.dmActiveTab,
          activeChannelId: opts.activeChannelId,
        });
        opts.isDMPanelOpen.value = true;
        opts.selectedDMUserId.value = null;
        opts.selectedMessageRequestId.value = null;
        {
          const id = opts.activeChannelId.value;
          if (
            id.startsWith('dm-') ||
            id.startsWith('dm-group-') ||
            opts.echoDmThreadIds.value.has(id)
          ) {
            logShellNav('useUrlNavigationSync', 'dm_idle_reset_to_general', {
              previousChannelId: id,
            });
            opts.activeChannelId.value = 'general';
          }
        }
        break;
      case 'dm_friends':
        nav = reduceNavigation(nav, {
          type: 'SET_DM_SUBVIEW',
          subView: 'friends',
        });
        applyNavStateToRefs(nav, {
          activeRailTab: opts.activeRailTab,
          dmActiveTab: opts.dmActiveTab,
          activeChannelId: opts.activeChannelId,
        });
        opts.isDMPanelOpen.value = true;
        opts.selectedMessageRequestId.value = null;
        break;
      case 'dm_notifications':
        nav = reduceNavigation(nav, {
          type: 'SET_DM_SUBVIEW',
          subView: 'notifications',
        });
        applyNavStateToRefs(nav, {
          activeRailTab: opts.activeRailTab,
          dmActiveTab: opts.dmActiveTab,
          activeChannelId: opts.activeChannelId,
        });
        opts.isDMPanelOpen.value = true;
        opts.selectedMessageRequestId.value = null;
        break;
      case 'dm_thread':
        nav = reduceNavigation(nav, {
          type: 'SET_DM_SUBVIEW',
          subView: 'messages',
        });
        applyNavStateToRefs(nav, {
          activeRailTab: opts.activeRailTab,
          dmActiveTab: opts.dmActiveTab,
          activeChannelId: opts.activeChannelId,
        });
        opts.isDMPanelOpen.value = true;
        opts.selectedDMUserId.value = null;
        opts.selectedMessageRequestId.value = null;
        logShellNav('useUrlNavigationSync', 'dm_thread_path', {
          channelId: parsed.channelId,
        });
        opts.activeChannelId.value = parsed.channelId;
        {
          const cid = parsed.channelId.trim();
          if (
            cid &&
            isEchoGraphId(cid) &&
            !opts.echoDmThreadIds.value.has(cid) &&
            !opts.findChannelContextById(cid)?.channel
          ) {
            const next = new Set(opts.echoDmThreadIds.value);
            next.add(cid);
            opts.echoDmThreadIds.value = next;
          }
        }
        break;
      default:
        break;
    }
  }

  function applyParsedPath(parsed: EchoParsedPath): EchoParsedPath {
    const rctx = navigationResolveContext();
    switch (parsed.kind) {
      case 'explore':
        opts.selectExploreTab();
        return parsed;
      case 'root': {
        const fb = pickFallbackParsedPath(rctx);
        if (fb.kind === 'guild') {
          opts.openServerSurface(fb.serverId, fb.channelId);
          logShellNav('useUrlNavigationSync', 'root_path_guild_fallback', {
            serverId: fb.serverId,
            channelId: fb.channelId,
          });
        } else {
          opts.selectExploreTab();
        }
        return fb;
      }
      case 'dm_idle':
      case 'dm_friends':
      case 'dm_notifications':
      case 'dm_thread':
        applyDmSubPath(parsed);
        return parsed;
      case 'guild': {
        const resolved = resolveGuildPath(
          rctx,
          parsed.serverId,
          parsed.channelId,
        );
        if (resolved.kind !== 'guild') {
          if (resolved.kind === 'explore') opts.selectExploreTab();
          else applyParsedPath(resolved);
          return resolved;
        }
        opts.openServerSurface(resolved.serverId, resolved.channelId);
        logShellNav('useUrlNavigationSync', 'guild_path', {
          serverId: resolved.serverId,
          channelId: resolved.channelId,
        });
        return resolved;
      }
      case 'paper_public':
        return parsed;
      case 'unknown': {
        const fb = pickFallbackParsedPath(rctx);
        return applyParsedPath(fb);
      }
    }
  }

  function modalSearchPatch() {
    return buildModalSearchPatchFromState({
      isSettingsModalOpen: opts.isSettingsModalOpen.value,
      isAuthenticated: opts.authSession.isAuthenticated,
      settingsModalActiveSection: opts.settingsModalActiveSection.value,
      isServerSettingsModalOpen: opts.isServerSettingsModalOpen.value,
      selectedServerId: opts.serverStore.selectedServerId,
      serverSettingsModalActiveSection:
        opts.serverSettingsModalActiveSection.value,
    });
  }

  function desiredPathAndSearch(): { pathname: string; search: string } {
    const nav = shellNavState();
    const parsed = parsedPathFromMainSurface(nav, opts.mainSurface.value, {
      isPersistedEchoDmThread: (id) => opts.echoDmThreadIds.value.has(id),
    });
    const pathname = formatAppPathname(parsed, opts.base);
    const search = mergeModalSearchParams(
      window.location.search,
      modalSearchPatch(),
    );
    return { pathname, search };
  }

  function syncHistoryPushIfNeeded() {
    if (applyingFromUrl.value || typeof window === 'undefined') return;
    if (!opts.workspaceReady.value) return;
    if (!initialNavigationApplied.value) return;
    if (!isAppNavPath(window.location.pathname, opts.base)) return;

    const { pathname, search } = desiredPathAndSearch();
    const desired = `${pathname}${search}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (desired === current) return;

    const curParsed = parseAppPathname(window.location.pathname, opts.base);
    const nextParsed = parseAppPathname(pathname, opts.base);
    if (shouldReplaceHistoryLeavingExploreForDmPath(curParsed, nextParsed)) {
      window.history.replaceState(null, '', withHash(desired));
      return;
    }

    window.history.pushState(null, '', withHash(desired));
  }

  function replaceHistoryIfNeeded(pathname: string, search: string) {
    if (typeof window === 'undefined') return;
    const next = withHash(`${pathname}${search}`);
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== cur) {
      window.history.replaceState(null, '', next);
    }
  }

  function applyModalQueryEffectsFromSearch(search: string) {
    const mq = parseModalQueries(search);
    const plan = planModalQueryEffectsFromUrl({
      mq,
      isAuthenticated: opts.authSession.isAuthenticated,
      backendUser: opts.authSession.backendUser,
      canOpenServerSettingsForServer: opts.canOpenServerSettingsForServer,
    });

    if (plan.userSettings.kind === 'open') {
      opts.settingsModalInitialSection.value = plan.userSettings.initial;
      opts.settingsModalActiveSection.value = plan.userSettings.active;
      opts.isSettingsModalOpen.value = true;
    } else {
      opts.isSettingsModalOpen.value = false;
      opts.settingsModalInitialSection.value = null;
    }

    if (plan.guildSettings.kind === 'open') {
      opts.serverSettingsModalInitialSection.value = plan.guildSettings.initial;
      opts.serverSettingsModalActiveSection.value = plan.guildSettings.active;
      opts.openServerSettingsFromUrl(plan.guildSettings.serverId);
    } else {
      opts.isServerSettingsModalOpen.value = false;
      opts.serverSettingsModalInitialSection.value = null;
    }

    return plan;
  }

  /** Apply pathname + search from the browser (initial load or popstate). */
  function applyFromBrowserLocation() {
    if (typeof window === 'undefined') return;
    if (!isAppNavPath(window.location.pathname, opts.base)) return;
    if (!opts.workspaceReady.value) return;

    const pathname = window.location.pathname;
    const search = window.location.search;
    const voiceHint = new URLSearchParams(search.replace(/^\?/, ''))
      .get('voice')
      ?.trim();
    let pathParsed = parseAppPathname(pathname, opts.base);
    if (
      voiceHint &&
      pathParsed.kind === 'guild' &&
      !pathParsed.channelId?.trim()
    ) {
      pathParsed = { ...pathParsed, channelId: voiceHint };
    }
    const { pathParsed: normalized, adjusted } = normalizeBrowserPathParsed(
      pathParsed,
      navigationResolveContext(),
    );
    pathParsed = normalized;

    applyingFromUrl.value = true;
    try {
      const appliedPath = applyParsedPath(pathParsed);

      const plan = applyModalQueryEffectsFromSearch(search);
      let nextSearch = search;
      if (plan.stripSettings) {
        nextSearch = mergeModalSearchParams(nextSearch, { settings: null });
      }
      if (plan.stripGuild) {
        nextSearch = mergeModalSearchParams(nextSearch, {
          guild_settings: null,
          guild_section: null,
        });
      }
      if (voiceHint) {
        const sp = new URLSearchParams(nextSearch.replace(/^\?/, ''));
        if (sp.has('voice')) {
          sp.delete('voice');
          nextSearch = sp.toString() ? `?${sp.toString()}` : '';
        }
      }

      const canonicalPathname = formatAppPathname(appliedPath, opts.base);
      const mergedModal = mergeModalSearchParams(
        nextSearch,
        modalSearchPatch(),
      );
      const pathMismatch = canonicalPathname !== pathname;
      if (adjusted || plan.stripSettings || plan.stripGuild || pathMismatch) {
        replaceHistoryIfNeeded(canonicalPathname, mergedModal);
      }
    } finally {
      applyingFromUrl.value = false;
    }
  }

  watch(
    [
      opts.workspaceReady,
      opts.activeRailTab,
      opts.dmActiveTab,
      opts.activeChannelId,
      opts.mainSurface,
      opts.isSettingsModalOpen,
      opts.settingsModalActiveSection,
      opts.isServerSettingsModalOpen,
      opts.serverSettingsModalActiveSection,
      () => opts.serverStore.selectedServerId,
      () => opts.authSession.isAuthenticated,
    ],
    () => syncHistoryPushIfNeeded(),
    { flush: 'post' },
  );

  watch(
    () => opts.workspaceReady.value,
    (ready) => {
      if (!ready || initialNavigationApplied.value) return;
      initialNavigationApplied.value = true;
      applyFromBrowserLocation();
    },
    { flush: 'post' },
  );

  /**
   * After logout, `activeRailTab` may be moved to explore in workspace lifecycle, but the browser
   * can still be on `/channels/...`. The URL→nav watcher only runs on load/popstate, so the shell
   * can briefly (or stuck) derive `mainSurface: unknown` with an empty chat column. Force explore +
   * replaceState when auth transitions true → false.
   */
  watch(
    () => opts.authSession.isAuthenticated,
    (auth, prev) => {
      if (auth || prev !== true) return;
      if (!opts.workspaceReady.value || typeof window === 'undefined') return;
      if (!isAppNavPath(window.location.pathname, opts.base)) return;

      applyingFromUrl.value = true;
      try {
        applyParsedPath({ kind: 'explore' });
        const pathname = formatAppPathname({ kind: 'explore' }, opts.base);
        const mergedModal = mergeModalSearchParams(
          window.location.search,
          modalSearchPatch(),
        );
        replaceHistoryIfNeeded(pathname, mergedModal);
      } finally {
        applyingFromUrl.value = false;
      }
    },
    { flush: 'post' },
  );

  function onPopState() {
    applyFromBrowserLocation();
  }

  onMounted(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('popstate', onPopState);
  });

  onUnmounted(() => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('popstate', onPopState);
  });

  return {
    applyingFromUrl,
    applyFromBrowserLocation,
  };
}
