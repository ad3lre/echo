import { normalizeCanonicalPresenceStatus } from '@/features/layout/presence';
import type { EchoServerMemberDto } from '@/api/echo/types';
import { isEchoPublicBadgeId } from '@shared/echoAccountBadges';
import { normalizeProfileBannerColor } from '@shared/profileBannerColor';

export type DisplayUser = {
  id: string;
  name: string;
  username?: string;
  pfp: string;
  status?: string;
  customStatus?: string;
  bio?: string;
  /** Optional banner image (uploaded GIF/asset). */
  bannerImage?: string;
  /** Optional banner fallback color/gradient. */
  bannerColor?: string;
  /** When true, banner colors are refracted onto the info section background. */
  bannerRefractionEnabled?: boolean;
  /** Frosted blur on profile banner (like server channel header). */
  bannerBlurEnabled?: boolean;
  /** Extra darkening on profile banner. */
  bannerBlackoutEnabled?: boolean;
  /** Vertical crop anchor for banner cover image (0 = top, 50 = center, 100 = bottom). */
  bannerPositionY?: number;
  /** Echo: True if this is a shadow placeholder user. */
  isDiscordShadow?: boolean;
  /** Echo: guest account (cannot send/receive friend requests as a full user). */
  isGuest?: boolean;
  /** Profile badges from workspace/auth (e.g. OG). */
  badges?: string[];
};

export type DisplayUserStatus =
  | 'online'
  | 'offline'
  | 'idle'
  | 'do_not_disturb';

export type PopoutAnchorSource =
  | 'member-list'
  | 'chat-avatar'
  | 'chat-name'
  | 'self-bar'
  | 'vc-panel'
  | 'generic';

export type PopoutAnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  source: PopoutAnchorSource;
};

export type MemberRole = {
  id: string;
  name: string;
  color: string;
  iconUrl?: string | null;
  iconEmojiId?: string | null;
  /** Echo member-list section sort: higher first; omit for mock hierarchy sort. */
  listSortKey?: number;
  /** When true this section is the catch-all "Members" bucket and MUST sort last. */
  isUnhoistedBucket?: boolean;
};

export type MemberProfile = {
  id: string;
  displayName: string;
  username: string;
  pfp: string;
  status?: DisplayUserStatus;
  customStatus?: string;
  bio: string;
  /** Optional banner image (e.g. uploaded GIF); when set, takes precedence over bannerColor. */
  bannerImage?: string;
  bannerColor: string;
  /** Controls ambient banner refraction behind profile info sections. */
  bannerRefractionEnabled: boolean;
  /** Frosted blur on profile banner (like server channel header). */
  bannerBlurEnabled: boolean;
  /** Extra darkening on profile banner. */
  bannerBlackoutEnabled: boolean;
  /** Vertical crop anchor for banner cover image (0 = top, 50 = center, 100 = bottom). */
  bannerPositionY: number;
  serverName: string;
  /** Guild icon URL for the server context of this profile; unset in DM / pseudo-server profiles. */
  serverImageUrl?: string;
  /** Locale “Member since” label, or empty when the workspace has no join instant (e.g. DMs). */
  joinedAt: string;
  /** Profile badges when present. */
  badges?: string[];
  roles: MemberRole[];
  isDiscordShadow?: boolean;
  isGuest?: boolean;
};

/** Server summary for mutual-servers / expanded profile. */
export type MutualServerSummary = {
  id: string;
  name: string;
  imageUrl: string;
};

/** Friend summary for mutual-friends tab. */
export type MutualFriendSummary = {
  id: string;
  displayName: string;
  username: string;
  pfp: string;
  status?: DisplayUserStatus;
};

/** Expanded profile for the full-screen modal: base profile + mutuals and extra metadata. */
export type ExpandedProfile = MemberProfile & {
  mutualServers: MutualServerSummary[];
  mutualFriends: MutualFriendSummary[];
  /** Account creation or "Member since" for overview. */
  accountCreatedAt?: string;
};

type ProfileSeed = {
  bio: string;
  bannerColor: string;
  joinedAt: string;
};

