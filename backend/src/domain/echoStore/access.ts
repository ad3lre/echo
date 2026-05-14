import type pg from 'pg';
import type { MentionEntity } from '../../../../shared/types';
import { evaluatePermissionSet } from '../echoPermissionEvaluate';
import { invalidateEchoPermissionCacheForServer } from '../echoPermissionCache';
import type { ServerAggregationTrace } from '../echoPermissionTrace';
import { composePermissionExplanation } from '../permissionExplanation';
import {
  getEffectiveChannelPermissions,
  getMergedRolePermissions,
} from './permissions';
import { type EchoPermission } from '../echoPermissionPrimitives';
import {
  forumCreatorCanManagePostFlags,
  getForumPostCreatorAccess,
} from './forumCreatorAccess';
import { isEchoPairBlocked } from './blocks';
import {
  ECHO_DM_REALM_SERVER_ID,
  getEchoDmPeerUserId,
  isEchoGroupDmChannel,
  userHasEchoDirectDmAccess,
  userHasEchoGroupDmAccess,
} from './dmThreads';

export async function getEchoChannelServerId(
  pool: pg.Pool,
  channelId: string,
): Promise<string | null> {
  const ch = await pool.query(
    `SELECT server_id FROM echo_channels WHERE id = $1`,
    [channelId],
  );
  const row = ch.rows[0];
  return row ? String(row.server_id) : null;
}

/** Existence check for Socket.IO branch + join gate (no permission — caller checks). */
export async function echoChannelExistsInDb(
  pool: pg.Pool,
  channelId: string,
): Promise<boolean> {
  const ch = await pool.query(
    `SELECT 1 FROM echo_channels WHERE id = $1 LIMIT 1`,
    [channelId],
  );
  return ch.rows.length > 0;
}

export async function isUserBannedFromServer(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const r = await pool.query(
    `
    SELECT 1 FROM echo_server_bans
    WHERE server_id = $1 AND user_id = $2
      AND (expires_at IS NULL OR expires_at > NOW())
    `,
    [serverId, userId],
  );
  return r.rows.length > 0;
}

export async function isUserCommunicationTimedOut(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const state = await getUserCommunicationTimeoutState(pool, serverId, userId);
  return state.active;
}

export type EchoCommunicationTimeoutState = {
  active: boolean;
  timeoutUntil: string | null;
  timeoutUntilEpochMs: number | null;
};

