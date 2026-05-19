import type { ChannelCategory } from '@/composables/useChannels';
import type { EchoServerMemberDto } from '@/api/echo/types';

export type EchoWorkspaceState = {
  servers: {
    id: string;
    name: string;
    /** Trimmed CDN URL from API, or empty when absent — use `serverGuildIconDisplayUrl` in UI when a fallback is desired. */
    imageUrl: string;
    bannerImageUrl?: string;
    bannerPositionY?: number;
    ownerId: string;
    description?: string;
    tags?: string[];
    listedInDirectory?: boolean;
    inviteJoinEnabled?: boolean;
    automodSpamEnabled?: boolean;
    vanityCode?: string;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
    raidProtectionEnabled?: boolean;
    raidJoinThresholdCount?: number;
    raidJoinWindowSeconds?: number;
    discordGuildId?: string;
    applicationsEnabled?: boolean;
  }[];
  categoriesByServer: Record<string, ChannelCategory[]>;
  serverMemberIds: Record<string, string[]>;
  /** Monotonic workspace version from the backend snapshot/event stream. */
  workspaceVersion: string;
  /** Present when workspace API returns roster; used for mentions and member list. */
  membersByServer?: Record<string, EchoServerMemberDto[]>;
  /** Upcoming guild events per server id (from `/workspace`). */
  upcomingEventsByServerId: Record<string, EchoWorkspaceEventSummary[]>;
  /** Current user's "going" RSVPs across servers (DM strip). */
  myEventRsvps: EchoWorkspaceMyEventRsvp[];
};

/** Guild event row embedded in workspace snapshots. */
export type EchoWorkspaceEventSummary = {
  id: string;
  serverId: string;
  title: string;
  description: string;
  imageUrl: string;
  startsAt: string;
  endsAt: string;
  timezoneLabel: string | null;
  channelId: string | null;
  channelName: string | null;
  goingCount: number;
  maxAttendees: number | null;
  userRsvp: 'going' | 'declined' | null;
};

export type EchoWorkspaceMyEventRsvp = {
  id: string;
  serverId: string;
  serverName: string;
  serverImageUrl: string;
  title: string;
  imageUrl: string;
  startsAt: string;
  endsAt: string;
  channelId: string | null;
  channelName: string | null;
  goingCount: number;
  maxAttendees: number | null;
};

/** Server row shape as returned from `/workspace` before normalization. */
export type EchoWorkspaceRawServer = {
  id: string;
  name: string;
  iconUrl: string;
  bannerUrl: string;
  bannerPositionY?: number;
  ownerId: string;
  description?: string;
  tags?: string[];
  listedInDirectory?: boolean;
  inviteJoinEnabled?: boolean;
  automodSpamEnabled?: boolean;
  vanityCode?: string;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  raidProtectionEnabled?: boolean;
  raidJoinThresholdCount?: number;
  raidJoinWindowSeconds?: number;
  discordGuildId?: string;
  applicationsEnabled?: boolean;
};

/** `/workspace` JSON after transport-level structural validation (servers + categories). */
export type WorkspaceHttpJsonValidated = {
  servers: EchoWorkspaceRawServer[];
  categoriesByServer: Record<string, ChannelCategory[]>;
  membersByServer?: unknown;
  members_by_server?: unknown;
  workspaceVersion?: unknown;
  upcomingEventsByServerId?: unknown;
  myEventRsvps?: unknown;
};