const PROFILE_SEEDS: Record<string, ProfileSeed> = {
  u1: {
    bio: 'Building Echo one glassy panel at a time.',
    bannerColor: 'linear-gradient(135deg, #7c3aed, #2563eb)',
    joinedAt: 'Nov 12, 2025',
  },
  u2: {
    bio: 'Always in voice, probably queueing up another idea.',
    bannerColor: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
    joinedAt: 'Oct 03, 2025',
  },
  u3: {
    bio: 'Keeps the energy high and the channel moving.',
    bannerColor: 'linear-gradient(135deg, #f97316, #ef4444)',
    joinedAt: 'Sep 14, 2025',
  },
  u4: {
    bio: 'Quiet until the perfect one-liner lands.',
    bannerColor: 'linear-gradient(135deg, #f59e0b, #f97316)',
    joinedAt: 'Dec 07, 2025',
  },
  u5: {
    bio: 'Heads down, focused, still watching everything.',
    bannerColor: 'linear-gradient(135deg, #ef4444, #7f1d1d)',
    joinedAt: 'Aug 28, 2025',
  },
  u6: {
    bio: 'Usually offline, still somehow catches every update.',
    bannerColor: 'linear-gradient(135deg, #475569, #1e293b)',
    joinedAt: 'Jul 19, 2025',
  },
  u7: {
    bio: 'Collects screenshots, ideas, and the occasional chaos.',
    bannerColor: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
    joinedAt: 'Jan 09, 2026',
  },
  u8: {
    bio: 'Lurking, listening, and showing up when it matters.',
    bannerColor: 'linear-gradient(135deg, #0f766e, #155e75)',
    joinedAt: 'Nov 30, 2025',
  },
  u9: {
    bio: 'Low activity, high signal.',
    bannerColor: 'linear-gradient(135deg, #334155, #0f172a)',
    joinedAt: 'Jun 21, 2025',
  },
  u10: {
    bio: 'Always has the next plan ready before the meeting starts.',
    bannerColor: 'linear-gradient(135deg, #22c55e, #0f766e)',
    joinedAt: 'Oct 18, 2025',
  },
  u11: {
    bio: 'Part-time philosopher, full-time vibe curator.',
    bannerColor: 'linear-gradient(135deg, #a855f7, #6366f1)',
    joinedAt: 'Feb 02, 2026',
  },
  u12: {
    bio: 'Read receipts on. Patience off.',
    bannerColor: 'linear-gradient(135deg, #fb7185, #be123c)',
    joinedAt: 'Jan 16, 2026',
  },
  u13: {
    bio: 'Here for the banter and the perfect timing.',
    bannerColor: 'linear-gradient(135deg, #eab308, #f97316)',
    joinedAt: 'May 11, 2025',
  },
  u14: {
    bio: 'Keeps things grounded when chat gets loud.',
    bannerColor: 'linear-gradient(135deg, #38bdf8, #1d4ed8)',
    joinedAt: 'Dec 22, 2025',
  },
};

/** Role display order: first = highest. Used to pick "highest role" for member list grouping. */
export const ROLE_HIERARCHY = [
  'Founder',
  'Admin',
  'Council',
  'Captain',
  'Core Dev',
  'Lead Driver',
  'Host',
  'Moderator',
  'Security',
  'Comms',
  'Events',
  'Builder',
  'Night Owl',
  'Scout',
  'Pit Crew',
  'Telemetry',
  'Vibes',
  'Helper',
  'Fast Fingers',
  'Practice Crew',
  'OG',
  'Regular',
  'You',
  'Member',
  'Direct Contact',
];

