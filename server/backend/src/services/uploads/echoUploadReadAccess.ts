import type { FastifyRequest } from 'fastify';
import {
  canUserAccessChannel,
  isMemberOfServer,
} from '../../domain/permissions/echoPermissions';
import { getMergedRolePermissions } from '../../domain/echoStore/roles/permissions';
import { echoUsersShareAnyServer } from '../../domain/echoStore/social/social';
import { listEchoMessageChannelIdsReferencingStorageKey } from '../../domain/echoMessagesDal';
import { getPgPool } from '../../db/pg';
import { parseVcWatchTogetherStorageKey } from '../../../../../contracts/echoUploadStorageKey';
import { getEchoUploadIntent } from './echoUploadIntent';
import { VC_WATCH_TOGETHER_CHANNEL_HOST_STALE_MS } from '../watchTogether/vcWatchTogetherChannelHost';

async function canReadViaUploadIntentChannel(
  pool: NonNullable<ReturnType<typeof getPgPool>>,
  userId: string,
  storageKey: string,
): Promise<boolean> {
  const intent = await getEchoUploadIntent(pool, storageKey);
  const channelId = intent?.channel_id?.trim();
  if (!channelId) return false;
  return canUserAccessChannel(pool, userId, channelId);
}

/**
 * Historical legacy keys may lack upload-intent rows. Allow read only when a
 * message in a channel the user can access references the storage key.
 */
async function canReadLegacyUploadViaMessageReference(
  pool: NonNullable<ReturnType<typeof getPgPool>>,
  userId: string,
  serverId: string,
  storageKey: string,
): Promise<boolean> {
  const channelIds = await listEchoMessageChannelIdsReferencingStorageKey(
    pool,
    serverId,
    storageKey,
  );
  for (const channelId of channelIds) {
    if (await canUserAccessChannel(pool, userId, channelId)) return true;
  }
  return false;
}

/** True when the reader can access a channel where `ownerUserId` is actively hosting WT. */
async function canReadVcWatchTogetherAsSessionViewer(
  pool: NonNullable<ReturnType<typeof getPgPool>>,
  userId: string,
  ownerUserId: string,
): Promise<boolean> {
  const staleMs = VC_WATCH_TOGETHER_CHANNEL_HOST_STALE_MS;
  const r = await pool.query<{ channel_id: string }>(
    `SELECT channel_id
     FROM echo_vc_watch_together_channel_hosts
     WHERE host_user_id = $1
       AND updated_at >= NOW() - ($2::bigint * INTERVAL '1 millisecond')`,
    [ownerUserId, staleMs],
  );
  for (const row of r.rows) {
    const channelId = row.channel_id?.trim();
    if (!channelId) continue;
    if (await canUserAccessChannel(pool, userId, channelId)) return true;
  }
  return false;
}

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
    // Global library: only active Watch Together session viewers (channel ACL),
    // not arbitrary co-members of any shared guild.
    return canReadVcWatchTogetherAsSessionViewer(
      pool,
      userId,
      parsed.ownerUserId,
    );
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
  if (
    key.startsWith('echo/server-icons/') ||
    key.startsWith('echo/server-banners/')
  ) {
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
  if (key.startsWith('echo/webhook-inbound/')) {
    const parts = key.split('/');
    const channelId = parts[3]?.trim();
    if (!channelId) return false;
    return canUserAccessChannel(pool, userId, channelId);
  }
  // Legacy guild chat layout: echo/{serverId}/{uploaderId}/…
  // Must not grant every server member access (private-channel bypass).
  if (key.startsWith('echo/')) {
    const parts = key.split('/');
    const serverId = parts[1]?.trim();
    const ownerId = parts[2]?.trim();
    if (!serverId || !ownerId) return false;
    if (!(await isMemberOfServer(pool, serverId, userId))) return false;
    if (ownerId === userId) return true;
    if (await canReadViaUploadIntentChannel(pool, userId, key)) return true;
    return canReadLegacyUploadViaMessageReference(pool, userId, serverId, key);
  }
  return false;
}
