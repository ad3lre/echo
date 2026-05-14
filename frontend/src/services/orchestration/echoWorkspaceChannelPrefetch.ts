import type { EchoApiMessage } from '@/api/echo/messages';
import type { EchoWorkspaceState } from '@/api/echoClient';
import { firstTextChannelIdFromCategories } from '@/composables/workspace/utils';
import { isEchoGraphId } from '@/utils/echoIds';
import { sortRawMessagesInPlace } from '@/services/realtime/channelMessageOrder';
import { applyEchoHistoryInitialPageFromApi } from '@/services/realtime/echoHistoryChannelApply';
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

export function applyPrefetchedWorkspaceChannelMessages(
  channelId: string,
  apiMessages: EchoApiMessage[],
): void {
  const raw = mapEchoMessagesToRaw(apiMessages);
  sortRawMessagesInPlace(raw);
  applyEchoHistoryInitialPageFromApi(
    channelId,
    raw,
    apiMessages.length,
    messageWindowAuthority.getActiveChannelId() ?? '',
  );
}