const SERVER_ROLE_MAP: Record<string, Record<string, MemberRole[]>> = {
  quantum: {
    u1: [
      { id: 'quantum-founder', name: 'Founder', color: '#c084fc' },
      { id: 'quantum-dev', name: 'Core Dev', color: '#60a5fa' },
    ],
    u2: [{ id: 'quantum-mod', name: 'Moderator', color: '#2dd4bf' }],
    u3: [{ id: 'quantum-events', name: 'Events', color: '#f97316' }],
    u4: [{ id: 'quantum-nightowl', name: 'Night Owl', color: '#fbbf24' }],
    u5: [{ id: 'quantum-security', name: 'Security', color: '#fb7185' }],
    u10: [{ id: 'quantum-builder', name: 'Builder', color: '#34d399' }],
    u11: [{ id: 'quantum-regular', name: 'Regular', color: '#818cf8' }],
    u13: [{ id: 'quantum-og', name: 'OG', color: '#f59e0b' }],
  },
  empire: {
    u1: [{ id: 'empire-council', name: 'Council', color: '#f97316' }],
    u2: [{ id: 'empire-comms', name: 'Comms', color: '#60a5fa' }],
    u5: [{ id: 'empire-captain', name: 'Captain', color: '#fb7185' }],
    u9: [{ id: 'empire-scout', name: 'Scout', color: '#94a3b8' }],
  },
  mti: {
    u3: [{ id: 'mti-driver', name: 'Lead Driver', color: '#f43f5e' }],
    u6: [{ id: 'mti-crew', name: 'Pit Crew', color: '#38bdf8' }],
    u8: [{ id: 'mti-analyst', name: 'Telemetry', color: '#14b8a6' }],
  },
  kamauo: {
    u1: [{ id: 'kamauo-admin', name: 'Admin', color: '#8b5cf6' }],
    u2: [{ id: 'kamauo-host', name: 'Host', color: '#22c55e' }],
    u7: [{ id: 'kamauo-vibes', name: 'Vibes', color: '#ec4899' }],
    u13: [{ id: 'kamauo-regular', name: 'Regular', color: '#f59e0b' }],
  },
  typeclub: {
    u4: [{ id: 'typeclub-fast', name: 'Fast Fingers', color: '#fbbf24' }],
    u7: [{ id: 'typeclub-helper', name: 'Helper', color: '#a855f7' }],
    u8: [{ id: 'typeclub-practice', name: 'Practice Crew', color: '#0ea5e9' }],
  },
  echo: {
    u1: [{ id: 'echo-you', name: 'You', color: '#818cf8' }],
  },
};

export function getRolesForMember(
  serverId: string,
  userId: string,
  overrides?: Record<string, Record<string, MemberRole[]>> | null,
): MemberRole[] {
  const fromOverride = overrides?.[serverId]?.[userId];
  if (fromOverride !== undefined) {
    if (fromOverride.length > 0) return fromOverride;
    /* empty override = cleared custom roles → fall back to static map */
  }
  const roles = SERVER_ROLE_MAP[serverId]?.[userId];
  if (roles && roles.length > 0) return roles;
  return [
    {
      id: `${serverId}-member`,
      name: serverId === 'echo' ? 'Direct Contact' : 'Member',
      color: '#94a3b8',
    },
  ];
}

/** Pick display “top” role using mock hierarchy (member list grouping). */
export function pickHighestMemberRole(roles: MemberRole[]): MemberRole {
  if (roles.length === 0) {
    return { id: 'fallback-member', name: 'Member', color: '#94a3b8' };
  }
  let best = roles[0]!;
  let bestIndex = ROLE_HIERARCHY.indexOf(best.name);
  if (bestIndex === -1) bestIndex = ROLE_HIERARCHY.length;
  for (let i = 1; i < roles.length; i++) {
    const r = roles[i]!;
    const idx = ROLE_HIERARCHY.indexOf(r.name);
    const order = idx === -1 ? ROLE_HIERARCHY.length : idx;
    if (order < bestIndex) {
      best = r;
      bestIndex = order;
    }
  }
  return best;
}

export type EchoCatalogRole = {
  id: string;
  name: string;
  color: string;
  roleIconUrl?: string | null;
  roleIconEmojiId?: string | null;
  darkColor?: string;
  lightColor?: string;
  separateThemeColors?: boolean;
  position: number;
  hoist?: boolean;
  isEveryone?: boolean;
};

function resolveEchoCatalogRoleColor(
  role: EchoCatalogRole,
  preferLightTheme = false,
): string {
  if (!role.separateThemeColors) return role.color;
  return preferLightTheme
    ? (role.lightColor ?? role.color)
    : (role.darkColor ?? role.color);
}

const ECHO_MEMBER_LIST_UNHOISTED: MemberRole = {
  id: '__echo_unhoisted__',
  name: 'Members',
  color: '#94a3b8',
  listSortKey: -1,
  isUnhoistedBucket: true,
};

