import type pg from 'pg';
import {
  normalizeForumCreatorDefaultPerms,
  FORUM_CREATOR_DEFAULT_PERMS_FALLBACK,
} from '../../../../../../contracts/types/forumCreator';

export type ForumPostCreatorAccess = {
  serverId: string;
  parentForumChannelId: string;
  creatorUserId: string | null;
  defaults: typeof FORUM_CREATOR_DEFAULT_PERMS_FALLBACK;
};

/**
 * Resolve forum-post row + parent forum creator defaults (for permission checks).
 * Returns null when `postChannelId` is not a text channel under a forum parent.
 */
export async function getForumPostCreatorAccess(
  pool: pg.Pool,
  postChannelId: string,
): Promise<ForumPostCreatorAccess | null> {
  const r = await pool.query(
    `
    SELECT
      ch.server_id AS server_id,
      ch.parent_channel_id AS parent_id,
      ch.type AS ch_type,
      ch.forum_post_creator_user_id AS creator_id,
      p.type AS parent_type,
      p.forum_creator_default_perms AS forum_defaults
    FROM echo_channels ch
    JOIN echo_channels p ON p.id = ch.parent_channel_id AND p.server_id = ch.server_id
    WHERE ch.id = $1
    LIMIT 1
    `,
    [postChannelId],
  );
  const row = r.rows[0] as
    | {
        server_id?: unknown;
        parent_id?: unknown;
        ch_type?: unknown;
        creator_id?: unknown;
        parent_type?: unknown;
        forum_defaults?: unknown;
      }
    | undefined;
  if (!row) return null;
  if (String(row.ch_type) !== 'text') return null;
  if (String(row.parent_type) !== 'forum') return null;
  const parentId =
    row.parent_id != null && String(row.parent_id).trim()
      ? String(row.parent_id)
      : '';
  if (!parentId) return null;
  const creator =
    row.creator_id != null && String(row.creator_id).trim()
      ? String(row.creator_id)
      : null;
  return {
    serverId: String(row.server_id),
    parentForumChannelId: parentId,
    creatorUserId: creator,
    defaults: normalizeForumCreatorDefaultPerms(row.forum_defaults),
  };
}

export function forumActorIsPostCreator(
  access: ForumPostCreatorAccess,
  userId: string,
): boolean {
  return !!access.creatorUserId && access.creatorUserId === userId;
}

export function forumCreatorCanManagePostFlags(
  access: ForumPostCreatorAccess,
  userId: string,
): boolean {
  return (
    forumActorIsPostCreator(access, userId) && access.defaults.managePostFlags
  );
}

export function forumCreatorCanDeleteOwnPost(
  access: ForumPostCreatorAccess,
  userId: string,
): boolean {
  return (
    forumActorIsPostCreator(access, userId) && access.defaults.deleteOwnPost
  );
}

export function forumCreatorCanModerateMessagesInOwnPost(
  access: ForumPostCreatorAccess,
  userId: string,
): boolean {
  return (
    forumActorIsPostCreator(access, userId) &&
    access.defaults.moderateMessagesInOwnPost
  );
}

/**
 * Workspace bootstrap: set `canManageChannel` when the viewer created the forum post
 * and the parent forum grants `managePostFlags`.
 */
export async function applyForumCreatorManageChannelBoost(
  pool: pg.Pool,
  serverId: string,
  viewerUserId: string,
  channelMap: Map<string, Record<string, unknown>>,
): Promise<void> {
  const ids = [...channelMap.keys()];
  if (ids.length === 0) return;
  const r = await pool.query(
    `
    SELECT ch.id AS ch_id, ch.forum_post_creator_user_id AS creator_id,
           p.forum_creator_default_perms AS forum_defaults
    FROM echo_channels ch
    INNER JOIN echo_channels p
      ON p.id = ch.parent_channel_id AND p.server_id = ch.server_id AND p.type = 'forum'
    WHERE ch.server_id = $1
      AND ch.id = ANY($2::text[])
      AND ch.type = 'text'
    `,
    [serverId, ids],
  );
  for (const row of r.rows as Array<{
    ch_id?: unknown;
    creator_id?: unknown;
    forum_defaults?: unknown;
  }>) {
    const id = row.ch_id != null ? String(row.ch_id) : '';
    const creator =
      row.creator_id != null && String(row.creator_id).trim()
        ? String(row.creator_id)
        : null;
    if (!id || !creator || creator !== viewerUserId) continue;
    const d = normalizeForumCreatorDefaultPerms(row.forum_defaults);
    if (!d.managePostFlags) continue;
    const ch = channelMap.get(id);
    if (ch) ch.canManageChannel = true;
  }
}
