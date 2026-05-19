import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Server } from '@shared/types';
import { useEchoSessionStore } from '@/stores/echoSession';
import { canMemberLeaveEchoServer } from '@/utils/echoServerOwnership';
import {
  applySavedServerRailOrder,
  pruneSavedServerRailOrder,
  writeSavedServerRailOrder,
} from '@/utils/serverRailOrderPersistence';
import {
  VISIBLE_SERVER_RAIL_SLOT_COUNT,
  MAX_STARRED_SERVERS,
  SERVER_RAIL_MRU_MAX_STORED,
  projectServerRailVisibleServers,
  reorderServerRail,
} from '@/utils/serverRailReorder';

/** Show the “extra servers” rail control when joined count exceeds {@link VISIBLE_SERVER_RAIL_SLOT_COUNT}. */
export const EXTRA_SERVERS_RAIL_MIN_JOINED = VISIBLE_SERVER_RAIL_SLOT_COUNT + 1;

const LAST_VISITED_GUILD_STORAGE_KEY = 'echo-last-visited-guild-v1';
const PINNED_MORE_SERVERS_STORAGE_KEY = 'echo-pinned-more-servers-v1';
const SERVER_RAIL_MRU_STORAGE_KEY = 'echo-server-rail-mru-v1';
const ECHO_SERVER_ID = 'echo';

function readLastVisitedGuildId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_VISITED_GUILD_STORAGE_KEY)?.trim();
    if (!raw || raw === ECHO_SERVER_ID) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeLastVisitedGuildId(serverId: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!serverId || serverId === ECHO_SERVER_ID) return;
    localStorage.setItem(LAST_VISITED_GUILD_STORAGE_KEY, serverId);
  } catch {
    /* ignore quota / private mode */
  }
}

function readPinnedMoreServerIds(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PINNED_MORE_SERVERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue;
      const id = entry.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= MAX_STARRED_SERVERS) break;
    }
    return ids;
  } catch {
    return [];
  }
}

function writePinnedMoreServerIds(ids: readonly string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const capped = ids.slice(0, MAX_STARRED_SERVERS);
    localStorage.setItem(
      PINNED_MORE_SERVERS_STORAGE_KEY,
      JSON.stringify(capped),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

function readServerRailMruIds(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SERVER_RAIL_MRU_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue;
      const id = entry.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= SERVER_RAIL_MRU_MAX_STORED) break;
    }
    return ids;
  } catch {
    return [];
  }
}

function writeServerRailMruIds(ids: readonly string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const capped = ids.slice(0, SERVER_RAIL_MRU_MAX_STORED);
    localStorage.setItem(SERVER_RAIL_MRU_STORAGE_KEY, JSON.stringify(capped));
  } catch {
    /* ignore quota / private mode */
  }
}

function mergeMruWithJoinedServers(
  prevMru: readonly string[],
  joined: readonly Server[],
): string[] {
  const valid = new Set(joined.map((s) => s.id));
  let next = prevMru.filter((id) => valid.has(id));
  for (const s of joined) {
    if (!next.includes(s.id)) next.push(s.id);
  }
  if (next.length === 0 && joined.length > 0) next = joined.map((s) => s.id);
  return next.slice(0, SERVER_RAIL_MRU_MAX_STORED);
}

function touchServerRailMru(
  prev: readonly string[],
  serverId: string,
  joined: readonly Server[],
): string[] {
  const valid = new Set(joined.map((s) => s.id));
  if (!valid.has(serverId)) return [...prev];
  const next = [
    serverId,
    ...prev.filter((id) => id !== serverId && valid.has(id)),
  ];
  return next.slice(0, SERVER_RAIL_MRU_MAX_STORED);
}

/**
 * A Pinia store for managing server-related state.
 */