/** Member-list bucket: highest hoisted assigned role, else shared “Members” section. */
export function pickEchoMemberListSectionRole(
  assignedRoleIds: string[],
  catalog: EchoCatalogRole[],
  preferLightTheme = false,
): MemberRole {
  const metas = catalog.filter((c) => assignedRoleIds.includes(c.id));
  const hoisted = metas.filter((c) => c.hoist === true);
  if (hoisted.length === 0) {
    return ECHO_MEMBER_LIST_UNHOISTED;
  }
  const top = [...hoisted].sort((a, b) => b.position - a.position)[0]!;
  const displayName = top.name === '@everyone' ? 'Member' : top.name;
  return {
    id: top.id,
    name: displayName,
    color: resolveEchoCatalogRoleColor(top, preferLightTheme),
    iconUrl: top.roleIconUrl ?? null,
    iconEmojiId: top.roleIconEmojiId ?? null,
    listSortKey: top.position,
  };
}

/** Highest role by `position` (Echo DB); @everyone shows as “Member”. */
export function pickHighestEchoCatalogRole(
  assignedRoleIds: string[],
  catalog: EchoCatalogRole[],
  preferLightTheme = false,
): MemberRole {
  const metas = catalog.filter((c) => assignedRoleIds.includes(c.id));
  if (metas.length === 0) {
    const ev = catalog.find((c) => c.isEveryone);
    if (ev)
      return {
        id: ev.id,
        name: 'Member',
        color: resolveEchoCatalogRoleColor(ev, preferLightTheme),
        iconUrl: ev.roleIconUrl ?? null,
        iconEmojiId: ev.roleIconEmojiId ?? null,
      };
    return { id: 'member', name: 'Member', color: '#94a3b8' };
  }
  const top = [...metas].sort((a, b) => b.position - a.position)[0]!;
  const displayName = top.name === '@everyone' ? 'Member' : top.name;
  return {
    id: top.id,
    name: displayName,
    color: resolveEchoCatalogRoleColor(top, preferLightTheme),
    iconUrl: top.roleIconUrl ?? null,
    iconEmojiId: top.roleIconEmojiId ?? null,
  };
}

/**
 * Sort key for role lists: larger = higher in the guild (matches Echo `position`, higher = more important).
 * Without `echoPosition`, uses mock {@link ROLE_HIERARCHY} (earlier name = higher).
 */
export function roleHierarchyDisplayRank(
  roleName: string,
  echoPosition?: number,
): number {
  if (typeof echoPosition === 'number' && Number.isFinite(echoPosition)) {
    return echoPosition;
  }
  const idx = ROLE_HIERARCHY.indexOf(roleName);
  if (idx === -1) return 0;
  return ROLE_HIERARCHY.length - idx;
}

/** Roles that can be toggled in mock “manage roles” UI for this server. */
export function getMockAssignableRolesForServer(
  serverId: string,
): MemberRole[] {
  const map = SERVER_ROLE_MAP[serverId];
  if (!map) {
    return [{ id: `${serverId}-member`, name: 'Member', color: '#94a3b8' }];
  }
  const byId = new Map<string, MemberRole>();
  for (const arr of Object.values(map)) {
    for (const r of arr) {
      byId.set(r.id, r);
    }
  }
  return Array.from(byId.values());
}

/** Roles that can create/manage channels (mock — aligns with “server admin” UX). */
const CHANNEL_MANAGEMENT_ROLES = new Set(['Founder', 'Admin', 'Council']);

/** Roles that can delete others’ messages and use kick / ban / timeout (mock). */
const MODERATION_ROLE_NAMES = new Set([
  'Founder',
  'Admin',
  'Council',
  'Moderator',
  'Security',
  'Captain',
]);

function roleHierarchyRank(roleName: string): number {
  const i = ROLE_HIERARCHY.indexOf(roleName);
  return i === -1 ? ROLE_HIERARCHY.length : i;
}

