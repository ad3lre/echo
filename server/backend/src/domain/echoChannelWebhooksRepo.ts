import { createHash, randomBytes } from 'crypto';
import type pg from 'pg';
import { config } from '../config';
import { safeCompare } from '../shared/safeCompare';
import { nextEchoSnowflakeId } from './echoSnowflake';

export type EchoChannelWebhookRow = {
  id: string;
  serverId: string;
  channelId: string;
  name: string;
  avatarUrl: string | null;
  tokenHash: string;
  createdByUserId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export type EchoChannelWebhookPublic = Omit<EchoChannelWebhookRow, 'tokenHash'>;

export function hashEchoChannelWebhookTokenPlain(token: string): string {
  const pepper =
    config.echoChannelWebhookTokenPepper.trim() || config.jwtSecret;
  return createHash('sha256')
    .update(pepper, 'utf8')
    .update('\0', 'utf8')
    .update(token, 'utf8')
    .digest('hex');
}

export function verifyEchoChannelWebhookToken(
  presentedToken: string,
  storedTokenHash: string,
): boolean {
  const h = hashEchoChannelWebhookTokenPlain(presentedToken);
  return safeCompare(h, storedTokenHash);
}

function rowFromDb(r: Record<string, unknown>): EchoChannelWebhookRow {
  return {
    id: String(r.id),
    serverId: String(r.server_id),
    channelId: String(r.channel_id),
    name: String(r.name ?? 'Webhook'),
    avatarUrl:
      r.avatar_url != null && String(r.avatar_url).trim()
        ? String(r.avatar_url).trim()
        : null,
    tokenHash: String(r.token_hash),
    createdByUserId:
      r.created_by_user_id != null && String(r.created_by_user_id).trim()
        ? String(r.created_by_user_id).trim()
        : null,
    createdAt: new Date(r.created_at as string | Date).toISOString(),
    lastUsedAt:
      r.last_used_at != null
        ? new Date(r.last_used_at as string | Date).toISOString()
        : null,
  };
}

export async function getEchoChannelServerIdAndType(
  pool: pg.Pool,
  channelId: string,
): Promise<{ serverId: string; type: string } | null> {
  const q = await pool.query(
    `SELECT server_id, type FROM echo_channels WHERE id = $1 LIMIT 1`,
    [channelId],
  );
  if (!q.rows.length) return null;
  const row = q.rows[0] as { server_id: unknown; type: unknown };
  return {
    serverId: String(row.server_id),
    type: String(row.type ?? 'text'),
  };
}

export function isEchoChannelWebhookSupportedType(type: string): boolean {
  return type === 'text' || type === 'forum';
}

export async function listEchoChannelWebhooks(
  pool: pg.Pool,
  channelId: string,
): Promise<EchoChannelWebhookPublic[]> {
  const q = await pool.query(
    `
    SELECT id, server_id, channel_id, name, avatar_url, created_by_user_id, created_at, last_used_at
    FROM echo_channel_webhooks
    WHERE channel_id = $1
    ORDER BY created_at DESC
    `,
    [channelId],
  );
  return q.rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id),
      serverId: String(r.server_id),
      channelId: String(r.channel_id),
      name: String(r.name ?? 'Webhook'),
      avatarUrl:
        r.avatar_url != null && String(r.avatar_url).trim()
          ? String(r.avatar_url).trim()
          : null,
      createdByUserId:
        r.created_by_user_id != null && String(r.created_by_user_id).trim()
          ? String(r.created_by_user_id).trim()
          : null,
      createdAt: new Date(r.created_at as string | Date).toISOString(),
      lastUsedAt:
        r.last_used_at != null
          ? new Date(r.last_used_at as string | Date).toISOString()
          : null,
    };
  });
}

export async function getEchoChannelWebhookById(
  pool: pg.Pool,
  webhookId: string,
): Promise<EchoChannelWebhookRow | null> {
  const q = await pool.query(
    `SELECT * FROM echo_channel_webhooks WHERE id = $1 LIMIT 1`,
    [webhookId.trim()],
  );
  if (!q.rows.length) return null;
  return rowFromDb(q.rows[0] as Record<string, unknown>);
}

