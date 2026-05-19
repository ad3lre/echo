import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import type { MockData } from './types';
import type { AuthUserPublic } from '@/api/authClient';
import { sessionUserDisplayName } from '@/utils/memberProfiles';
import { fetchEchoDirectoryServers } from '@/api/echoClient';
import type { ChannelCategory } from '@/composables/useChannels';
import { mapEchoDirectoryServersToExploreRows } from '@/services/orchestration/exploreDirectoryMap';

export const SERVER_NOTIFICATION_STORAGE_KEY =
  'echo-server-notification-overrides';

export function loadServerNotificationOverrides(): Record<
  string,
  ServerNotificationLevel
> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SERVER_NOTIFICATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, ServerNotificationLevel> = {};
    const ok: ServerNotificationLevel[] = [
      'all',
      'mentions',
      'mentions_direct',
      'none',
    ];
    let migratedMuted = false;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== 'string') continue;
      if (v === 'muted') {
        out[k] = 'none';
        migratedMuted = true;
        continue;
      }
      if (ok.includes(v as ServerNotificationLevel)) {
        out[k] = v as ServerNotificationLevel;
      }
    }
    if (migratedMuted) {
      try {
        localStorage.setItem(
          SERVER_NOTIFICATION_STORAGE_KEY,
          JSON.stringify(out),
        );
      } catch {
        /* ignore */
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** One row for the signed-in user so chat / member list resolve authors. */
export function echoUserRowFromAuthUser(
  u: AuthUserPublic,
): MockData['users'][number] {
  return {
    id: u.id,
    name: sessionUserDisplayName(u.displayName, u.username),
    username: u.username,
    pfp: u.pfp ?? '',
    status: u.status ?? '',
    customStatus: u.customStatus,
    bannerImage: u.bannerImage,
    bannerColor: u.bannerColor,
    bannerRefractionEnabled: u.bannerRefractionEnabled,
    bannerBlurEnabled: u.bannerBlurEnabled,
    bannerBlackoutEnabled: u.bannerBlackoutEnabled,
  };
}

/** First text channel in category list order (matches AppLayout `getFirstTextChannelId`). */
export function firstTextChannelIdFromCategories(
  cats: ChannelCategory[],
): string {
  for (const cat of cats) {
    const ch = cat.channels.find((c) => c.type === 'text');
    if (ch) return ch.id;
  }
  return cats[0]?.channels?.[0]?.id ?? '';
}

export async function loadEchoExploreDirectoryRows(): Promise<
  MockData['discoverableServers']
> {
  try {
    const { servers } = await fetchEchoDirectoryServers();
    return mapEchoDirectoryServersToExploreRows(servers);
  } catch {
    return [];
  }
}