export function canCreateChannelsInServer(
  serverId: string,
  userId: string,
  opts?: { serverOwnerId?: string | null },
): boolean {
  if (!serverId || serverId === 'echo' || !userId) return false;
  if (opts?.serverOwnerId && opts.serverOwnerId === userId) return true;
  const role = getHighestRoleForMember(serverId, userId);
  return CHANNEL_MANAGEMENT_ROLES.has(role.name);
}

/** True if this user has moderation powers in the server (mock; DMs never). */
export function hasModerationPowers(serverId: string, userId: string): boolean {
  if (!serverId || serverId === 'echo') return false;
  const role = getHighestRoleForMember(serverId, userId);
  return MODERATION_ROLE_NAMES.has(role.name);
}

/** Mock: assign/remove roles in member list (aligns with Echo `MANAGE_ROLES`). */
const MOCK_MANAGE_MEMBER_ROLES = new Set([
  'Founder',
  'Admin',
  'Council',
  'Moderator',
  'Security',
  'Captain',
]);

/** Mock: overview, emoji, audit, bans, danger zone (aligns with Echo `MANAGE_SERVER`). */
const MOCK_MANAGE_SERVER_SETTINGS = new Set(['Founder', 'Admin', 'Council']);

export function canManageMockMemberRoles(
  serverId: string,
  userId: string,
  opts?: { serverOwnerId?: string | null },
): boolean {
  if (!serverId || serverId === 'echo' || !userId) return false;
  if (opts?.serverOwnerId && opts.serverOwnerId === userId) return true;
  const role = getHighestRoleForMember(serverId, userId);
  return MOCK_MANAGE_MEMBER_ROLES.has(role.name);
}

export function canManageMockServerSettings(
  serverId: string,
  userId: string,
  opts?: { serverOwnerId?: string | null },
): boolean {
  if (!serverId || serverId === 'echo' || !userId) return false;
  if (opts?.serverOwnerId && opts.serverOwnerId === userId) return true;
  const role = getHighestRoleForMember(serverId, userId);
  return MOCK_MANAGE_SERVER_SETTINGS.has(role.name);
}

/**
 * Whether `actorId` may moderate `targetUserId` (higher role only; not self).
 * Used for delete others’ messages, kick, ban, timeout.
 */
export function canModerateMember(
  serverId: string,
  actorId: string,
  targetUserId: string,
): boolean {
  if (!serverId || serverId === 'echo') return false;
  if (actorId === targetUserId) return false;
  if (!hasModerationPowers(serverId, actorId)) return false;
  const actorRole = getHighestRoleForMember(serverId, actorId);
  const targetRole = getHighestRoleForMember(serverId, targetUserId);
  return roleHierarchyRank(actorRole.name) < roleHierarchyRank(targetRole.name);
}

/** Returns the highest role for a member in a server (by ROLE_HIERARCHY). */
export function getHighestRoleForMember(
  serverId: string,
  userId: string,
  overrides?: Record<string, Record<string, MemberRole[]>> | null,
): MemberRole {
  return pickHighestMemberRole(getRolesForMember(serverId, userId, overrides));
}

export function toUsername(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .trim() || 'echo'
  );
}

export function getPopoutAnchorRect(
  target: EventTarget | null,
  source: PopoutAnchorSource = 'generic',
): PopoutAnchorRect | null {
  if (!(target instanceof HTMLElement)) return null;

  const rect = target.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    source,
  };
}

/** DM / home surface — profiles use this label instead of a guild name. */
export const MEMBER_PROFILE_DM_SERVER_LABEL = 'Direct Messages';

/** True when the profile was built for a real guild (not DMs / pseudo-server). */
export function isGuildMemberProfileContext(
  serverName: string | undefined | null,
): boolean {
  const n = serverName?.trim();
  if (!n || n === MEMBER_PROFILE_DM_SERVER_LABEL) return false;
  return true;
}

/**
 * Lead text before the date in ABOUT / badges: “Member in {guild} since” vs “Member since”.
 */
export function getMemberSinceLeadText(
  serverName: string | undefined | null,
): string {
  const n = serverName?.trim();
  if (n && n !== MEMBER_PROFILE_DM_SERVER_LABEL) {
    return `Member in ${n} since`;
  }
  return 'Member since';
}