function readMemberString(
  rec: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function readMemberUserId(rec: Record<string, unknown>): string {
  const raw = rec.userId ?? rec.user_id;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return '';
}

function readMemberBadgeIds(
  rec: Record<string, unknown>,
  ...keys: string[]
): string[] | undefined {
  for (const k of keys) {
    const v = rec[k];
    if (!Array.isArray(v) || v.length === 0) continue;
    const xs = v.filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
    if (xs.length) return xs;
  }
  return undefined;
}

function readOptionalIsoDate(
  rec: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v !== 'string' || !v.trim()) continue;
    const parsed = new Date(v);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

/** Normalize `/workspace` member rows (camelCase, snake_case, or loose JSON). */
export function normalizeWorkspaceMembersByServer(
  raw: unknown,
  servers: { id: string }[],
): Record<string, EchoServerMemberDto[]> {
  const out: Record<string, EchoServerMemberDto[]> = {};
  for (const s of servers) {
    out[s.id] = [];
  }
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  for (const s of servers) {
    const list = obj[s.id];
    if (!Array.isArray(list)) continue;
    const rows: EchoServerMemberDto[] = [];
    for (const m of list) {
      if (!m || typeof m !== 'object') continue;
      const rec = m as Record<string, unknown>;
      const userId = readMemberUserId(rec);
      if (!userId) continue;
      const name =
        readMemberString(
          rec,
          'name',
          'displayName',
          'display_name',
          'username',
        ) || 'Unknown';
      const accountDisplayName = readMemberString(
        rec,
        'accountDisplayName',
        'account_display_name',
      );
      const serverNickname = readMemberString(
        rec,
        'serverNickname',
        'server_nickname',
      );
      const username = readMemberString(rec, 'username');
      const pfp = readMemberString(
        rec,
        'pfp',
        'avatarUrl',
        'avatar_url',
        'imageUrl',
        'image_url',
      );
      const bio = readMemberString(rec, 'bio');
      const isDiscordShadow =
        rec.isDiscordShadow === true || rec.is_discord_shadow === true;
      const isGuest =
        rec.isGuest === true || rec.is_guest === true || rec.guest === true;
      const communicationTimeoutUntil = readOptionalIsoDate(
        rec,
        'communicationTimeoutUntil',
        'communication_timeout_until',
        'timeoutUntil',
        'timeout_until',
      );
      const joinedAt = readOptionalIsoDate(rec, 'joinedAt', 'joined_at');
      const badges = readMemberBadgeIds(rec, 'badges');
      const bannerImage = readMemberString(rec, 'bannerImage', 'banner_image');
      const bannerColor = readMemberString(rec, 'bannerColor', 'banner_color');
      const bannerRefractionEnabled =
        rec.bannerRefractionEnabled === true ||
        rec.banner_refraction_enabled === true;
      const bannerBlurEnabled =
        rec.bannerBlurEnabled === true || rec.banner_blur_enabled === true;
      const bannerBlackoutEnabled =
        rec.bannerBlackoutEnabled === true ||
        rec.banner_blackout_enabled === true;
      let bannerPositionY: number | undefined;
      const bpy = rec.bannerPositionY ?? rec.banner_position_y;
      if (typeof bpy === 'number' && Number.isFinite(bpy)) {
        bannerPositionY = Math.max(0, Math.min(100, bpy));
      } else if (typeof bpy === 'string' && bpy.trim()) {
        const n = Number(bpy);
        if (Number.isFinite(n)) bannerPositionY = Math.max(0, Math.min(100, n));
      }
      rows.push({
        userId,
        name,
        ...(accountDisplayName ? { accountDisplayName } : {}),
        ...(serverNickname ? { serverNickname } : {}),
        ...(username ? { username } : {}),
        pfp,
        bio,
        isDiscordShadow,
        ...(isGuest ? { isGuest: true } : {}),
        ...(communicationTimeoutUntil ? { communicationTimeoutUntil } : {}),
        ...(joinedAt ? { joinedAt } : {}),
        ...(badges?.length ? { badges } : {}),
        bannerImage,
        bannerColor,
        bannerRefractionEnabled,
        bannerBlurEnabled,
        bannerBlackoutEnabled,
        ...(bannerPositionY !== undefined ? { bannerPositionY } : {}),
      });
    }
    out[s.id] = rows;
  }
  return out;
}

export function deriveTimeoutUntilByServerUser(
  membersByServer: Record<string, EchoServerMemberDto[]> | undefined,
): Record<string, Record<string, number>> {
  if (!membersByServer) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const [serverId, members] of Object.entries(membersByServer)) {
    const perUser: Record<string, number> = {};
    for (const member of members) {
      if (!member.userId || !member.communicationTimeoutUntil) continue;
      const epochMs = Date.parse(member.communicationTimeoutUntil);
      if (!Number.isFinite(epochMs) || epochMs <= Date.now()) continue;
      perUser[member.userId] = epochMs;
    }
    if (Object.keys(perUser).length > 0) out[serverId] = perUser;
  }
  return out;
}

