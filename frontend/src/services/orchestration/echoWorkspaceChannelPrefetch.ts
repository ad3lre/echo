import type { EchoApiMessage } from '@/api/echo/messages';
import type { EchoWorkspaceState } from '@/api/echoClient';
import { firstTextChannelIdFromCategories } from '@/composables/workspace/utils';
import { isEchoGraphId } from '@/utils/echoIds';
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

export function resolveWorkspaceBootstrapTextChannelIds(
  state: EchoWorkspaceState,
  limit = 6,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const server of state.servers) {
    if (out.length >= limit) break;
    const cats = state.categoriesByServer[server.id] ?? [];
    const firstCh = firstTextChannelIdFromCategories(cats);
    if (!firstCh || !isEchoGraphId(firstCh) || seen.has(firstCh)) continue;
    seen.add(firstCh);
    out.push(firstCh);
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
