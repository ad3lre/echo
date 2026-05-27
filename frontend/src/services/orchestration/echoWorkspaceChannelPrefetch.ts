import type { EchoApiMessage } from '@/api/echo/messages';
import { fetchEchoChannelMessages } from '@/api/echoClient';
import type { EchoWorkspaceState } from '@/api/echoClient';
import { ECHO_CHANNEL_MESSAGE_PAGE_SIZE } from '@/constants/echoHistoryPageSize';
import { firstTextChannelIdFromCategories } from '@/composables/workspace/utils';
import { isEchoGraphId } from '@/utils/echoIds';
import {
  readLastVisitedGuildId,
  readLastVisitedServerChannelMap,
} from '@/utils/lastVisitedNavigationPersistence';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
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
 * Apply bootstrap prefetch for a channel. Empty buckets get a full first page;
 * non-empty buckets only gain rows missing locally so a slow/stale prefetch cannot
 * replace fresher history from `loadHistory` or realtime (messages vanishing on refresh).
 */
export function applyPrefetchedWorkspaceChannelMessages(
  channelId: string,
  apiMessages: EchoApiMessage[],
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

function isPrefetchPermissionDeniedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('View Channel') ||
    msg.includes('VIEW_CHANNEL') ||
    msg.includes('permission overwrite')
  );
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
      limit: ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
    });
    applyPrefetchedWorkspaceChannelMessages(cid, apiMsgs);
    return true;
  } catch (e) {
    if (isPrefetchPermissionDeniedError(e)) return false;
    reportPrimaryFlowFailure(
      opts?.flow ?? 'prefetchChannelMessagesFirstPage',
      e,
      { channelId: cid },
      { showBanner: false },
    );
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

export function _resetChannelMessagePrefetchForTesting(): void {
  prefetchInFlight.clear();
}