/** Merge workspace member DTOs into the client user list (upsert by user id). */
function mergeUserBadgesFromMemberRow(
  m: EchoServerMemberDto,
  prevBadges: string[] | undefined,
): string[] | undefined {
  if (!('badges' in m) || m.badges === undefined) return prevBadges;
  const incoming = Array.isArray(m.badges)
    ? m.badges.filter(
        (b): b is string => typeof b === 'string' && b.trim().length > 0,
      )
    : [];
  return incoming.length ? incoming : undefined;
}

/**
 * Build `serverId -> userId -> nickname` from workspace members (nickname map per server).
 */
export function buildServerMemberNicknameMapFromMembersByServer(
  membersByServer: Record<string, EchoServerMemberDto[]> | undefined,
): Record<string, Record<string, string>> {
  if (!membersByServer) return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [serverId, list] of Object.entries(membersByServer)) {
    if (!serverId.trim() || !Array.isArray(list)) continue;
    const per: Record<string, string> = {};
    for (const m of list) {
      const uid = m.userId?.trim() ?? '';
      const nick = m.serverNickname?.trim() ?? '';
      if (!uid || !nick) continue;
      per[uid] = nick.slice(0, 32);
    }
    if (Object.keys(per).length) out[serverId] = per;
  }
  return out;
}

function workspaceMemberBannerVisuals(m: EchoServerMemberDto): {
  bio: string;
  bannerImage: string;
  bannerColor: string;
  bannerRefractionEnabled: boolean;
  bannerBlurEnabled: boolean;
  bannerBlackoutEnabled: boolean;
  bannerPositionY: number | undefined;
} {
  const bio = typeof m.bio === 'string' ? m.bio.trim() : '';
  const bi = typeof m.bannerImage === 'string' ? m.bannerImage.trim() : '';
  const bc = typeof m.bannerColor === 'string' ? m.bannerColor.trim() : '';
  const py =
    typeof m.bannerPositionY === 'number' && Number.isFinite(m.bannerPositionY)
      ? Math.max(0, Math.min(100, m.bannerPositionY))
      : undefined;
  return {
    bio,
    bannerImage: bi,
    bannerColor: bc,
    bannerRefractionEnabled: m.bannerRefractionEnabled === true,
    bannerBlurEnabled: m.bannerBlurEnabled === true,
    bannerBlackoutEnabled: m.bannerBlackoutEnabled === true,
    bannerPositionY: py,
  };
}

function prevBannerKey(u: {
  bio?: string;
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  bannerPositionY?: number;
}): string {
  return JSON.stringify({
    bio: u.bio ?? '',
    a: u.bannerImage ?? '',
    b: u.bannerColor ?? '',
    c: u.bannerRefractionEnabled === true,
    d: u.bannerBlurEnabled === true,
    e: u.bannerBlackoutEnabled === true,
    f: u.bannerPositionY,
  });
}

export function mergeEchoWorkspaceMembersIntoUsers<
  T extends {
    id: string;
    name: string;
    username?: string;
    pfp: string;
    status?: string;
    isDiscordShadow?: boolean;
    isGuest?: boolean;
    badges?: string[];
    bannerImage?: string;
    bannerColor?: string;
    bannerRefractionEnabled?: boolean;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
    bannerPositionY?: number;
    bio?: string;
  },
