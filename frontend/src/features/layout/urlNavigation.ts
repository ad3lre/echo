/**
 * compact in-app paths + query params for settings. Pure parse/format (no Vue).
 */

import type { LegalDocTabId } from '@/features/settings/legalDocs';
import type { MainSurface, NavState } from './mainSurface';
import { assertNever, isDmThreadId } from './mainSurface';
import {
  USER_SETTINGS_SECTION_GROUPS,
  type UserSettingsSection,
} from '@/features/layout/urlNavigationSettingsIds';
import {
  GUILD_SETTINGS_SECTION_GROUPS,
  type GuildSettingsSection,
} from '@/features/layout/urlNavigationServerSettingsIds';

const USER_SETTINGS_SECTION_IDS = new Set<string>(
  USER_SETTINGS_SECTION_GROUPS.flatMap((g) => g.items),
);
const GUILD_SETTINGS_SECTION_IDS = new Set<string>(
  GUILD_SETTINGS_SECTION_GROUPS.flatMap((g) => g.items),
);

function decodeSettingsQueryValue(raw: string): string {
  const normalized = raw.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function decodePathSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** Decode `settings=` / `guild_section=` query values (handles + and percent-encoding). */
export function parseUserSettingsSectionFromQuery(
  raw: string | null,
): UserSettingsSection | null {
  if (!raw) return null;
  const dec = decodeSettingsQueryValue(raw);
  if (USER_SETTINGS_SECTION_IDS.has(dec)) return dec as UserSettingsSection;
  return null;
}

export function parseGuildSettingsSectionFromQuery(
  raw: string | null,
): GuildSettingsSection | null {
  if (!raw) return null;
  const dec = decodeSettingsQueryValue(raw);
  if (dec === 'Applications') return 'Access';
  if (GUILD_SETTINGS_SECTION_IDS.has(dec)) return dec as GuildSettingsSection;
  return null;
}

/**
 * Map current shell navigation + derived main surface to a canonical path for the History API.
 * Pass `isPersistedEchoDmThread` so snowflake DM channels serialize as `/channels/@me/c/...`.
 */
export function parsedPathFromMainSurface(
  nav: NavState,
  surface: MainSurface,
  opts?: { isPersistedEchoDmThread?: (channelId: string) => boolean },
): EchoParsedPath {
  const isEchoDm = opts?.isPersistedEchoDmThread;

  switch (surface.type) {
    case 'explore':
      return { kind: 'explore' };
    case 'dmFriends':
      return { kind: 'dm_friends' };
    case 'dmNotifications':
      return { kind: 'dm_notifications' };
    case 'dmRequests':
      return { kind: 'dm_idle' };
    case 'dmThread':
      return { kind: 'dm_thread', channelId: surface.threadId };
    case 'dmMessagesIdle':
      return { kind: 'dm_idle' };
    case 'serverText':
    case 'serverVoice': {
      const sid = nav.selectedServerId ?? '';
      return sid
        ? { kind: 'guild', serverId: sid, channelId: surface.channelId }
        : { kind: 'root' };
    }
    case 'serverForum': {
      const sid = nav.selectedServerId ?? '';
      const channelId = surface.postChannelId || surface.forumChannelId;
      return sid
        ? { kind: 'guild', serverId: sid, channelId }
        : { kind: 'root' };
    }
    case 'serverPaper': {
      const sid = nav.selectedServerId ?? '';
      return sid
        ? { kind: 'guild', serverId: sid, channelId: surface.channelId }
        : { kind: 'root' };
    }
    case 'serverEmptyOnboarding': {
      const sid = nav.selectedServerId ?? '';
      if (sid && sid !== 'echo') {
        return { kind: 'guild', serverId: sid, channelId: nav.activeChannelId };
      }
      return { kind: 'root' };
    }
    case 'unknown': {
      if (
        isDmThreadId(nav.activeChannelId) ||
        isEchoDm?.(nav.activeChannelId)
      ) {
        return { kind: 'dm_thread', channelId: nav.activeChannelId };
      }
      const sid = nav.selectedServerId ?? '';
      if (sid && sid !== 'echo') {
        return { kind: 'guild', serverId: sid, channelId: nav.activeChannelId };
      }
      if (nav.rail === 'explore') return { kind: 'explore' };
      if (nav.rail === 'dm') {
        if (nav.dmSubView === 'friends') return { kind: 'dm_friends' };
        if (nav.dmSubView === 'notifications')
          return { kind: 'dm_notifications' };
        return { kind: 'dm_idle' };
      }
      return { kind: 'root' };
    }
    default:
      return assertNever(surface);
  }
}

export type EchoParsedPath =
  | { kind: 'root' }
  | { kind: 'explore' }
  | { kind: 'dm_idle' }
  | { kind: 'dm_friends' }
  | { kind: 'dm_notifications' }
  | { kind: 'dm_thread'; channelId: string }
  | { kind: 'guild'; serverId: string; channelId: string }
  | { kind: 'paper_public'; token: string }
  | { kind: 'unknown'; raw: string };

export const ECHO_URL_QUERY = {
  settings: 'settings',
  guildSettings: 'guild_settings',
  guildSection: 'guild_section',
  guildEventServer: 'guild_event_server',
  guildEvent: 'guild_event',
} as const;

/**
 * Single-path segments that are not public invite vanity URLs (auth shells, static, etc.).
 * `/{slug}` invite links use everything else (see `parseAppPathname` + `isAppNavPath`).
 */
export const RESERVED_TOP_LEVEL_PATH_SLUGS = new Set(
  [
    'explore',
    'channels',
    'paper',
    'reset-password',
    'forgot-password',
    'legal',
    'assets',
    'static',
  ].map((s) => s.toLowerCase()),
);

const LEGAL_DOC_PATH_TO_TAB: Record<string, LegalDocTabId> = {
  terms: 'terms',
  privacy: 'privacy',
  community: 'community',
  attributions: 'attributions',
};

/** Standalone legal pages at `/legal/{terms|privacy|community|attributions}` (not main shell nav). */
export function parseLegalDocPath(
  pathname: string,
  base: string,
): LegalDocTabId | null {
  const p = normalizePathname(stripBasePath(pathname, base));
  const m = /^\/legal\/([^/]+)$/i.exec(p);
  if (!m) return null;
  const key = m[1]!.toLowerCase();
  return LEGAL_DOC_PATH_TO_TAB[key] ?? null;
}

/** Strip Vite `base` from pathname for matching (e.g. `/app/channels/...` → `/channels/...`). */
export function stripBasePath(pathname: string, base: string): string {
  const b = base === '/' ? '' : base.replace(/\/$/, '');
  if (!b) return pathname || '/';
  if (pathname === b || pathname === `${b}/`) return '/';
  if (pathname.startsWith(`${b}/`)) return pathname.slice(b.length) || '/';
  return pathname || '/';
}

export function withBasePath(pathname: string, base: string): string {
  const b = base === '/' ? '' : base.replace(/\/$/, '');
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (!b) return p || '/';
  return `${b}${p === '/' ? '' : p}` || `${b}/`;
}

export function normalizePathname(pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/';
  return p;
}

export function isResetPasswordPath(pathname: string, base: string): boolean {
  const p = normalizePathname(stripBasePath(pathname, base));
  return /\/reset-password$/i.test(p);
}

export function isForgotPasswordPath(pathname: string, base: string): boolean {
  const p = normalizePathname(stripBasePath(pathname, base));
  return /\/forgot-password$/i.test(p);
}

/** Paths Echo owns for History API sync (excludes auth recovery shells). */
export function isAppNavPath(pathname: string, base: string): boolean {
  if (isResetPasswordPath(pathname, base)) return false;
  if (isForgotPasswordPath(pathname, base)) return false;
  const p = normalizePathname(stripBasePath(pathname, base));
  if (p === '/') return true;
  if (p === '/explore') return true;
  if (p.startsWith('/channels/')) return true;
  // Public invite short URL: https://chat-echo.com/{vanityCode}
  if (/^\/[^/]+$/.test(p)) {
    const slug = p.slice(1).toLowerCase();
    if (!RESERVED_TOP_LEVEL_PATH_SLUGS.has(slug)) return true;
  }
  return false;
}

export function parseAppPathname(
  pathname: string,
  base: string,
): EchoParsedPath {
  const p = normalizePathname(stripBasePath(pathname, base));
  if (p === '/') return { kind: 'root' };
  if (p === '/explore') return { kind: 'explore' };
  if (p.startsWith('/paper/s/')) {
    const token = decodePathSegment(p.slice('/paper/s/'.length));
    if (token) return { kind: 'paper_public', token };
    return { kind: 'unknown', raw: p };
  }
  if (!p.startsWith('/channels/')) {
    if (/^\/[^/]+$/.test(p)) {
      const slug = decodePathSegment(p.slice(1));
      if (slug === null) return { kind: 'unknown', raw: p };
      if (!RESERVED_TOP_LEVEL_PATH_SLUGS.has(slug.toLowerCase())) {
        return { kind: 'guild', serverId: slug, channelId: '' };
      }
    }
    return { kind: 'unknown', raw: p };
  }

  const rest = p.slice('/channels/'.length);
  const segments = rest.split('/').filter(Boolean);
  if (segments.length === 0) return { kind: 'unknown', raw: p };

  if (segments[0] !== '@me') {
    if (segments.length >= 2) {
      const serverId = decodePathSegment(segments[0]!);
      const channelId = decodePathSegment(segments.slice(1).join('/'));
      if (serverId === null || channelId === null) {
        return { kind: 'unknown', raw: p };
      }
      return { kind: 'guild', serverId, channelId };
    }
    return { kind: 'unknown', raw: p };
  }

  if (segments.length === 1) return { kind: 'dm_idle' };
  const second = segments[1]!;
  if (second === 'friends') return { kind: 'dm_friends' };
  if (second === 'notifications') return { kind: 'dm_notifications' };
  /** @deprecated Old path — land on DM home (messages). */
  if (second === 'requests') return { kind: 'dm_idle' };
  if (second === 'c' && segments.length >= 3) {
    const channelId = decodePathSegment(segments.slice(2).join('/'));
    if (channelId === null) return { kind: 'unknown', raw: p };
    return { kind: 'dm_thread', channelId };
  }
  if (segments.length === 2) {
    const channelId = decodePathSegment(second);
    if (channelId === null) return { kind: 'unknown', raw: p };
    return { kind: 'dm_thread', channelId };
  }
  return { kind: 'unknown', raw: p };
}

export function formatAppPathname(
  parsed: EchoParsedPath,
  base: string,
): string {
  let rel = '/';
  switch (parsed.kind) {
    case 'root':
      rel = '/';
      break;
    case 'explore':
      rel = '/explore';
      break;
    case 'dm_idle':
      rel = '/channels/@me';
      break;
    case 'dm_friends':
      rel = '/channels/@me/friends';
      break;
    case 'dm_notifications':
      rel = '/channels/@me/notifications';
      break;
    case 'dm_thread':
      rel = `/channels/@me/c/${encodeURIComponent(parsed.channelId)}`;
      break;
    case 'guild':
      rel = `/channels/${encodeURIComponent(parsed.serverId)}/${encodeURIComponent(parsed.channelId)}`;
      break;
    case 'paper_public':
      rel = `/paper/s/${encodeURIComponent(parsed.token)}`;
      break;
    case 'unknown':
      rel = parsed.raw.startsWith('/') ? parsed.raw : `/${parsed.raw}`;
      break;
  }
  return withBasePath(rel, base);
}

/**
 * Use `history.replaceState` when transitioning from Explore to DM paths so the OS back-swipe /
 * history stack does not insert an extra Explore entry. Otherwise Safari `popstate` restores
 * `/explore` while the user meant an in-app swipe (rail / DM list), which feels like a teleport.
 */
export function shouldReplaceHistoryLeavingExploreForDmPath(
  currentParsed: EchoParsedPath,
  desiredParsed: EchoParsedPath,
): boolean {
  if (currentParsed.kind !== 'explore') return false;
  switch (desiredParsed.kind) {
    case 'dm_idle':
    case 'dm_friends':
    case 'dm_notifications':
    case 'dm_thread':
      return true;
    default:
      return false;
  }
}

export type EchoModalQueries = {
  settings: string | null;
  guildSettingsServerId: string | null;
  guildSection: string | null;
  guildEventServerId: string | null;
  guildEventId: string | null;
};

export function parseModalQueries(
  search: string | URLSearchParams,
): EchoModalQueries {
  const sp =
    typeof search === 'string'
      ? new URLSearchParams(search.replace(/^\?/, ''))
      : search;
  return {
    settings: sp.get(ECHO_URL_QUERY.settings),
    guildSettingsServerId: sp.get(ECHO_URL_QUERY.guildSettings),
    guildSection: sp.get(ECHO_URL_QUERY.guildSection),
    guildEventServerId: sp.get(ECHO_URL_QUERY.guildEventServer),
    guildEventId: sp.get(ECHO_URL_QUERY.guildEvent),
  };
}

/**
 * Merge modal query keys into `preserve` (typical: current location.search).
 * Pass `null` to remove a key.
 */
export function mergeModalSearchParams(
  preserve: string | URLSearchParams,
  patch: Partial<{
    settings: string | null;
    guild_settings: string | null;
    guild_section: string | null;
    guild_event_server: string | null;
    guild_event: string | null;
  }>,
): string {
  const sp =
    typeof preserve === 'string'
      ? new URLSearchParams(preserve.replace(/^\?/, ''))
      : new URLSearchParams(preserve.toString());

  const apply = (key: string, val: string | null | undefined) => {
    if (val === null || val === undefined || val === '') sp.delete(key);
    else sp.set(key, val);
  };

  if ('settings' in patch)
    apply(ECHO_URL_QUERY.settings, patch.settings ?? null);
  if ('guild_settings' in patch)
    apply(ECHO_URL_QUERY.guildSettings, patch.guild_settings ?? null);
  if ('guild_section' in patch)
    apply(ECHO_URL_QUERY.guildSection, patch.guild_section ?? null);
  if ('guild_event_server' in patch)
    apply(ECHO_URL_QUERY.guildEventServer, patch.guild_event_server ?? null);
  if ('guild_event' in patch)
    apply(ECHO_URL_QUERY.guildEvent, patch.guild_event ?? null);

  const s = sp.toString();
  return s ? `?${s}` : '';
}