export async function createEchoChannelWebhook(
  pool: pg.Pool,
  opts: {
    serverId: string;
    channelId: string;
    name: string;
    avatarUrl?: string | null;
    createdByUserId: string;
  },
): Promise<{ row: EchoChannelWebhookRow; plaintextToken: string }> {
  const id = nextEchoSnowflakeId();
  const plaintextToken = randomBytes(32).toString('base64url');
  const tokenHash = hashEchoChannelWebhookTokenPlain(plaintextToken);
  const name = opts.name.trim().slice(0, 80) || 'Webhook';
  const avatarUrl =
    typeof opts.avatarUrl === 'string' && opts.avatarUrl.trim()
      ? opts.avatarUrl.trim().slice(0, 2048)
      : null;
  await pool.query(
    `
    INSERT INTO echo_channel_webhooks (
      id, server_id, channel_id, name, avatar_url, token_hash, created_by_user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      id,
      opts.serverId,
      opts.channelId,
      name,
      avatarUrl,
      tokenHash,
      opts.createdByUserId,
    ],
  );
  const row = await getEchoChannelWebhookById(pool, id);
  if (!row) throw new Error('echo_channel_webhooks insert failed');
  return { row, plaintextToken };
}

export async function deleteEchoChannelWebhook(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  webhookId: string,
): Promise<boolean> {
  const q = await pool.query(
    `
    DELETE FROM echo_channel_webhooks
    WHERE id = $1 AND server_id = $2 AND channel_id = $3
    RETURNING id
    `,
    [webhookId.trim(), serverId, channelId],
  );
  return q.rows.length > 0;
}

export async function regenerateEchoChannelWebhookToken(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  webhookId: string,
): Promise<{ plaintextToken: string } | null> {
  const plaintextToken = randomBytes(32).toString('base64url');
  const tokenHash = hashEchoChannelWebhookTokenPlain(plaintextToken);
  const q = await pool.query(
    `
    UPDATE echo_channel_webhooks
    SET token_hash = $1
    WHERE id = $2 AND server_id = $3 AND channel_id = $4
    RETURNING id
    `,
    [tokenHash, webhookId.trim(), serverId, channelId],
  );
  if (!q.rows.length) return null;
  return { plaintextToken };
}

export async function touchEchoChannelWebhookLastUsed(
  pool: pg.Pool,
  webhookId: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_channel_webhooks SET last_used_at = NOW() WHERE id = $1`,
    [webhookId],
  );
}

export async function getEchoChannelWebhookPublicByIdAndToken(
  pool: pg.Pool,
  webhookId: string,
  plaintextToken: string,
): Promise<EchoChannelWebhookPublic | null> {
  const row = await getEchoChannelWebhookById(pool, webhookId);
  if (!row || !verifyEchoChannelWebhookToken(plaintextToken, row.tokenHash)) {
    return null;
  }
  return {
    id: row.id,
    serverId: row.serverId,
    channelId: row.channelId,
    name: row.name,
    avatarUrl: row.avatarUrl,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export async function updateEchoChannelWebhookByToken(
  pool: pg.Pool,
  webhookId: string,
  plaintextToken: string,
  patch: { name?: string; avatarUrl?: string | null },
): Promise<EchoChannelWebhookPublic | null> {
  const row = await getEchoChannelWebhookById(pool, webhookId);
  if (!row || !verifyEchoChannelWebhookToken(plaintextToken, row.tokenHash)) {
    return null;
  }
  const name =
    typeof patch.name === 'string' && patch.name.trim()
      ? patch.name.trim().slice(0, 80)
      : undefined;
  let avatarUrl: string | null | undefined;
  if (patch.avatarUrl === null) avatarUrl = null;
  else if (typeof patch.avatarUrl === 'string' && patch.avatarUrl.trim()) {
    avatarUrl = patch.avatarUrl.trim().slice(0, 2048);
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  let p = 1;
  if (name !== undefined) {
    sets.push(`name = $${p++}`);
    vals.push(name);
  }
  if (avatarUrl !== undefined) {
    sets.push(`avatar_url = $${p++}`);
    vals.push(avatarUrl);
  }
  if (sets.length > 0) {
    vals.push(row.id);
    await pool.query(
      `UPDATE echo_channel_webhooks SET ${sets.join(', ')} WHERE id = $${p}`,
      vals,
    );
  }
  const next = await getEchoChannelWebhookById(pool, webhookId);
  if (!next) return null;
  return {
    id: next.id,
    serverId: next.serverId,
    channelId: next.channelId,
    name: next.name,
    avatarUrl: next.avatarUrl,
    createdByUserId: next.createdByUserId,
    createdAt: next.createdAt,
    lastUsedAt: next.lastUsedAt,
  };
}

export function buildEchoChannelWebhookExecuteUrl(
  webhookId: string,
  plaintextToken: string,
): string {
  const base = config.echoApiPublicUrl.replace(/\/$/, '');
  const wid = encodeURIComponent(webhookId);
  const tok = encodeURIComponent(plaintextToken);
  return `${base}/api/v1/hooks/echo-channel-webhooks/${wid}/${tok}`;
}
