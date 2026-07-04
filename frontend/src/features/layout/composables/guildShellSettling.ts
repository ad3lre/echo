import type { ChannelCategory } from '@/composables/useChannels';
import type { RailTab } from '@/features/layout/mainSurface';

const ECHO_SERVER_ID = 'echo';

export function isGuildRailContext(
  rail: RailTab,
  selectedServerId: string | null | undefined,
): boolean {
  const sid = selectedServerId?.trim() ?? '';
  return rail === 'servers' && !!sid && sid !== ECHO_SERVER_ID;
}

/** Tree loaded for this guild (empty `[]` is a valid conclusion). */
export function isGuildChannelTreeLoaded(
  categoriesByServer: Record<string, ChannelCategory[]>,
  serverId: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(categoriesByServer, serverId);
}

export function channelExistsInRawCategories(
  categories: readonly ChannelCategory[],
  channelId: string,
): boolean {
  const cid = channelId.trim();
  if (!cid) return false;
  return categories.some((cat) => cat.channels.some((ch) => ch.id === cid));
}

export function getFirstTextChannelIdFromCategories(
  cats: readonly { channels: readonly { id: string; type: string }[] }[],
): string {
  for (const cat of cats) {
    const ch = cat.channels.find(
      (c) => c.type === 'text' || c.type === 'forum',
    );
    if (ch) return ch.id;
  }
  return cats[0]?.channels?.[0]?.id ?? '';
}

export type GuildShellSettlingParams = {
  rail: RailTab;
  selectedServerId: string | null | undefined;
  activeChannelId: string;
  categoriesByServer: Record<string, ChannelCategory[]>;
  workspaceLoading: boolean;
  workspaceFromApi: boolean;
  initialLoadInFlight: boolean;
};

/**
 * True while the guild channel panel / message surface should show loading chrome
 * instead of empty-state copy.
 */
export function isGuildShellSettling(p: GuildShellSettlingParams): boolean {
  if (!isGuildRailContext(p.rail, p.selectedServerId)) return false;

  const sid = p.selectedServerId!.trim();

  if (p.workspaceLoading && !p.workspaceFromApi) return true;

  if (!isGuildChannelTreeLoaded(p.categoriesByServer, sid)) return true;

  const rawCats = p.categoriesByServer[sid] ?? [];
  const cid = p.activeChannelId.trim();
  if (channelExistsInRawCategories(rawCats, cid)) return false;

  const firstText = getFirstTextChannelIdFromCategories(rawCats);
  if (firstText) return true;

  return false;
}