>(existing: T[], membersByServer: Record<string, EchoServerMemberDto[]>): T[] {
  if (!membersByServer || Object.keys(membersByServer).length === 0) {
    return existing;
  }

  const byId = new Map<string, T>();
  for (const u of existing) {
    byId.set(u.id, u);
  }

  let changed = false;
  for (const list of Object.values(membersByServer)) {
    for (const m of list) {
      const uid = m.userId.trim();
      if (!uid) continue;
      const prev = byId.get(uid);
      /** Prefer account-scoped display so `users[].name` stays global across guilds (nicknames live in `serverMemberNicknames`). */
      const name =
        m.accountDisplayName?.trim() || (m.name.trim() ? m.name : undefined);
      const username = m.username?.trim() ? m.username.trim() : undefined;
      const pfp = m.pfp.trim() ? m.pfp : undefined;
      const isDiscordShadow = m.isDiscordShadow === true;
      const isGuest = m.isGuest === true;

      const ban = workspaceMemberBannerVisuals(m);

      if (!prev) {
        changed = true;
        const badges = mergeUserBadgesFromMemberRow(m, undefined);
        byId.set(uid, {
          id: uid,
          name: name ?? 'Unknown',
          ...(username ? { username } : {}),
          pfp: pfp ?? '',
          status: '',
          isDiscordShadow,
          ...(isGuest ? { isGuest: true } : {}),
          ...(badges?.length ? { badges } : {}),
          ...ban,
        } as T);
      } else {
        const nextName = name ?? prev.name;
        const nextUsername = username ?? prev.username;
        const nextPfp = pfp !== undefined ? pfp : prev.pfp;
        const nextIsShadow = prev.isDiscordShadow || isDiscordShadow;
        const nextIsGuest = Boolean(
          (prev as { isGuest?: boolean }).isGuest || isGuest,
        );
        const nextBadges = mergeUserBadgesFromMemberRow(
          m,
          (prev as { badges?: string[] }).badges,
        );
        const prevBadges = (prev as { badges?: string[] }).badges;
        const badgesEqual =
          (nextBadges?.length ?? 0) === (prevBadges?.length ?? 0) &&
          (nextBadges ?? []).every((b, i) => b === (prevBadges ?? [])[i]);

        const pBanner = prev as T & {
          bio?: string;
          bannerImage?: string;
          bannerColor?: string;
          bannerRefractionEnabled?: boolean;
          bannerBlurEnabled?: boolean;
          bannerBlackoutEnabled?: boolean;
          bannerPositionY?: number;
        };
        const bannerEqual = prevBannerKey(pBanner) === prevBannerKey(ban);

        if (
          prev.name !== nextName ||
          prev.username !== nextUsername ||
          prev.pfp !== nextPfp ||
          prev.isDiscordShadow !== nextIsShadow ||
          (prev as { isGuest?: boolean }).isGuest !== nextIsGuest ||
          !badgesEqual ||
          !bannerEqual
        ) {
          changed = true;
          const { badges: _prevBadges, ...prevRest } = prev as T & {
            badges?: string[];
          };
          byId.set(uid, {
            ...prevRest,
            name: nextName,
            ...(nextUsername ? { username: nextUsername } : {}),
            pfp: nextPfp,
            isDiscordShadow: nextIsShadow,
            isGuest: nextIsGuest,
            ...(nextBadges?.length ? { badges: nextBadges } : {}),
            ...ban,
          } as T);
        }
      }
    }
  }

  return changed ? Array.from(byId.values()) : existing;
}