export async function getUserCommunicationTimeoutState(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<EchoCommunicationTimeoutState> {
  const r = await pool.query<{ timeout_until: string | Date }>(
    `
    SELECT timeout_until
    FROM echo_server_member_timeouts
    WHERE server_id = $1 AND user_id = $2 AND timeout_until > NOW()
    `,
    [serverId, userId],
  );
  const row = r.rows[0];
  if (!row?.timeout_until) {
    return {
      active: false,
      timeoutUntil: null,
      timeoutUntilEpochMs: null,
    };
  }
  const iso =
    row.timeout_until instanceof Date
      ? row.timeout_until.toISOString()
      : new Date(String(row.timeout_until)).toISOString();
  const epochMs = Date.parse(iso);
  return {
    active: Number.isFinite(epochMs),
    timeoutUntil: iso,
    timeoutUntilEpochMs: Number.isFinite(epochMs) ? epochMs : null,
  };
}

/** Machine-readable denial reason for `diagnoseEchoChannelAccess` (also sent as JSON `detail`). */
export type EchoChannelAccessDenialCode =
  | 'CHANNEL_NOT_FOUND'
  | 'DM_USER_BLOCKED'
  | 'DM_NOT_ALLOWED'
  | 'GROUP_DM_NOT_MEMBER'
  | 'NOT_SERVER_MEMBER'
  | 'BANNED_FROM_SERVER'
  | 'MISSING_VIEW_CHANNEL';

export type EchoChannelAccessDiagnosis =
  | { ok: true }
  | {
      ok: false;
      code: EchoChannelAccessDenialCode;
      message: string;
    };

/**
 * Why REST/socket channel access is denied — use for specific 403/404 messages (not the generic
 * "Not a member of this channel" string).
 */
export async function diagnoseEchoChannelAccess(
  pool: pg.Pool,
  userId: string,
  channelId: string,
): Promise<EchoChannelAccessDiagnosis> {
  const sid = await getEchoChannelServerId(pool, channelId);
  if (!sid) {
    return {
      ok: false,
      code: 'CHANNEL_NOT_FOUND',
      message: 'This channel does not exist or was deleted.',
    };
  }
  if (sid === ECHO_DM_REALM_SERVER_ID) {
    // Persisted group DMs must use membership + group rules only. If `echo_dm_threads`
    // ever contains a stray row for the same channel_id (data bug / migration), treating
    // the channel as 1:1 would wrongly deny real group members.
    if (await isEchoGroupDmChannel(pool, channelId)) {
      if (await userHasEchoGroupDmAccess(pool, channelId, userId)) {
        return { ok: true };
      }
      return {
        ok: false,
        code: 'GROUP_DM_NOT_MEMBER',
        message: 'You are not a member of this group DM.',
      };
    }
    const peer = await getEchoDmPeerUserId(pool, channelId, userId);
    if (peer) {
      if (await isEchoPairBlocked(pool, userId, peer)) {
        return {
          ok: false,
          code: 'DM_USER_BLOCKED',
          message:
            'You cannot open this DM because you or the other user has blocked the other.',
        };
      }
      if (await userHasEchoDirectDmAccess(pool, channelId, userId)) {
        return { ok: true };
      }
      return {
        ok: false,
        code: 'DM_NOT_ALLOWED',
        message: 'You do not have access to this direct message channel.',
      };
    }
    if (await userHasEchoGroupDmAccess(pool, channelId, userId)) {
      return { ok: true };
    }
    return {
      ok: false,
      code: 'GROUP_DM_NOT_MEMBER',
      message: 'You are not a member of this group DM.',
    };
  }
  const mem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [sid, userId],
  );
  if (mem.rows.length === 0) {
    return {
      ok: false,
      code: 'NOT_SERVER_MEMBER',
      message:
        'You are not a member of this server. Ask an admin for an invite or join from Explore if the server is listed.',
    };
  }
  if (await isUserBannedFromServer(pool, sid, userId)) {
    return {
      ok: false,
      code: 'BANNED_FROM_SERVER',
      message:
        'You are banned from this server, so you cannot view or use its channels.',
    };
  }
  const perms = await getEffectiveChannelPermissions(
    pool,
    sid,
    userId,
    channelId,
  );
  if (!perms.has('VIEW_CHANNEL')) {
    return {
      ok: false,
      code: 'MISSING_VIEW_CHANNEL',
      message:
        'Your roles do not include View Channel for this channel (it may be hidden or denied by a permission overwrite).',
    };
  }
  return { ok: true };
}

/** Member, not banned, role allows VIEW_CHANNEL (implicit @everyone if no member_roles rows). */
export async function canUserAccessChannel(
  pool: pg.Pool,
  userId: string,
  channelId: string,
): Promise<boolean> {
  const d = await diagnoseEchoChannelAccess(pool, userId, channelId);
  return d.ok;
}

export type EchoPostMessageDenialReason =
  | 'no_channel'
  | 'not_member'
  | 'banned'
  | 'no_view'
  | 'timeout'
  | 'no_send'
  | 'locked'
  | 'archived'
  /** DM realm: pair blocked (must not reuse `not_member` guild copy). */
  | 'dm_user_blocked'
  /** DM realm: no friendship / mutual server / eligible message-request access. */
  | 'dm_not_allowed'
  /** DM realm: not a member of this group DM. */
  | 'group_dm_not_member';

export type EchoServerCapabilities = {
  canManageRoles: boolean;
  canManageServer: boolean;
  canCreateChannel: boolean;
  canModerateMembers: boolean;
  canKickMembers: boolean;
  canBanMembers: boolean;
  canTimeoutMembers: boolean;
  canManageMessages: boolean;
  canCreateInvite: boolean;
  canChangeNicknames: boolean;
  canManageNicknames: boolean;
  canMentionEveryone: boolean;
  canUseExpressions: boolean;
  canModerateVoice: boolean;
  /** Voice channel: server mute (MUTE_MEMBERS / VC_MUTE). */
  canMuteVoiceMembers: boolean;
  /** Voice channel: server deafen (DEAFEN_MEMBERS / VC_DEAFEN). */
  canDeafenVoiceMembers: boolean;
  /** Voice channel: move members between voice channels (MOVE_MEMBERS / VC_MOVE). */
  canMoveVoiceMembers: boolean;
  canUseVideo: boolean;
  communicationTimeoutActive: boolean;
  communicationTimeoutUntil: string | null;
  communicationTimeoutUntilEpochMs: number | null;
};