export const useServerStore = defineStore('server', () => {
  // --- State ---
  const echoSession = useEchoSessionStore();

  const servers = computed<Server[]>(() => echoSession.servers as Server[]);
  function setServersState(next: Server[]) {
    echoSession.servers = next as typeof echoSession.servers;
  }

  /** Starred guilds from Extra servers (max {@link MAX_STARRED_SERVERS}); shown first on the rail. */
  const pinnedMoreServers = ref<Server[]>([]);

  /** Most-recently opened real guilds (MRU), persisted — drives non-starred rail slots. */
  const serverRailMru = ref<string[]>(readServerRailMruIds());

  function persistPinnedMoreServers(): void {
    writePinnedMoreServerIds(pinnedMoreServers.value.map((s) => s.id));
  }

  function resolvePersistedPinnedServers(
    allServers: readonly Server[],
  ): Server[] {
    const byId = new Map(allServers.map((s) => [s.id, s] as const));
    return readPinnedMoreServerIds()
      .map((id) => byId.get(id))
      .filter((s): s is Server => !!s)
      .slice(0, MAX_STARRED_SERVERS);
  }

  /**
   * The ID of the currently selected server.
   * `null` means no server is selected.
   */
  const selectedServerId = ref<string | null>(null);

  // --- Getters ---

  const selectedServer = computed(() => {
    if (!selectedServerId.value) return null;
    return servers.value.find((s) => s.id === selectedServerId.value) ?? null;
  });

  const visibleServers = computed<Server[]>(() => {
    return projectServerRailVisibleServers(
      servers.value,
      pinnedMoreServers.value,
      serverRailMru.value,
    ).visible;
  });

  // --- Actions ---

  /**
   * Sets the currently selected server by its ID.
   * @param {string | null} serverId - The ID of the server to select, or `null` to deselect.
   */
  function selectServer(serverId: string | null) {
    selectedServerId.value = serverId;
    if (
      serverId &&
      serverId !== ECHO_SERVER_ID &&
      servers.value.some((s) => s.id === serverId)
    ) {
      writeLastVisitedGuildId(serverId);
      // Only promote MRU when the guild is not already on the fixed rail slice.
      // `projectServerRailVisibleServers` fills non-starred slots from MRU order,
      // so touching MRU on every rail click reshuffles icons even though the user
      // only meant to switch servers (not reorder).
      const { visible } = projectServerRailVisibleServers(
        servers.value,
        pinnedMoreServers.value,
        serverRailMru.value,
      );
      if (!visible.some((s) => s.id === serverId)) {
        serverRailMru.value = touchServerRailMru(
          serverRailMru.value,
          serverId,
          servers.value,
        );
        writeServerRailMruIds(serverRailMru.value);
      }
    }
  }

  /**
   * Prefer the last visited real guild (persisted), else current selection if it is a joined guild,
   * else the first joined server. Used when opening the servers rail from DM/Explore and on bootstrap.
   */
  function pickPreferredGuildServerId(): string | null {
    const list = servers.value;
    if (!list.length) return null;
    const ids = new Set(list.map((s) => s.id));
    const last = readLastVisitedGuildId();
    if (last && ids.has(last)) return last;
    const cur = selectedServerId.value;
    if (cur && cur !== ECHO_SERVER_ID && ids.has(cur)) return cur;
    return list[0]!.id;
  }

  function setServers(newServers: Server[]) {
    const ordered = applySavedServerRailOrder(newServers);
    setServersState(ordered);
    pinnedMoreServers.value = resolvePersistedPinnedServers(ordered);
    persistPinnedMoreServers();
    serverRailMru.value = mergeMruWithJoinedServers(
      serverRailMru.value,
      ordered,
    );
    writeServerRailMruIds(serverRailMru.value);
  }

  function replacePinnedMoreServers(next: Server[]) {
    pinnedMoreServers.value = next.slice(0, MAX_STARRED_SERVERS);
    persistPinnedMoreServers();
  }

  function reorderVisibleServers(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const out = reorderServerRail({
      allServers: servers.value,
      pinnedMore: pinnedMoreServers.value,
      mruIds: serverRailMru.value,
      fromIndex,
      toIndex,
    });
    setServersState(out.servers);
    pinnedMoreServers.value = out.pinnedMore;
    serverRailMru.value = out.mruIds;
    persistPinnedMoreServers();
    writeServerRailMruIds(serverRailMru.value);
    writeSavedServerRailOrder(out.servers.map((s) => s.id));
  }

  /**
   * Updates a server's banner image.
   * (This demo stores the URL/dataURL in memory.)
   */
  function updateServerImageUrl(serverId: string, imageUrl: string) {
    setServersState(
      servers.value.map((s) => (s.id === serverId ? { ...s, imageUrl } : s)),
    );
  }

  function updateServerBannerImageUrl(
    serverId: string,
    bannerImageUrl: string,
  ) {
    setServersState(
      servers.value.map((s) =>
        s.id === serverId ? { ...s, bannerImageUrl } : s,
      ),
    );
  }

  function updateServerBannerPositionY(
    serverId: string,
    bannerPositionY: number,
  ) {
    const y = Number(bannerPositionY);
    const clamped = Number.isFinite(y) ? Math.max(0, Math.min(100, y)) : 50;
    setServersState(
      servers.value.map((s) =>
        s.id === serverId ? { ...s, bannerPositionY: clamped } : s,
      ),
    );
  }

  /** Frosted blur over server banner in channel header (client-side preference). */
  function updateServerBannerBlurEnabled(
    serverId: string,
    bannerBlurEnabled: boolean,
  ) {
    setServersState(
      servers.value.map((s) =>
        s.id === serverId ? { ...s, bannerBlurEnabled } : s,
      ),
    );
  }

  /** Extra dark overlay on server banner (client-side preference). */
  function updateServerBannerBlackoutEnabled(
    serverId: string,
    bannerBlackoutEnabled: boolean,
  ) {
    setServersState(
      servers.value.map((s) =>
        s.id === serverId ? { ...s, bannerBlackoutEnabled } : s,
      ),
    );
  }

  function updateServerVanityCode(serverId: string, vanityCode: string) {
    const v = vanityCode.trim();
    setServersState(
      servers.value.map((s) =>
        s.id === serverId
          ? { ...s, ...(v ? { vanityCode: v } : { vanityCode: undefined }) }
          : s,
      ),
    );
  }

  function pinMoreServer(server: Server) {
    if (pinnedMoreServers.value.length >= MAX_STARRED_SERVERS) return;
    if (pinnedMoreServers.value.some((s) => s.id === server.id)) return;
    const canonical = servers.value.find((s) => s.id === server.id) ?? server;
    pinnedMoreServers.value = [...pinnedMoreServers.value, canonical].slice(
      0,
      MAX_STARRED_SERVERS,
    );
    persistPinnedMoreServers();
  }

  function unpinMoreServer(serverId: string) {
    pinnedMoreServers.value = pinnedMoreServers.value.filter(
      (s) => s.id !== serverId,
    );
    persistPinnedMoreServers();
  }

  /**
   * Remove membership (client state). Clears selection if needed and falls back to Direct Messages.
   * When `currentUserId` is set, refuses if that user owns the server (transfer ownership first).
   */
  function leaveServer(
    serverId: string,
    currentUserId?: string | null,
    opts?: { afterApiLeave?: boolean },
  ) {
    const row = servers.value.find((s) => s.id === serverId);
    if (
      row &&
      !opts?.afterApiLeave &&
      !canMemberLeaveEchoServer(row, currentUserId)
    )
      return;
    setServersState(servers.value.filter((s) => s.id !== serverId));
    pinnedMoreServers.value = pinnedMoreServers.value.filter(
      (s) => s.id !== serverId,
    );
    persistPinnedMoreServers();
    serverRailMru.value = serverRailMru.value
      .filter((id) => id !== serverId)
      .slice(0, SERVER_RAIL_MRU_MAX_STORED);
    writeServerRailMruIds(serverRailMru.value);
    pruneSavedServerRailOrder(new Set(servers.value.map((s) => s.id)));
    if (selectedServerId.value === serverId) {
      selectedServerId.value = pickPreferredGuildServerId() ?? ECHO_SERVER_ID;
    }
  }

  return {
    servers,
    pinnedMoreServers,
    serverRailMru,
    selectedServerId,
    selectedServer,
    visibleServers,
    selectServer,
    pickPreferredGuildServerId,
    setServers,
    updateServerImageUrl,
    updateServerBannerImageUrl,
    updateServerBannerPositionY,
    updateServerBannerBlurEnabled,
    updateServerBannerBlackoutEnabled,
    updateServerVanityCode,
    pinMoreServer,
    unpinMoreServer,
    leaveServer,
    replacePinnedMoreServers,
    reorderVisibleServers,
  };
});
