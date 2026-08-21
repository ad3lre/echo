import type pg from 'pg';
import { CHANNEL_WEBHOOKS_ENABLED } from '../../../../../contracts/integrationKillSwitches';
import { isMemberOfServer } from '../../domain/permissions/echoPermissions';
import {
  getEchoChannelServerIdAndType,
  isEchoChannelWebhookSupportedType,
} from '../../domain/echoChannelWebhooksRepo';
import {
  getEffectiveChannelPermissions,
  isEchoServerOwner,
} from '../../domain/echoStore';

export async function assertUserCanManageEchoChannelWebhooks(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!CHANNEL_WEBHOOKS_ENABLED) {
    return {
      ok: false,
      status: 503,
      message: 'Channel webhooks are temporarily disabled.',
    };
  }
  const okMem = await isMemberOfServer(pool, serverId, userId);
  if (!okMem) {
    return { ok: false, status: 403, message: 'NOT_SERVER_MEMBER' };
  }
  const meta = await getEchoChannelServerIdAndType(pool, channelId);
  if (!meta || meta.serverId !== serverId) {
    return { ok: false, status: 404, message: 'Channel not found.' };
  }
  if (!isEchoChannelWebhookSupportedType(meta.type)) {
    return {
      ok: false,
      status: 400,
      message: 'Webhooks are only available on text and forum channels.',
    };
  }

  if (await isEchoServerOwner(pool, serverId, userId)) {
    return { ok: true };
  }

  const perms = await getEffectiveChannelPermissions(
    pool,
    serverId,
    userId,
    channelId,
  );
  if (
    perms.has('MANAGE_WEBHOOKS') ||
    perms.has('MANAGE_GUILD') ||
    perms.has('ADMINISTRATOR')
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    status: 403,
    message: 'Manage webhooks permission required.',
  };
}