export type EchoChannelCapabilities = {
  canViewChannel: boolean;
  canSendMessages: boolean;
  canCreatePolls: boolean;
  canUploadFiles: boolean;
  canMentionEveryone: boolean;
  canUseExternalEmoji: boolean;
  canManageChannel: boolean;
  communicationTimeoutActive: boolean;
  communicationTimeoutUntil: string | null;
  communicationTimeoutUntilEpochMs: number | null;
};

export function messageContainsMassMention(
  mentions: ReadonlyArray<Pick<MentionEntity, 'kind'>> | null | undefined,
): boolean {
  return (
    mentions?.some(
      (mention) => mention.kind === 'everyone' || mention.kind === 'active',
    ) ?? false
  );
}

export async function canUserMassMentionInChannel(
  pool: pg.Pool,
  userId: string,
  channelId: string,
): Promise<boolean> {
  const sid = await getEchoChannelServerId(pool, channelId);
  if (!sid || sid === ECHO_DM_REALM_SERVER_ID) return true;
  const perms = await getEffectiveChannelPermissions(
    pool,
    sid,
    userId,
    channelId,
  );
  return perms.has('MENTION_EVERYONE');
}

export async function canUserSendMassMentionInChannel(
  pool: pg.Pool,
  userId: string,
  channelId: string,
  mentions: ReadonlyArray<Pick<MentionEntity, 'kind'>> | null | undefined,
): Promise<boolean> {
  if (!messageContainsMassMention(mentions)) return true;
  return canUserMassMentionInChannel(pool, userId, channelId);
}

/**
 * Why a message send may be denied — **one** `getEffectiveChannelPermissions` read (unlike chaining
 * `canUserAccessChannel` + `canUserPostMessage`, which doubled cache/DB work).
 */
function normalizeRolePermissionKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string').sort();
}

function traceEventsForViewAndSend(
  traces: ServerAggregationTrace[],
): unknown[] {
  const bits = new Set(['VIEW_CHANNEL', 'SEND_MESSAGES']);
  const out: unknown[] = [];
  for (const t of traces) {
    if (t.mode === 'full' && t.full) {
      for (const ev of t.full) {
        if ('bit' in ev && bits.has(ev.bit)) out.push(ev);
      }
    }
    if (t.mode === 'compressed' && t.compressed) {
      for (const c of t.compressed) {
        if (bits.has(c.bit)) {
          out.push({ layer: c.layer, bit: c.bit, sourceLabel: c.sourceLabel });
        }
      }
    }
  }
  return out;
}

/**
 * Hyper-specific context for operators when a socket message is denied (logged server-side;
 * optionally attached to `message_failed` for dev clients).
 */
