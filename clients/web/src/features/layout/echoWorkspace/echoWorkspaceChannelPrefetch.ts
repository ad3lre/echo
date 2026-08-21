import type { EchoApiMessage } from '@/api/echo/messages';
import { fetchEchoChannelMessages } from '@/api/echoClient';
import type { EchoWorkspaceState } from '@/api/echoClient';
import {
  ECHO_CHANNEL_INITIAL_MESSAGE_PAGE_SIZE,
  ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
} from '@/features/chat/echoHistoryPageSize';
import {
  WARM_CHANNEL_CACHE_FETCH_CONCURRENCY,
  WARM_CHANNEL_CACHE_MAX_CHANNELS,
  WARM_CHANNEL_CACHE_MESSAGES_PER_CHANNEL,
} from '@/features/chat/domain/warmChannelCache';
import { firstTextChannelIdFromCategories } from '@/features/layout/echoWorkspace/utils';
import { parseAppPathname } from '@/features/layout/urlNavigation';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';
import { readJwtSub } from '@/features/layout/echoWorkspace/workspaceSessionCache';
import {
  readLastVisitedGuildId,
  readLastVisitedServerChannelMap,
} from '@/features/layout/composables/shell/lastVisitedNavigationPersistence';
import {
  readWarmChannelHeadsForServer,
  touchWarmChannelHead,
  writeWarmChannelHead,
} from '@/features/chat/domain/warmChannelHeadCache';
import {
  isBenignPrimaryFlowError,
  reportPrimaryFlowFailure,
} from '@/features/layout/failures/primaryFlowFailure';
import { sortRawMessagesInPlace } from '@/features/chat/domain/channelMessageOrder';
import {
  applyEchoHistoryInitialPageFromApi,
  applyEchoHistoryLatestPageFromApi,
} from '@/features/chat/domain/echoHistoryChannelApply';
import { ensureChannelBucket } from '@/features/chat/domain/channelMessageAuthority';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import { mapEchoMessagesToRaw } from '@/features/chat/domain/echoMessageSnapshots';

export function resolveFirstWorkspaceTextChannelId(
  state: EchoWorkspaceState,
): string | null {
  const firstSid = state.servers[0]?.id;
  if (!firstSid) return null;
  const cats = state.categoriesByServer[firstSid] ?? [];
  const firstCh = firstTextChannelIdFromCategories(cats);
  if (!firstCh || !isEchoGraphId(firstCh)) return null;
  return firstCh;
}

function channelExistsInWorkspace(
  state: EchoWorkspaceState,
  channelId: string,
): boolean {
  for (const server of state.servers) {
    const cats = state.categoriesByServer[server.id] ?? [];
    for (const cat of cats) {
      if (cat.channels.some((ch) => ch.id === channelId)) return true;
    }
  }
  return false;
}

function isTextChannelInWorkspace(
  state: EchoWorkspaceState,
  channelId: string,
): boolean {
  for (const server of state.servers) {
    const cats = state.categoriesByServer[server.id] ?? [];
    for (const cat of cats) {
      const ch = cat.channels.find((c) => c.id === channelId);
      if (ch) return ch.type === 'text';
    }
  }
  return false;
}

/** Channels the user is most likely to open immediately after workspace hydrate. */
export function resolveLikelyLandingTextChannelIds(
  state: EchoWorkspaceState,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const serverIds = state.servers.map((s) => s.id);
  if (!serverIds.length) return out;

  const lastGuild = readLastVisitedGuildId();
  const preferredServerId =
    lastGuild && serverIds.includes(lastGuild) ? lastGuild : serverIds[0]!;

  const lastChannelByServer = readLastVisitedServerChannelMap();
  const remembered = lastChannelByServer[preferredServerId]?.trim();
  if (
    remembered &&
    isEchoGraphId(remembered) &&
    isTextChannelInWorkspace(state, remembered)
  ) {
    out.push(remembered);
    seen.add(remembered);
  }

  const cats = state.categoriesByServer[preferredServerId] ?? [];
  const firstText = firstTextChannelIdFromCategories(cats);
  if (firstText && isEchoGraphId(firstText) && !seen.has(firstText)) {
    out.push(firstText);
    seen.add(firstText);
  }

  return out;
}

