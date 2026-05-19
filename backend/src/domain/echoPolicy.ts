import type pg from 'pg';
import {
  getMergedRolePermissions,
  getEffectiveChannelPermissions,
  isEchoServerOwner,
  type EchoPermission,
} from './echoStore';
import {
  forumCreatorCanModerateMessagesInOwnPost,
  getForumPostCreatorAccess,
} from './echoStore/forumCreatorAccess';

export type { EchoPermission } from './echoStore';

/**
 * Central policy: role-derived permissions + owner bypass.
 * Fundamental server owner is `echo_servers.owner_id` (not a role); see `transferEchoServerOwnership` in echoStore.
 * REST and Socket.IO should use this for moderation and extended RBAC checks.
 */
export async function hasServerPermission(
  pool: pg.Pool,
  userId: string,
  serverId: string,
  permission: EchoPermission,
): Promise<boolean> {
  const perms = await getMergedRolePermissions(pool, serverId, userId);
  return perms.has(permission);
}

export async function canModerateServer(
  pool: pg.Pool,
  userId: string,
  serverId: string,
): Promise<boolean> {
  if (await isEchoServerOwner(pool, serverId, userId)) return true;
  return hasServerPermission(pool, userId, serverId, 'MODERATE_MEMBERS');
}

/**
 * Delete another member’s message in a channel: moderators / MANAGE_MESSAGES, or forum post
 * creator when the parent forum grants `moderateMessagesInOwnPost`.
 */
export async function canDeleteOthersMessagesInChannel(
  pool: pg.Pool,
  userId: string,
  serverId: string,
  channelId: string,
): Promise<boolean> {
  if (await isEchoServerOwner(pool, serverId, userId)) return true;

  const perms = await getEffectiveChannelPermissions(
    pool,
    serverId,
    userId,
    channelId,
  );
  if (perms.has('MANAGE_MESSAGES') || perms.has('MODERATE_MEMBERS'))
    return true;

  const acc = await getForumPostCreatorAccess(pool, channelId);
  if (acc && acc.serverId === serverId) {
    return forumCreatorCanModerateMessagesInOwnPost(acc, userId);
  }

  return false;
}
