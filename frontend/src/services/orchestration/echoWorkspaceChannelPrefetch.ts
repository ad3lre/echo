import type { EchoApiMessage } from '@/api/echo/messages';
import { fetchEchoChannelMessages } from '@/api/echoClient';
import type { EchoWorkspaceState } from '@/api/echoClient';
import {
  ECHO_CHANNEL_INITIAL_MESSAGE_PAGE_SIZE,
  ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
} from '@/constants/echoHistoryPageSize';
import { firstTextChannelIdFromCategories } from '@/composables/workspace/utils';
import { parseAppPathname } from '@/features/layout/urlNavigation';
import { isEchoGraphId } from '@/utils/echoIds';
import {
  readLastVisitedGuildId,
  readLastVisitedServerChannelMap,
} from '@/utils/lastVisitedNavigationPersistence';
import {
  isBenignPrimaryFlowError,
  reportPrimaryFlowFailure,
} from '@/utils/primaryFlowFailure';
import { sortRawMessagesInPlace } from '@/services/realtime/channelMessageOrder';
import {
  applyEchoHistoryInitialPageFromApi,
  applyEchoHistoryLatestPageFromApi,
} from '@/services/realtime/echoHistoryChannelApply';
import { ensureChannelBucket } from '@/services/realtime/channelMessageAuthority';
import { messageWindowAuthority } from '@/services/realtime/messageWindowAuthority';
import { mapEchoMessagesToRaw } from '@/services/domain/echoMessageSnapshots';

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
    return;
  }
  const missing = raw.filter((m) => {
    const id = m.id?.trim();
    return !!id && !index.byId.has(id);
  });
  if (missing.length > 0) {
    applyEchoHistoryLatestPageFromApi(channelId, missing, activeChannelId);
  }
}

const prefetchInFlight = new Set<string>();

export function isChannelMessagePrefetchInFlight(channelId: string): boolean {
  return prefetchInFlight.has(channelId.trim());
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
  opts?: { flow?: string },
): Promise<boolean> {
  const cid = channelId.trim();
  if (!token.trim() || shouldSkipChannelMessagePrefetch(cid)) return false;
  prefetchInFlight.add(cid);
  try {
    const { messages: apiMsgs } = await fetchEchoChannelMessages(token, cid, {
      limit: ECHO_CHANNEL_INITIAL_MESSAGE_PAGE_SIZE,
    });
    applyPrefetchedWorkspaceChannelMessages(
      cid,
      apiMsgs,
      ECHO_CHANNEL_INITIAL_MESSAGE_PAGE_SIZE,
    );
    return true;
  } catch (e) {
    const flow = opts?.flow ?? 'prefetchChannelMessagesFirstPage';
    if (isBenignPrimaryFlowError(e, flow, { channelId: cid })) return false;
    reportPrimaryFlowFailure(flow, e, { channelId: cid });
    return false;
  } finally {
    prefetchInFlight.delete(cid);
  }
}

/** Non-blocking bootstrap prefetch: landing channel first, then the rest in parallel. */
export function prefetchWorkspaceBootstrapTextChannelsNonBlocking(
  token: string,
  state: EchoWorkspaceState,
): void {
  const priorityChannelIds = resolveLikelyLandingTextChannelIds(state);
  const channelIds = resolveWorkspaceBootstrapTextChannelIds(state, 6, {
    priorityChannelIds,
  });
  if (!channelIds.length) return;
  void (async () => {
    const [landing, ...rest] = channelIds;
    if (landing) {
      await prefetchChannelMessagesFirstPage(token, landing, {
        flow: 'prefetchWorkspaceBootstrapTextChannels',
      });
    }
    if (rest.length === 0) return;
    await Promise.allSettled(
      rest.map((channelId) =>
        prefetchChannelMessagesFirstPage(token, channelId, {
          flow: 'prefetchWorkspaceBootstrapTextChannels',
        }),
      ),
    );
  })();
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
  prefetchInFlight.clear();
}