/** Single server: API fields → canonical `EchoWorkspaceState['servers'][number]`. */
export function normalizeEchoWorkspaceServerRow(
  s: EchoWorkspaceRawServer,
): EchoWorkspaceState['servers'][number] {
  const imageUrl =
    typeof s.iconUrl === 'string' && s.iconUrl.trim() ? s.iconUrl.trim() : '';
  const banner =
    typeof s.bannerUrl === 'string' && s.bannerUrl.trim()
      ? s.bannerUrl.trim()
      : undefined;
  const vc = typeof s.vanityCode === 'string' ? s.vanityCode.trim() : '';
  const desc = typeof s.description === 'string' ? s.description.trim() : '';
  const tags = Array.isArray(s.tags)
    ? s.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    : [];
  return {
    id: s.id,
    name: s.name,
    imageUrl,
    ...(banner ? { bannerImageUrl: banner } : {}),
    ...(typeof s.bannerPositionY === 'number' &&
    Number.isFinite(s.bannerPositionY)
      ? { bannerPositionY: Math.max(0, Math.min(100, s.bannerPositionY)) }
      : {}),
    ownerId: s.ownerId,
    description: desc,
    ...(tags.length ? { tags } : {}),
    listedInDirectory: s.listedInDirectory,
    inviteJoinEnabled: s.inviteJoinEnabled,
    automodSpamEnabled: s.automodSpamEnabled,
    ...(vc ? { vanityCode: vc } : {}),
    bannerBlurEnabled: s.bannerBlurEnabled,
    bannerBlackoutEnabled: s.bannerBlackoutEnabled,
    raidProtectionEnabled: s.raidProtectionEnabled,
    raidJoinThresholdCount: s.raidJoinThresholdCount,
    raidJoinWindowSeconds: s.raidJoinWindowSeconds,
    discordGuildId: s.discordGuildId,
    applicationsEnabled: s.applicationsEnabled,
  };
}

function evStr(
  rec: Record<string, unknown>,
  camel: string,
  snake: string,
): string {
  const a = rec[camel];
  const b = rec[snake];
  if (typeof a === 'string' && a.trim()) return a.trim();
  if (typeof b === 'string' && b.trim()) return b.trim();
  return '';
}

function evNum(
  rec: Record<string, unknown>,
  camel: string,
  snake: string,
): number | null {
  for (const v of [rec[camel], rec[snake]]) {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v);
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.trim());
      if (Number.isFinite(n)) return Math.floor(n);
    }
  }
  return null;
}

function normalizeEchoWorkspaceEventSummary(
  rec: Record<string, unknown>,
): EchoWorkspaceEventSummary | null {
  const id = evStr(rec, 'id', 'id');
  const serverId = evStr(rec, 'serverId', 'server_id');
  if (!id || !serverId) return null;
  const title = evStr(rec, 'title', 'title') || 'Event';
  const startsAt = readOptionalIsoDate(rec, 'startsAt', 'starts_at');
  const endsAt = readOptionalIsoDate(rec, 'endsAt', 'ends_at');
  if (!startsAt || !endsAt) return null;
  const ur = evStr(rec, 'userRsvp', 'user_rsvp_status');
  const userRsvp =
    ur === 'going' || ur === 'declined' ? (ur as 'going' | 'declined') : null;
  const maxA = evNum(rec, 'maxAttendees', 'max_attendees');
  return {
    id,
    serverId,
    title,
    description: evStr(rec, 'description', 'description'),
    imageUrl: evStr(rec, 'imageUrl', 'image_url'),
    startsAt,
    endsAt,
    timezoneLabel: (() => {
      const t = evStr(rec, 'timezoneLabel', 'timezone_label');
      return t || null;
    })(),
    channelId: (() => {
      const c = evStr(rec, 'channelId', 'channel_id');
      return c || null;
    })(),
    channelName: (() => {
      const c = evStr(rec, 'channelName', 'channel_name');
      return c || null;
    })(),
    goingCount: Math.max(0, evNum(rec, 'goingCount', 'going_count') ?? 0),
    maxAttendees: maxA != null && maxA > 0 ? maxA : null,
    userRsvp,
  };
}

export function normalizeUpcomingEventsByServer(
  raw: unknown,
): Record<string, EchoWorkspaceEventSummary[]> {
  const out: Record<string, EchoWorkspaceEventSummary[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [sid, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!sid.trim() || !Array.isArray(list)) continue;
    const rows: EchoWorkspaceEventSummary[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const n = normalizeEchoWorkspaceEventSummary(
        item as Record<string, unknown>,
      );
      if (n) rows.push(n);
    }
    if (rows.length) out[sid] = rows;
  }
  return out;
}