/** Format a server membership instant for “Member since” (locale-aware). */
export function formatMemberSinceLabel(
  iso: string | undefined,
): string | undefined {
  if (!iso?.trim()) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function lookupServerMemberJoinedAtIso(
  serverId: string | undefined,
  userId: string | undefined,
  membersByServer: Record<string, EchoServerMemberDto[]> | undefined,
): string | undefined {
  const sid = serverId?.trim();
  const uid = userId?.trim();
  if (!sid || sid === 'echo' || !uid || !membersByServer) return undefined;
  const row = membersByServer[sid]?.find((m) => m.userId === uid);
  return row?.joinedAt;
}

/**
 * When roster rows omit `status`, overlay last-known presence from `echoSession.presenceByUserId`
 * so quick profile matches member list / sidebar indicators.
 */
export function applySessionPresenceToMemberProfile(
  profile: MemberProfile,
  sessionPresence: string | undefined,
): MemberProfile {
  if (profile.status) return profile;
  const s = normalizeCanonicalPresenceStatus(sessionPresence);
  if (!s) return profile;
  return { ...profile, status: s };
}

export function buildMemberProfile(
  user: DisplayUser,
  serverId: string,
  serverName: string,
  opts?: { memberJoinedAtIso?: string; serverImageUrl?: string },
): MemberProfile {
  const seed = PROFILE_SEEDS[user.id] ?? {
    bio: '',
    bannerColor: 'linear-gradient(135deg, #4338ca, #0f172a)',
    joinedAt: '',
  };
  const roles = getRolesForMember(serverId, user.id, null);
  const joinedFromServer = formatMemberSinceLabel(opts?.memberJoinedAtIso);
  const badgeList = (user.badges ?? []).filter((b): b is string =>
    typeof b === 'string' ? isEchoPublicBadgeId(b) : false,
  );

  return {
    id: user.id,
    displayName: user.name,
    username: user.username?.trim() || toUsername(user.name),
    pfp: user.pfp,
    status: normalizeCanonicalPresenceStatus(user.status),
    customStatus: user.customStatus?.trim() || undefined,
    bio: user.bio?.trim() || seed.bio,
    bannerImage: user.bannerImage,
    bannerColor: normalizeProfileBannerColor(
      user.bannerColor,
      seed.bannerColor,
    ),
    bannerRefractionEnabled: user.bannerRefractionEnabled ?? false,
    bannerBlurEnabled: user.bannerBlurEnabled ?? false,
    bannerBlackoutEnabled: user.bannerBlackoutEnabled ?? false,
    bannerPositionY:
      typeof user.bannerPositionY === 'number' &&
      Number.isFinite(user.bannerPositionY)
        ? Math.max(0, Math.min(100, user.bannerPositionY))
        : 50,
    serverName,
    serverImageUrl: isGuildMemberProfileContext(serverName)
      ? opts?.serverImageUrl?.trim() || undefined
      : undefined,
    joinedAt: joinedFromServer ?? seed.joinedAt,
    badges: badgeList,
    roles,
    isDiscordShadow: user.isDiscordShadow,
    isGuest: user.isGuest,
  };
}

/**
 * Primary visible name for a session/auth user: first non-empty `displayName`, else `username`.
 * Matches historical `displayName || username` (empty string falls through to username).
 */
export function sessionUserDisplayName(
  displayName: string | null | undefined,
  username: string,
): string {
  if (displayName) return displayName;
  return username;
}

/** Auth/session user shape for {@link buildSelfMemberProfileForShell} (e.g. `AuthUserPublic`). */
export type SessionUserForSelfProfile = {
  id: string;
  displayName: string;
  username: string;
  pfp: string;
  status?: string;
  customStatus?: string;
  bio?: string;
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  bannerPositionY?: number;
  badges?: string[];
};

/** Minimal `{ id, name, pfp }` row for shell / role UI (from session user). */
export type ShellCurrentUserSummary = {
  id: string;
  name: string;
  pfp: string;
  status?: DisplayUserStatus;
};

export function sessionUserToShellCurrentUserSummary(
  user: SessionUserForSelfProfile | null | undefined,
  statusOverride?: string | null | undefined,
): ShellCurrentUserSummary | undefined {
  if (!user) return undefined;
  const status = normalizeCanonicalPresenceStatus(
    statusOverride ?? user.status,
  );
  return {
    id: user.id,
    name: sessionUserDisplayName(user.displayName, user.username),
    pfp: user.pfp,
    ...(status ? { status } : {}),
  };
}

/**
 * Rail avatar / self-bar popout profile from the signed-in user and current server context.
 */
export function buildSelfMemberProfileForShell(
  user: SessionUserForSelfProfile | null | undefined,
  selectedServer:
    | { id: string; name: string; imageUrl?: string }
    | null
    | undefined,
  statusOverride?: string | null | undefined,
  opts?: { memberJoinedAtIso?: string },
): MemberProfile | null {
  if (!user) return null;
  const joinedIso = opts?.memberJoinedAtIso;
  const buildOpts = {
    ...(joinedIso ? { memberJoinedAtIso: joinedIso } : {}),
    serverImageUrl: selectedServer?.imageUrl,
  };
  return buildMemberProfile(
    {
      id: user.id,
      name: sessionUserDisplayName(user.displayName, user.username),
      pfp: user.pfp,
      status: statusOverride ?? user.status,
      customStatus: user.customStatus,
      bio: user.bio,
      bannerImage: user.bannerImage,
      bannerColor: user.bannerColor,
      bannerRefractionEnabled: user.bannerRefractionEnabled,
      bannerBlurEnabled: user.bannerBlurEnabled,
      bannerBlackoutEnabled: user.bannerBlackoutEnabled,
      bannerPositionY: user.bannerPositionY,
      badges: user.badges,
    },
    selectedServer?.id ?? 'echo',
    selectedServer?.name ?? MEMBER_PROFILE_DM_SERVER_LABEL,
    buildOpts,
  );
}

/** Inputs for building expanded profile (modal-only fields). */
export type ExpandedProfileInputs = {
  servers: { id: string; name: string; imageUrl: string }[];
  users: {
    id: string;
    name: string;
    username?: string;
    pfp: string;
    status?: string;
    isGuest?: boolean;
    badges?: string[];
  }[];
  serverMemberIds: Record<string, string[]>;
  friendIdsByUserId: Record<string, string[]>;
};

/**
 * Builds expanded profile for the full-screen modal: base profile + mutual servers and mutual friends.
 * Pass the current user id so mutuals are computed relative to the viewer.
 */
export function buildExpandedProfile(
  profile: MemberProfile,
  currentUserId: string,
  inputs: ExpandedProfileInputs,
): ExpandedProfile {
  const { servers, users, serverMemberIds, friendIdsByUserId } = inputs;
  const currentFriendIds = new Set(friendIdsByUserId[currentUserId] ?? []);
  const viewedFriendIds = new Set(friendIdsByUserId[profile.id] ?? []);
  const mutualFriendIds = [...currentFriendIds].filter((id) =>
    viewedFriendIds.has(id),
  );

  const serversWhereCurrent = new Set(
    Object.entries(serverMemberIds)
      .filter(([, ids]) => ids.includes(currentUserId))
      .map(([sid]) => sid),
  );
  const mutualServerIds = Object.entries(serverMemberIds)
    .filter(
      ([sid, ids]) =>
        ids.includes(profile.id) &&
        serversWhereCurrent.has(sid) &&
        sid !== 'echo',
    )
    .map(([sid]) => sid);

  const mutualServers: MutualServerSummary[] = mutualServerIds
    .map((sid) => servers.find((s) => s.id === sid))
    .filter((s): s is NonNullable<typeof s> => s != null)
    .map((s) => ({ id: s.id, name: s.name, imageUrl: s.imageUrl }));

  const userMap = new Map(users.map((u) => [u.id, u]));
  const mutualFriends: MutualFriendSummary[] = mutualFriendIds
    .map((id) => userMap.get(id))
    .filter((u): u is NonNullable<typeof u> => u != null)
    .map((u) => ({
      id: u.id,
      displayName: u.name,
      username: u.username?.trim() || toUsername(u.name),
      pfp: u.pfp,
      status: normalizeCanonicalPresenceStatus(u.status),
    }));

  return {
    ...profile,
    mutualServers,
    mutualFriends,
    accountCreatedAt: profile.joinedAt,
  };
}
