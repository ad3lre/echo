import type { FastifyRequest } from 'fastify';
import {
  canUserAccessChannel,
  isMemberOfServer,
} from '../domain/echoPermissions';
import { getMergedRolePermissions } from '../domain/echoStore/permissions';
import { echoUsersShareAnyServer } from '../domain/echoStore/social';
import { getPgPool } from '../db/pg';
import { parseVcWatchTogetherStorageKey } from '../../../shared/echoUploadStorageKey';

export async function canUserReadLocalUploadStorageKey(
  req: FastifyRequest,
  storageKey: string,
): Promise<boolean> {
  const key = storageKey.trim();
  if (!key) return false;
  const userId = req.authUser?.id?.trim();
  if (!userId) return false;
  const pool = getPgPool();
  if (!pool) return false;
  if (key.startsWith('echo/channels/')) {
    const parts = key.split('/');
    const channelId = parts[2]?.trim();
    if (!channelId) return false;
    return canUserAccessChannel(pool, userId, channelId);
  }
  if (key.startsWith('echo/vc-watch/')) {
    const parsed = parseVcWatchTogetherStorageKey(key);
    if (!parsed) return false;
    if (parsed.ownerUserId === userId) return true;
    if (parsed.kind === 'legacy') {
      if (await canUserAccessChannel(pool, userId, parsed.channelId)) {
        return true;
      }
    }
    return echoUsersShareAnyServer(pool, userId, parsed.ownerUserId);
  }
  if (key.startsWith('echo/bug-reports/')) {
    const parts = key.split('/');
    const ownerId = parts[2]?.trim();
    return ownerId === userId;
  }
  if (key.startsWith('echo/ringtones/')) {
    const parts = key.split('/');
    const ownerId = parts[2]?.trim();
    return ownerId === userId;
  }
  if (key.startsWith('echo/avatars/') || key.startsWith('echo/banners/')) {
    const parts = key.split('/');
    const ownerId = parts[2]?.trim();
    if (!ownerId) return false;
    if (ownerId === userId) return true;
    return echoUsersShareAnyServer(pool, userId, ownerId);
  }
  if (key.startsWith('echo/emoji/')) {
    const parts = key.split('/');
    const serverId = parts[2]?.trim();
    if (!serverId) return false;
    return isMemberOfServer(pool, serverId, userId);
  }
  if (key.startsWith('echo/server-event-covers/')) {
    const parts = key.split('/');
    const serverId = parts[2]?.trim();
    if (!serverId) return false;
    return isMemberOfServer(pool, serverId, userId);
  }
  if (key.startsWith('echo/server-application-attachments/')) {
    const parts = key.split('/');
    const serverId = parts[2]?.trim();
    const applicantUserId = parts[3]?.trim();
    if (!serverId || !applicantUserId) return false;
    if (userId === applicantUserId) return true;
    if (!(await isMemberOfServer(pool, serverId, userId))) return false;
    const perms = await getMergedRolePermissions(pool, serverId, userId);
    return perms.has('MANAGE_GUILD');
  }
  if (key.startsWith('echo/')) {
    const parts = key.split('/');
    const serverId = parts[1]?.trim();
    if (!serverId) return false;
    return isMemberOfServer(pool, serverId, userId);
  }
  return false;
}