export async function gatherEchoPostMessageFailureDiagnostics(
  pool: pg.Pool,
  input: {
    userId: string;
    channelId: string;
    reason: EchoPostMessageDenialReason;
    correlationId?: string;
  },
): Promise<Record<string, unknown>> {
  const { userId, channelId, reason, correlationId } = input;
  const base: Record<string, unknown> = {
    kind: 'echo.post_message.denied',
    at: new Date().toISOString(),
    userId,
    channelId,
    denialReason: reason,
    ...(correlationId ? { correlationId } : {}),
  };

  const sid = await getEchoChannelServerId(pool, channelId);
  if (!sid) {
    return {
      ...base,
      note: 'Channel row missing — cannot resolve server or role graph.',
    };
  }

  base.serverId = sid;

  try {
    base.isServerOwner = await isEchoServerOwner(pool, sid, userId);
    base.isMember =
      (
        await pool.query(
          `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
          [sid, userId],
        )
      ).rows.length > 0;
    base.isBanned = await isUserBannedFromServer(pool, sid, userId);
    base.communicationTimeoutActive = await isUserCommunicationTimedOut(
      pool,
      sid,
      userId,
    );
  } catch (e) {
    base.membershipFlagsError = e instanceof Error ? e.message : String(e);
  }

  try {
    const roleRes = await pool.query(
      `
      SELECT r.id, r.name, r.position, r.permissions
      FROM echo_member_roles mr
      INNER JOIN echo_roles r ON r.id = mr.role_id AND r.server_id = mr.server_id
      WHERE mr.server_id = $1 AND mr.user_id = $2
      ORDER BY r.position ASC, r.id ASC
      `,
      [sid, userId],
    );
    base.assignedRoles = roleRes.rows.map((row: Record<string, unknown>) => ({
      roleId: String(row.id ?? ''),
      name: String(row.name ?? ''),
      position: Number(row.position ?? 0),
      permissionKeysOnRole: normalizeRolePermissionKeys(row.permissions),
    }));
  } catch (e) {
    base.assignedRolesError = e instanceof Error ? e.message : String(e);
  }

  try {
    const merged = await getMergedRolePermissions(pool, sid, userId);
    base.mergedServerRolePermissions = [...merged].sort();
    base.mergedServerFlags = {
      SEND_MESSAGES: merged.has('SEND_MESSAGES'),
      VIEW_CHANNEL: merged.has('VIEW_CHANNEL'),
    };
  } catch (e) {
    base.mergedServerRolePermissionsError =
      e instanceof Error ? e.message : String(e);
  }

  try {
    const chRow = await pool.query(
      `
      SELECT ch.id, ch.name, ch.category_id, ch.permission_overrides AS channel_permission_overrides_json,
             cat.name AS category_name
      FROM echo_channels ch
      INNER JOIN echo_categories cat ON cat.id = ch.category_id AND cat.server_id = ch.server_id
      WHERE ch.id = $1 AND ch.server_id = $2
      `,
      [channelId, sid],
    );
    if (chRow.rows[0]) {
      const row = chRow.rows[0] as Record<string, unknown>;
      const categoryId = String(row.category_id ?? '');
      base.channel = {
        id: String(row.id ?? ''),
        name: String(row.name ?? ''),
        categoryId,
        categoryName: String(row.category_name ?? ''),
        permissionOverridesJson: row.channel_permission_overrides_json ?? null,
      };
      const catOv = await pool.query(
        `SELECT permission_overrides FROM echo_category_permission_overrides WHERE server_id = $1 AND category_id = $2`,
        [sid, categoryId],
      );
      base.categoryPermissionOverridesJson =
        catOv.rows[0]?.permission_overrides ?? null;

      const [chOw, catOwRows] = await Promise.all([
        pool.query(
          `SELECT target_type, target_id FROM echo_channel_permission_overwrite_rows WHERE server_id = $1 AND channel_id = $2 ORDER BY id ASC`,
          [sid, channelId],
        ),
        pool.query(
          `SELECT target_type, target_id FROM echo_category_permission_overwrite_rows WHERE server_id = $1 AND category_id = $2 ORDER BY id ASC`,
          [sid, categoryId],
        ),
      ]);
      base.channelOverwriteRowTargets = chOw.rows.map(
        (r: Record<string, unknown>) => ({
          targetType: String(r.target_type ?? ''),
          targetId: r.target_id != null ? String(r.target_id) : null,
        }),
      );
      base.categoryOverwriteRowTargets = catOwRows.rows.map(
        (r: Record<string, unknown>) => ({
          targetType: String(r.target_type ?? ''),
          targetId: r.target_id != null ? String(r.target_id) : null,
        }),
      );
    }
  } catch (e) {
    base.channelContextError = e instanceof Error ? e.message : String(e);
  }

  if (reason === 'no_view' || reason === 'no_send' || reason === 'timeout') {
    try {
      const effective = await getEffectiveChannelPermissions(
        pool,
        sid,
        userId,
        channelId,
      );
      base.effectiveChannelPermissions = [...effective].sort();
      base.effectiveChannelFlags = {
        VIEW_CHANNEL: effective.has('VIEW_CHANNEL'),
        SEND_MESSAGES: effective.has('SEND_MESSAGES'),
      };
    } catch (e) {
      base.effectiveChannelPermissionsError =
        e instanceof Error ? e.message : String(e);
    }
  }

  if (reason === 'no_view' || reason === 'no_send') {
    try {
      const { traces, effective } = await evaluatePermissionSet(
        pool,
        sid,
        userId,
        channelId,
        { traceMode: 'full' },
      );
      const expl = composePermissionExplanation(traces);
      base.permissionExplanationSummary = expl.summary;
      base.permissionTraceViewSendOnly = traceEventsForViewAndSend(traces);
      base.permissionCompressedBitsViewSendOnly = expl.compressedBits.filter(
        (c) => c.bit === 'VIEW_CHANNEL' || c.bit === 'SEND_MESSAGES',
      );
      base.effectiveChannelPermissionsFromFullEval = [...effective].sort();
    } catch (e) {
      base.fullPermissionEvalError = e instanceof Error ? e.message : String(e);
    }
  }

  return base;
}

export async function diagnoseEchoPostMessageDenial(
  pool: pg.Pool,
  userId: string,
  channelId: string,
): Promise<{ ok: true } | { ok: false; reason: EchoPostMessageDenialReason }> {
  const sid = await getEchoChannelServerId(pool, channelId);
  if (!sid) return { ok: false, reason: 'no_channel' };
  if (sid === ECHO_DM_REALM_SERVER_ID) {
    if (await isEchoGroupDmChannel(pool, channelId)) {
      if (await userHasEchoGroupDmAccess(pool, channelId, userId))
        return { ok: true };
      return { ok: false, reason: 'group_dm_not_member' };
    }
    const peer = await getEchoDmPeerUserId(pool, channelId, userId);
    if (peer) {
      if (await isEchoPairBlocked(pool, userId, peer))
        return { ok: false, reason: 'dm_user_blocked' };
      if (!(await userHasEchoDirectDmAccess(pool, channelId, userId)))
        return { ok: false, reason: 'dm_not_allowed' };
      return { ok: true };
    }
    if (await userHasEchoGroupDmAccess(pool, channelId, userId))
      return { ok: true };
    return { ok: false, reason: 'group_dm_not_member' };
  }
  const mem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [sid, userId],
  );
  if (mem.rows.length === 0) return { ok: false, reason: 'not_member' };
  if (await isUserBannedFromServer(pool, sid, userId))
    return { ok: false, reason: 'banned' };
  const perms = await getEffectiveChannelPermissions(
    pool,
    sid,
    userId,
    channelId,
  );
  if (!perms.has('VIEW_CHANNEL')) return { ok: false, reason: 'no_view' };
  if (await isUserCommunicationTimedOut(pool, sid, userId))
    return { ok: false, reason: 'timeout' };
  if (!perms.has('SEND_MESSAGES')) return { ok: false, reason: 'no_send' };
  const ch = await pool.query(
    `SELECT forum_post_locked, forum_post_archived_at
     FROM echo_channels
     WHERE id = $1 AND server_id = $2
     LIMIT 1`,
    [channelId, sid],
  );
  const row = ch.rows[0];
  if (row?.forum_post_locked === true) return { ok: false, reason: 'locked' };
  if (row?.forum_post_archived_at != null)
    return { ok: false, reason: 'archived' };
  return { ok: true };
}

/** Posting: channel access + SEND_MESSAGES + not in active comm timeout. */
export async function canUserPostMessage(
  pool: pg.Pool,
  userId: string,
  channelId: string,
): Promise<boolean> {
  const d = await diagnoseEchoPostMessageDenial(pool, userId, channelId);
  return d.ok;
}

/** Adding reactions: VIEW_CHANNEL + ADD_REACTIONS (guild); DMs use friendship gate only. */
export async function canUserAddMessageReaction(
  pool: pg.Pool,
  userId: string,
  channelId: string,
): Promise<boolean> {
  if (!(await canUserAccessChannel(pool, userId, channelId))) return false;
  const sid = await getEchoChannelServerId(pool, channelId);
  if (!sid) return false;
  if (sid === ECHO_DM_REALM_SERVER_ID) return true;
  const perms = await getEffectiveChannelPermissions(
    pool,
    sid,
    userId,
    channelId,
  );
  if (await isUserCommunicationTimedOut(pool, sid, userId)) return false;
  return perms.has('ADD_REACTIONS');
}

export async function getEchoServerCapabilitiesForUser(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<EchoServerCapabilities> {
  const [perms, timeoutState] = await Promise.all([
    getMergedRolePermissions(pool, serverId, userId),
    getUserCommunicationTimeoutState(pool, serverId, userId),
  ]);
  const canKickMembers = perms.has('KICK_MEMBERS');
  const canBanMembers = perms.has('BAN_MEMBERS');
  const canTimeoutMembers = perms.has('MODERATE_MEMBERS');
  const bundleModerate = canKickMembers || canBanMembers || canTimeoutMembers;
  return {
    canManageRoles: perms.has('MANAGE_ROLES'),
    canManageServer: perms.has('MANAGE_GUILD'),
    canCreateChannel: !timeoutState.active && perms.has('MANAGE_CHANNELS'),
    canModerateMembers: bundleModerate,
    canKickMembers,
    canBanMembers,
    canTimeoutMembers,
    canManageMessages: perms.has('MANAGE_MESSAGES'),
    canCreateInvite:
      !timeoutState.active &&
      (perms.has('CREATE_INSTANT_INVITE') || perms.has('CREATE_INVITE')),
    canChangeNicknames:
      !timeoutState.active &&
      (perms.has('CHANGE_NICKNAME') || perms.has('MANAGE_NICKNAMES')),
    canManageNicknames: !timeoutState.active && perms.has('MANAGE_NICKNAMES'),
    canMentionEveryone: !timeoutState.active && perms.has('MENTION_EVERYONE'),
    canUseExpressions:
      perms.has('USE_EXTERNAL_EMOJIS') ||
      perms.has('USE_EXTERNAL_STICKERS') ||
      perms.has('USE_EXPRESSIONS'),
    canModerateVoice:
      perms.has('MUTE_MEMBERS') ||
      perms.has('MOVE_MEMBERS') ||
      perms.has('DEAFEN_MEMBERS') ||
      perms.has('VC_MUTE') ||
      perms.has('VC_MOVE') ||
      perms.has('VC_DEAFEN'),
    canMuteVoiceMembers: perms.has('MUTE_MEMBERS') || perms.has('VC_MUTE'),
    canDeafenVoiceMembers:
      perms.has('DEAFEN_MEMBERS') || perms.has('VC_DEAFEN'),
    canMoveVoiceMembers: perms.has('MOVE_MEMBERS') || perms.has('VC_MOVE'),
    canUseVideo:
      !timeoutState.active && (perms.has('STREAM') || perms.has('USE_VIDEO')),
    communicationTimeoutActive: timeoutState.active,
    communicationTimeoutUntil: timeoutState.timeoutUntil,
    communicationTimeoutUntilEpochMs: timeoutState.timeoutUntilEpochMs,
  };
}

export async function getEchoChannelCapabilitiesForUser(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<EchoChannelCapabilities> {
  const sid = await getEchoChannelServerId(pool, channelId);
  if (!sid) {
    return {
      canViewChannel: false,
      canSendMessages: false,
      canCreatePolls: false,
      canUploadFiles: false,
      canMentionEveryone: false,
      canUseExternalEmoji: false,
      canManageChannel: false,
      communicationTimeoutActive: false,
      communicationTimeoutUntil: null,
      communicationTimeoutUntilEpochMs: null,
    };
  }
  if (sid === ECHO_DM_REALM_SERVER_ID) {
    let ok = false;
    if (await isEchoGroupDmChannel(pool, channelId)) {
      ok = await userHasEchoGroupDmAccess(pool, channelId, userId);
    } else {
      const peer = await getEchoDmPeerUserId(pool, channelId, userId);
      if (peer) {
        ok = await userHasEchoDirectDmAccess(pool, channelId, userId);
      } else {
        ok = await userHasEchoGroupDmAccess(pool, channelId, userId);
      }
    }
    return {
      canViewChannel: ok,
      canSendMessages: ok,
      canCreatePolls: ok,
      canUploadFiles: ok,
      canMentionEveryone: ok,
      canUseExternalEmoji: ok,
      canManageChannel: false,
      communicationTimeoutActive: false,
      communicationTimeoutUntil: null,
      communicationTimeoutUntilEpochMs: null,
    };
  }
  const [perms, timeoutState] = await Promise.all([
    getEffectiveChannelPermissions(pool, sid, userId, channelId),
    getUserCommunicationTimeoutState(pool, sid, userId),
  ]);
  const canViewChannel = perms.has('VIEW_CHANNEL');
  const timeoutAllowsCommunication = !timeoutState.active;
  const canSendMessages =
    canViewChannel && perms.has('SEND_MESSAGES') && timeoutAllowsCommunication;
  const forumContext =
    canSendMessages || perms.has('SEND_POLLS')
      ? await isEchoChannelWithinForumContext(pool, sid, channelId)
      : false;
  const forumPostAccess = await getForumPostCreatorAccess(pool, channelId);
  const creatorManage =
    forumPostAccess && forumCreatorCanManagePostFlags(forumPostAccess, userId);
  const canManageChannel =
    perms.has('MANAGE_CHANNELS') || creatorManage === true;
  return {
    canViewChannel,
    canSendMessages,
    canCreatePolls: !forumContext && canSendMessages && perms.has('SEND_POLLS'),
    canUploadFiles: canSendMessages && perms.has('ATTACH_FILES'),
    canMentionEveryone: canSendMessages && perms.has('MENTION_EVERYONE'),
    canUseExternalEmoji:
      canSendMessages &&
      (perms.has('USE_EXTERNAL_EMOJIS') ||
        perms.has('USE_EXTERNAL_STICKERS') ||
        perms.has('USE_EXPRESSIONS')),
    canManageChannel,
    communicationTimeoutActive: timeoutState.active,
    communicationTimeoutUntil: timeoutState.timeoutUntil,
    communicationTimeoutUntilEpochMs: timeoutState.timeoutUntilEpochMs,
  };
}

export async function isEchoChannelWithinForumContext(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<boolean> {
  const ch = await pool.query(
    `SELECT type, parent_channel_id
     FROM echo_channels
     WHERE id = $1 AND server_id = $2
     LIMIT 1`,
    [channelId, serverId],
  );
  const row = ch.rows[0] as
    | { type?: unknown; parent_channel_id?: unknown }
    | undefined;
  const type = typeof row?.type === 'string' ? row.type : '';
  if (type === 'forum') return true;

  const parentId =
    row?.parent_channel_id != null && String(row.parent_channel_id).trim()
      ? String(row.parent_channel_id)
      : null;
  if (!parentId) return false;

  const parent = await pool.query(
    `SELECT type
     FROM echo_channels
     WHERE id = $1 AND server_id = $2
     LIMIT 1`,
    [parentId, serverId],
  );
  const prow = parent.rows[0] as { type?: unknown } | undefined;
  const ptype = typeof prow?.type === 'string' ? prow.type : '';
  return ptype === 'forum';
}

/**
 * True when `userId` is the row-level owner (`echo_servers.owner_id`).
 * This is independent of roles: the creator is set as owner at insert time; `transferEchoServerOwnership` moves it.
 */
export async function isEchoServerOwner(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT owner_id FROM echo_servers WHERE id = $1`,
    [serverId],
  );
  const row = r.rows[0];
  return !!row && String(row.owner_id) === userId;
}

export type TransferEchoServerOwnershipResult =
  | 'ok'
  | 'not_found'
  | 'forbidden'
  | 'invalid_target'
  | 'target_banned';

/** Moves `echo_servers.owner_id` to `newOwnerId` (must be a non-banned member). Only the current owner may call. */
export async function transferEchoServerOwnership(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  newOwnerId: string,
): Promise<TransferEchoServerOwnershipResult> {
  if (newOwnerId === actorId) return 'invalid_target';
  const srv = await pool.query(
    `SELECT owner_id FROM echo_servers WHERE id = $1`,
    [serverId],
  );
  if (!srv.rows[0]) return 'not_found';
  if (String(srv.rows[0].owner_id) !== actorId) return 'forbidden';
  const mem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, newOwnerId],
  );
  if (mem.rows.length === 0) return 'invalid_target';
  if (await isUserBannedFromServer(pool, serverId, newOwnerId))
    return 'target_banned';
  await pool.query(`UPDATE echo_servers SET owner_id = $1 WHERE id = $2`, [
    newOwnerId,
    serverId,
  ]);
  invalidateEchoPermissionCacheForServer(serverId);
  return 'ok';
}