export function resolveWorkspaceBootstrapTextChannelIds(
  state: EchoWorkspaceState,
  limit = 6,
  opts?: { priorityChannelIds?: readonly string[] },
): string[] {
  const base: string[] = [];
  const seen = new Set<string>();
  for (const server of state.servers) {
    if (base.length >= limit) break;
    const cats = state.categoriesByServer[server.id] ?? [];
    const firstCh = firstTextChannelIdFromCategories(cats);
    if (!firstCh || !isEchoGraphId(firstCh) || seen.has(firstCh)) continue;
    seen.add(firstCh);
    base.push(firstCh);
  }

  const priority = (opts?.priorityChannelIds ?? []).filter(
    (id): id is string =>
      !!id &&
      isEchoGraphId(id) &&
      channelExistsInWorkspace(state, id) &&
      isTextChannelInWorkspace(state, id),
  );

  const out: string[] = [];
  const orderedSeen = new Set<string>();
  for (const id of [...priority, ...base]) {
    if (orderedSeen.has(id)) continue;
    orderedSeen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Apply bootstrap prefetch for a channel. Empty buckets get a first page;
 * non-empty buckets only gain rows missing locally so a slow/stale prefetch cannot
 * replace fresher history from `loadHistory` or realtime (messages vanishing on refresh).
 * `pageLimit` is the size the page was fetched with, so `hasMoreOlder` stays correct
 * for a smaller first page (defaults to the full page size).
 */
export function applyPrefetchedWorkspaceChannelMessages(
  channelId: string,
  apiMessages: EchoApiMessage[],
  pageLimit: number = ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
  opts?: { cacheUserId?: string | null; serverId?: string | null },
): void {
  const raw = mapEchoMessagesToRaw(apiMessages);
  sortRawMessagesInPlace(raw);
  const activeChannelId = messageWindowAuthority.getActiveChannelId() ?? '';
  ensureChannelBucket(channelId);
  const index = messageWindowAuthority.getIndex(channelId);
  if (index.sorted.value.length === 0) {
    applyEchoHistoryInitialPageFromApi(
      channelId,
      raw,
      apiMessages.length,
      activeChannelId,
      pageLimit,
    );
    const userId = opts?.cacheUserId?.trim();
    const serverId = opts?.serverId?.trim();
    if (userId && serverId) {
      void writeWarmChannelHead({
        userId,
        serverId,
        channelId,
        messages: index.sorted.value,
        hasMoreOlder:
          apiMessages.length >= pageLimit ||
          messageWindowAuthority.getHasMoreOlderForChannel(channelId),
      });
    }
    return;
  }
  const missing = raw.filter((m) => {
    const id = m.id?.trim();
    return !!id && !index.byId.has(id);
  });
  if (missing.length > 0) {
    applyEchoHistoryLatestPageFromApi(channelId, missing, activeChannelId);
  }
  const userId = opts?.cacheUserId?.trim();
  const serverId = opts?.serverId?.trim();
  if (userId && serverId && index.sorted.value.length > 0) {
    void writeWarmChannelHead({
      userId,
      serverId,
      channelId,
      messages: index.sorted.value,
      hasMoreOlder: messageWindowAuthority.getHasMoreOlderForChannel(channelId),
    });
  }
}

const prefetchInFlight = new Set<string>();
const prefetchAbortControllerByChannel = new Map<string, AbortController>();

export function isChannelMessagePrefetchInFlight(channelId: string): boolean {
  return prefetchInFlight.has(channelId.trim());
}

export function cancelChannelMessagePrefetch(channelId: string): void {
  const cid = channelId.trim();
  if (!cid) return;
  prefetchAbortControllerByChannel.get(cid)?.abort();
}

export function shouldSkipChannelMessagePrefetch(channelId: string): boolean {
  const cid = channelId.trim();
  if (!cid || !isEchoGraphId(cid)) return true;
  if (prefetchInFlight.has(cid)) return true;
  const index = messageWindowAuthority.getIndex(cid);
  return index.sorted.value.length > 0;
}

/**
 * Best-effort first-page prefetch for a text channel. Safe to call from bootstrap,
 * hover, or server switch — dedupes in-flight work and skips non-empty buckets.
 */
export async function prefetchChannelMessagesFirstPage(
  token: string,
  channelId: string,
  opts?: {
    flow?: string;
    pageLimit?: number;
    serverId?: string;
    cacheUserId?: string;
    signal?: AbortSignal;
  },
): Promise<boolean> {
  const cid = channelId.trim();
  if (!token.trim() || shouldSkipChannelMessagePrefetch(cid)) return false;
  const cacheUserId = opts?.cacheUserId?.trim() || readJwtSub(token);
  const pageLimit = opts?.pageLimit ?? ECHO_CHANNEL_INITIAL_MESSAGE_PAGE_SIZE;
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  opts?.signal?.addEventListener('abort', onExternalAbort, { once: true });
  if (opts?.signal?.aborted) controller.abort();
  prefetchAbortControllerByChannel.set(cid, controller);
  prefetchInFlight.add(cid);
  try {
    const { messages: apiMsgs } = await fetchEchoChannelMessages(token, cid, {
      limit: pageLimit,
      signal: controller.signal,
    });
    applyPrefetchedWorkspaceChannelMessages(cid, apiMsgs, pageLimit, {
      cacheUserId,
      serverId: opts?.serverId,
    });
    return true;
  } catch (e) {
    if (controller.signal.aborted) return false;
    const flow = opts?.flow ?? 'prefetchChannelMessagesFirstPage';
    if (isBenignPrimaryFlowError(e, flow, { channelId: cid })) return false;
    reportPrimaryFlowFailure(flow, e, { channelId: cid });
    return false;
  } finally {
    opts?.signal?.removeEventListener('abort', onExternalAbort);
    if (prefetchAbortControllerByChannel.get(cid) === controller) {
      prefetchAbortControllerByChannel.delete(cid);
    }
    prefetchInFlight.delete(cid);
  }
}

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

export function canWarmChannelHeadsInBackground(): boolean {
  if (typeof navigator !== 'undefined') {
    if (navigator.onLine === false) return false;
    const nav = navigator as Navigator & {
      connection?: NetworkInformationLike;
      mozConnection?: NetworkInformationLike;
      webkitConnection?: NetworkInformationLike;
    };
    const connection =
      nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
    if (connection?.saveData) return false;
    const type = connection?.effectiveType?.toLowerCase();
    if (type === 'slow-2g' || type === '2g') return false;
  }
  return (
    typeof document === 'undefined' || document.visibilityState === 'visible'
  );
}

function textChannelIdsForServer(
  state: Pick<EchoWorkspaceState, 'categoriesByServer'>,
  serverId: string,
): string[] {
  const out: string[] = [];
  for (const category of state.categoriesByServer[serverId] ?? []) {
    for (const channel of category.channels ?? []) {
      if (
        channel.type === 'text' &&
        isEchoGraphId(channel.id) &&
        !out.includes(channel.id)
      ) {
        out.push(channel.id);
      }
    }
  }
  return out;
}

export function resolveWarmServerTextChannelIds(
  state: Pick<EchoWorkspaceState, 'categoriesByServer'>,
  serverId: string,
  opts?: {
    activeChannelId?: string | null;
    attentionChannelIds?: readonly string[];
    recentChannelIds?: readonly string[];
  },
): string[] {
  const available = new Set(textChannelIdsForServer(state, serverId));
  const ordered = [
    opts?.activeChannelId ?? '',
    ...(opts?.attentionChannelIds ?? []),
    ...(opts?.recentChannelIds ?? []),
    ...available,
  ];
  const seen = new Set<string>();
  return ordered
    .map((id) => id.trim())
    .filter((id) => {
      if (!id || !available.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, WARM_CHANNEL_CACHE_MAX_CHANNELS);
}

let warmServerGeneration = 0;
let warmServerAbortController: AbortController | null = null;
let warmServerIdInProgress: string | null = null;

export function cancelWarmCurrentServerChannelHeads(): void {
  warmServerGeneration++;
  warmServerAbortController?.abort();
  warmServerAbortController = null;
  warmServerIdInProgress = null;
}

async function hydrateWarmServerHeads(
  userId: string,
  serverId: string,
  priorityChannelIds: readonly string[],
  generation: number,
): Promise<void> {
  const rows = await readWarmChannelHeadsForServer(userId, serverId, {
    priorityChannelIds,
  });
  for (const row of rows) {
    if (generation !== warmServerGeneration) return;
    if (
      messageWindowAuthority.getIndex(row.channelId).sorted.value.length > 0
    ) {
      continue;
    }
    applyEchoHistoryInitialPageFromApi(
      row.channelId,
      row.messages,
      row.messages.length,
      messageWindowAuthority.getActiveChannelId() ?? '',
      WARM_CHANNEL_CACHE_MESSAGES_PER_CHANNEL,
    );
    messageWindowAuthority.setHasMoreOlder(row.channelId, row.hasMoreOlder);
  }
}

function waitForWarmChannelIdle(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const idle = globalThis as typeof globalThis & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
    };
    if (typeof idle.requestIdleCallback === 'function') {
      idle.requestIdleCallback(resolve, { timeout: 1_500 });
      return;
    }
    setTimeout(resolve, 0);
  });
}

function waitUntilWarmChannelHeadsAllowed(
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (canWarmChannelHeadsInBackground()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const network = nav as
      | (Navigator & {
          connection?: EventTarget;
          mozConnection?: EventTarget;
          webkitConnection?: EventTarget;
        })
      | null;
    const connectionTarget =
      network?.connection ??
      network?.mozConnection ??
      network?.webkitConnection;
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      globalThis.removeEventListener?.('online', onEnvironmentChange);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onEnvironmentChange);
      }
      connectionTarget?.removeEventListener?.('change', onEnvironmentChange);
    };
    const finish = (allowed: boolean) => {
      cleanup();
      resolve(allowed);
    };
    const onAbort = () => finish(false);
    const onEnvironmentChange = () => {
      if (canWarmChannelHeadsInBackground()) finish(true);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    globalThis.addEventListener?.('online', onEnvironmentChange);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onEnvironmentChange);
    }
    connectionTarget?.addEventListener?.('change', onEnvironmentChange);
  });
}