function normalizeEchoWorkspaceMyEventRsvp(
  rec: Record<string, unknown>,
): EchoWorkspaceMyEventRsvp | null {
  const id = evStr(rec, 'id', 'id');
  const serverId = evStr(rec, 'serverId', 'server_id');
  if (!id || !serverId) return null;
  const startsAt = readOptionalIsoDate(rec, 'startsAt', 'starts_at');
  const endsAt = readOptionalIsoDate(rec, 'endsAt', 'ends_at');
  if (!startsAt || !endsAt) return null;
  const maxA = evNum(rec, 'maxAttendees', 'max_attendees');
  return {
    id,
    serverId,
    serverName: evStr(rec, 'serverName', 'server_name') || 'Server',
    serverImageUrl: evStr(rec, 'serverImageUrl', 'server_image_url'),
    title: evStr(rec, 'title', 'title') || 'Event',
    imageUrl: evStr(rec, 'imageUrl', 'image_url'),
    startsAt,
    endsAt,
    channelId: (() => {
      const c = evStr(rec, 'channelId', 'channel_id');
      return c || null;
    })(),
    channelName: (() => {
      const c = evStr(rec, 'channelName', 'channel_name');
      return c || null;
    })(),
    goingCount: Math.max(0, evNum(rec, 'goingCount', 'going_count') ?? 0),
    maxAttendees: maxA != null && maxA > 0 ? maxA : null,
  };
}

export function normalizeMyEventRsvps(raw: unknown): EchoWorkspaceMyEventRsvp[] {
  if (!Array.isArray(raw)) return [];
  const out: EchoWorkspaceMyEventRsvp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const n = normalizeEchoWorkspaceMyEventRsvp(item as Record<string, unknown>);
    if (n) out.push(n);
  }
  return out;
}

export function deriveServerMemberIds(
  serverIds: string[],
  options: {
    membersByServer?: Record<string, EchoServerMemberDto[]>;
    currentUserId: string | undefined;
  },
): Record<string, string[]> {
  const serverMemberIds: Record<string, string[]> = {};
  for (const id of serverIds) {
    if (options.membersByServer) {
      serverMemberIds[id] = (options.membersByServer[id] ?? [])
        .map((m) => m.userId)
        .filter(Boolean);
    } else {
      serverMemberIds[id] = options.currentUserId
        ? [options.currentUserId]
        : [];
    }
  }
  return serverMemberIds;
}

/**
 * Canonical workspace snapshot from validated `/workspace` pieces (no fetch, no UI).
 */
export function buildEchoWorkspaceState(
  servers: EchoWorkspaceRawServer[],
  categoriesByServer: Record<string, ChannelCategory[]>,
  currentUserId: string | undefined,
  workspaceVersion = '0',
  membersByServer?: Record<string, EchoServerMemberDto[]>,
  upcomingEventsByServerId: Record<string, EchoWorkspaceEventSummary[]> = {},
  myEventRsvps: EchoWorkspaceMyEventRsvp[] = [],
): EchoWorkspaceState {
  const displayServers = servers.map(normalizeEchoWorkspaceServerRow);
  const serverMemberIds = deriveServerMemberIds(
    servers.map((x) => x.id),
    { membersByServer, currentUserId },
  );
  const out: EchoWorkspaceState = {
    servers: displayServers,
    categoriesByServer,
    serverMemberIds,
    workspaceVersion:
      typeof workspaceVersion === 'string' && workspaceVersion.trim()
        ? workspaceVersion.trim()
        : '0',
    upcomingEventsByServerId,
    myEventRsvps,
  };
  if (membersByServer) {
    out.membersByServer = membersByServer;
  }
  return out;
}

export type EchoWorkspaceMemberFetchDebugPayload = {
  currentUserIdArg: string;
  workspaceVersion: string;
  membersPayloadBranch: 'membersByServer' | 'members_by_server' | 'none';
  rawMembersCounts: Record<string, number>;
  normalizedMembersCounts: Record<string, number> | '(undefined)';
  mappedServerMemberIdCounts: Record<string, number>;
  firstMemberRowKeysSample: string[];
};