export type DeleteEchoServerByOwnerResult = 'ok' | 'not_found' | 'forbidden';

/** Permanently delete the server and all dependent rows (CASCADE). Only the row owner may delete. */
export async function deleteEchoServerByOwner(
  pool: pg.Pool,
  serverId: string,
  requesterId: string,
): Promise<DeleteEchoServerByOwnerResult> {
  if (!(await isEchoServerOwner(pool, serverId, requesterId))) {
    return 'forbidden';
  }
  const del = await pool.query(
    `DELETE FROM echo_servers WHERE id = $1 RETURNING id`,
    [serverId],
  );
  if (del.rowCount) {
    invalidateEchoPermissionCacheForServer(serverId);
  }
  return del.rowCount ? 'ok' : 'not_found';
}

/** Channel create: MANAGE_CHANNELS (+ member, not banned/timeout). Owner has all perms via getMergedRolePermissions. */
export async function canUserCreateEchoChannel(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const mem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  if (mem.rows.length === 0) return false;
  if (await isUserBannedFromServer(pool, serverId, userId)) return false;
  if (await isUserCommunicationTimedOut(pool, serverId, userId)) return false;
  const perms = await getMergedRolePermissions(pool, serverId, userId);
  return perms.has('MANAGE_CHANNELS');
}