export async function runWarmChannelTasksWithConcurrency(
  ids: readonly string[],
  concurrency: number,
  task: (id: string) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      if (id) await task(id);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()),
  );
}

export function warmCurrentServerChannelHeadsNonBlocking(
  token: string,
  state: Pick<EchoWorkspaceState, 'categoriesByServer'>,
  serverId: string,
  opts?: {
    userId?: string | null;
    activeChannelId?: string | null;
    attentionChannelIds?: readonly string[];
    recentChannelIds?: readonly string[];
  },
): void {
  const sid = serverId.trim();
  const userId = opts?.userId?.trim() || readJwtSub(token);
  if (!token.trim() || !userId || !sid || !isEchoGraphId(sid)) return;
  const channelIds = resolveWarmServerTextChannelIds(state, sid, opts);
  if (!channelIds.length) return;
  const activeChannelId = opts?.activeChannelId?.trim();
  if (activeChannelId) {
    void touchWarmChannelHead(userId, sid, activeChannelId);
  }
  // Priority changes inside one server must not abort requests and then skip
  // their replacements because the old calls are still in the in-flight set.
  if (
    warmServerIdInProgress === sid &&
    warmServerAbortController &&
    !warmServerAbortController.signal.aborted
  ) {
    return;
  }
  const generation = ++warmServerGeneration;
  warmServerAbortController?.abort();
  const controller = new AbortController();
  warmServerAbortController = controller;
  warmServerIdInProgress = sid;
  void (async () => {
    try {
      await hydrateWarmServerHeads(userId, sid, channelIds, generation);
      await waitForWarmChannelIdle(controller.signal);
      const allowed = await waitUntilWarmChannelHeadsAllowed(controller.signal);
      if (generation !== warmServerGeneration || !allowed) {
        return;
      }
      await runWarmChannelTasksWithConcurrency(
        channelIds.filter((channelId) => channelId !== activeChannelId),
        WARM_CHANNEL_CACHE_FETCH_CONCURRENCY,
        async (channelId) => {
          if (generation !== warmServerGeneration) {
            controller.abort();
            return;
          }
          if (!canWarmChannelHeadsInBackground()) {
            const resumed = await waitUntilWarmChannelHeadsAllowed(
              controller.signal,
            );
            if (!resumed || generation !== warmServerGeneration) return;
          }
          await prefetchChannelMessagesFirstPage(token, channelId, {
            flow: 'prefetchWorkspaceBootstrapTextChannels',
            pageLimit: WARM_CHANNEL_CACHE_MESSAGES_PER_CHANNEL,
            serverId: sid,
            cacheUserId: userId,
            signal: controller.signal,
          });
        },
      );
    } finally {
      if (warmServerAbortController === controller) {
        warmServerAbortController = null;
        warmServerIdInProgress = null;
      }
    }
  })();
}