export function buildWorkspaceMemberFetchDebugPayload(input: {
  raw: {
    membersByServer?: unknown;
    members_by_server?: unknown;
    servers: { id: string }[];
  };
  rawMembers: unknown;
  mapped: EchoWorkspaceState;
  currentUserId: string | undefined;
  membersByServer: Record<string, EchoServerMemberDto[]> | undefined;
}): EchoWorkspaceMemberFetchDebugPayload {
  const { raw, rawMembers, mapped, currentUserId, membersByServer } = input;
  const firstSid = raw.servers[0]?.id;
  let firstMemberRowKeysSample: string[] = [];
  if (firstSid && rawMembers && typeof rawMembers === 'object') {
    const list = (rawMembers as Record<string, unknown>)[firstSid];
    const row0 = Array.isArray(list) ? list[0] : null;
    if (row0 && typeof row0 === 'object' && !Array.isArray(row0)) {
      firstMemberRowKeysSample = Object.keys(row0 as object);
    }
  }
  return {
    currentUserIdArg: currentUserId ?? '(undefined)',
    workspaceVersion: mapped.workspaceVersion,
    membersPayloadBranch:
      raw.membersByServer != null && typeof raw.membersByServer === 'object'
        ? 'membersByServer'
        : raw.members_by_server != null &&
            typeof raw.members_by_server === 'object'
          ? 'members_by_server'
          : 'none',
    rawMembersCounts:
      rawMembers && typeof rawMembers === 'object'
        ? Object.fromEntries(
            Object.entries(rawMembers as Record<string, unknown>).map(
              ([k, v]) => [k, Array.isArray(v) ? v.length : -1],
            ),
          )
        : {},
    normalizedMembersCounts: membersByServer
      ? Object.fromEntries(
          Object.entries(membersByServer).map(([k, rows]) => [k, rows.length]),
        )
      : '(undefined)',
    mappedServerMemberIdCounts: Object.fromEntries(
      Object.entries(mapped.serverMemberIds).map(([k, ids]) => [
        k,
        Array.isArray(ids) ? ids.length : -1,
      ]),
    ),
    firstMemberRowKeysSample,
  };
}

export type WorkspaceHttpJsonToStateOptions = {
  onWorkspaceMemberFetchDebug?: (
    payload: EchoWorkspaceMemberFetchDebugPayload,
  ) => void;
};

/**
 * Map validated `/workspace` HTTP JSON to canonical `EchoWorkspaceState`.
 * Call after transport fetch + structural validation (servers array, categories per server).
 */
export function workspaceHttpJsonToEchoWorkspaceState(
  raw: WorkspaceHttpJsonValidated,
  currentUserId: string | undefined,
  options?: WorkspaceHttpJsonToStateOptions,
): EchoWorkspaceState {
  const rawMembers =
    raw.membersByServer != null && typeof raw.membersByServer === 'object'
      ? raw.membersByServer
      : raw.members_by_server != null &&
          typeof raw.members_by_server === 'object'
        ? raw.members_by_server
        : undefined;
  const membersByServer =
    rawMembers !== undefined
      ? normalizeWorkspaceMembersByServer(rawMembers, raw.servers)
      : undefined;

  const rawRec = raw as Record<string, unknown>;
  const upcoming = normalizeUpcomingEventsByServer(
    rawRec.upcomingEventsByServerId ??
      rawRec.upcoming_events_by_server_id,
  );
  const myRsvps = normalizeMyEventRsvps(
    rawRec.myEventRsvps ?? rawRec.my_event_rsvps,
  );

  const mapped = buildEchoWorkspaceState(
    raw.servers,
    raw.categoriesByServer,
    currentUserId,
    typeof raw.workspaceVersion === 'string' ? raw.workspaceVersion : '0',
    membersByServer,
    upcoming,
    myRsvps,
  );

  options?.onWorkspaceMemberFetchDebug?.(
    buildWorkspaceMemberFetchDebugPayload({
      raw,
      rawMembers,
      mapped,
      currentUserId,
      membersByServer,
    }),
  );

  return mapped;
}