/** Create invite links: member with CREATE_INSTANT_INVITE (default @everyone), not banned. */
export async function canUserCreateInvite(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const mem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  if (mem.rows.length === 0) return false;
  if (await isUserBannedFromServer(pool, serverId, userId)) return false;
  if (await isUserCommunicationTimedOut(pool, serverId, userId)) return false;
  const perms = await getMergedRolePermissions(pool, serverId, userId);
  return perms.has('CREATE_INSTANT_INVITE');
}

export async function removeEchoServerMember(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM echo_member_roles WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  await pool.query(
    `DELETE FROM echo_server_member_timeouts WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  await pool.query(
    `DELETE FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  await pool.query(
    `DELETE FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  invalidateEchoPermissionCacheForServer(serverId);
}

export async function getMemberTopRolePosition(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<number> {
  const r = await pool.query(
    `
    SELECT COALESCE(MAX(r.position), -1) AS p
    FROM echo_member_roles mr
    INNER JOIN echo_roles r ON r.id = mr.role_id AND r.server_id = mr.server_id
    WHERE mr.server_id = $1 AND mr.user_id = $2
    `,
    [serverId, userId],
  );
  return Number(r.rows[0]?.p ?? -1);
}

/** Owner bypass; else required permission + strictly higher top role than target. */
export async function canActorModerateTargetMember(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  targetUserId: string,
  permission: EchoPermission = 'MODERATE_MEMBERS',
): Promise<boolean> {
  if (await isEchoServerOwner(pool, serverId, actorId)) return true;
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!actorPerms.has(permission)) return false;
  if (await isEchoServerOwner(pool, serverId, targetUserId)) return false;
  const [ap, tp] = await Promise.all([
    getMemberTopRolePosition(pool, serverId, actorId),
    getMemberTopRolePosition(pool, serverId, targetUserId),
  ]);
  return ap > tp;
}

const MAX_ECHO_MEMBER_NICKNAME_LEN = 32;

/** Owner bypass; self: CHANGE_NICKNAME or MANAGE_NICKNAMES; others: MANAGE_NICKNAMES + role above target (not owner). */
export async function canActorSetTargetNickname(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  targetUserId: string,
): Promise<boolean> {
  const mem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, targetUserId],
  );
  if (mem.rows.length === 0) return false;
  if (await isUserCommunicationTimedOut(pool, serverId, actorId)) return false;
  if (await isEchoServerOwner(pool, serverId, actorId)) return true;
  if (actorId === targetUserId) {
    const p = await getMergedRolePermissions(pool, serverId, actorId);
    return p.has('CHANGE_NICKNAME') || p.has('MANAGE_NICKNAMES');
  }
  const p = await getMergedRolePermissions(pool, serverId, actorId);
  if (!p.has('MANAGE_NICKNAMES')) return false;
  if (await isEchoServerOwner(pool, serverId, targetUserId)) return false;
  const [ap, tp] = await Promise.all([
    getMemberTopRolePosition(pool, serverId, actorId),
    getMemberTopRolePosition(pool, serverId, targetUserId),
  ]);
  return ap > tp;
}

export type SetEchoMemberNicknameResult =
  | 'ok'
  | 'forbidden'
  | 'not_member'
  | 'invalid';

export async function setEchoMemberNickname(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  targetUserId: string,
  nicknameRaw: string,
): Promise<SetEchoMemberNicknameResult> {
  const trimmed = typeof nicknameRaw === 'string' ? nicknameRaw.trim() : '';
  if (trimmed.length > MAX_ECHO_MEMBER_NICKNAME_LEN) return 'invalid';
  const allowed = await canActorSetTargetNickname(
    pool,
    serverId,
    actorId,
    targetUserId,
  );
  if (!allowed) return 'forbidden';
  const mem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, targetUserId],
  );
  if (mem.rows.length === 0) return 'not_member';
  await pool.query(
    `UPDATE echo_server_members SET nickname = $3 WHERE server_id = $1 AND user_id = $2`,
    [serverId, targetUserId, trimmed],
  );
  return 'ok';
}