/** Non-blocking bootstrap warm-up for the remembered/current server. */
export function prefetchWorkspaceBootstrapTextChannelsNonBlocking(
  token: string,
  state: EchoWorkspaceState,
): void {
  const priorityChannelIds = resolveLikelyLandingTextChannelIds(state);
  const rememberedServerId = readLastVisitedGuildId();
  const serverId =
    rememberedServerId &&
    state.servers.some((server) => server.id === rememberedServerId)
      ? rememberedServerId
      : state.servers[0]?.id;
  if (!serverId) return;
  warmCurrentServerChannelHeadsNonBlocking(token, state, serverId, {
    activeChannelId: priorityChannelIds[0],
    recentChannelIds: priorityChannelIds,
  });
}

/**
 * Resolve the channel named by an inbound app URL (`/channels/{server}/{channel}`
 * or a DM thread), or '' if the path is not a channel/DM-thread route.
 */
export function inboundUrlChannelId(pathname: string, base: string): string {
  let parsed;
  try {
    parsed = parseAppPathname(pathname, base);
  } catch {
    return '';
  }
  const channelId =
    parsed.kind === 'guild' || parsed.kind === 'dm_thread'
      ? parsed.channelId.trim()
      : '';
  return channelId && isEchoGraphId(channelId) ? channelId : '';
}

/**
 * Cold-boot waterfall collapse: prefetch the first page for the channel named in
 * the inbound URL, in PARALLEL with the `/workspace` fetch (both only need the
 * token). By the time the workspace settles and the channel is selected,
 * `loadHistory` is a cache hit instead of a cold round-trip that can only start
 * *after* `/workspace` returns. Best-effort and non-blocking; safe to call before
 * the workspace exists (unlike the bootstrap prefetch, which needs resolved state).
 */
export function prefetchInboundUrlChannelFirstPage(
  token: string,
  pathname: string,
  base: string,
): void {
  if (!token.trim()) return;
  const channelId = inboundUrlChannelId(pathname, base);
  if (!channelId) return;
  void prefetchChannelMessagesFirstPage(token, channelId, {
    flow: 'bootUrlChannelPrefetch',
  });
}

export function _resetChannelMessagePrefetchForTesting(): void {
  for (const controller of prefetchAbortControllerByChannel.values()) {
    controller.abort();
  }
  prefetchAbortControllerByChannel.clear();
  prefetchInFlight.clear();
  cancelWarmCurrentServerChannelHeads();
}
