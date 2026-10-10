import type pg from 'pg';
import {
  normalizeEchoReportCategory,
  type EchoReportCategory,
} from '../../../../../../contracts/safetyReports';
import { selectEchoMessageSafetySnapshotByChannel } from '../../echoMessagesDal';
import {
  canUserAccessChannel,
  getEchoChannelServerId,
} from '../members/access';
import { nextEchoSnowflakeId } from '../../echoSnowflake';

const MAX_REASON = 2000;
const MAX_CONTENT_SNAPSHOT = 4000;
export type EchoSafetyReportInsertResult =
  | { inserted: true; id: string }
  | { inserted: false; duplicate: true };

export type EchoUserReportInput = {
  targetId: string;
  reason: string;
  category?: string;
  messageId?: string;
  channelId?: string;
  serverId?: string | null;
};

export type EchoMessageReportInput = {
  messageId: string;
  channelId: string;
  reason: string;
  category?: string;
};

function trimReason(reason: string): string {
  const trimmed = reason.trim().slice(0, MAX_REASON);
  return trimmed || '(no details)';
}

function normalizeCategory(category?: string): EchoReportCategory {
  return normalizeEchoReportCategory(category);
}

async function reserveReportCooldown(
  client: pg.PoolClient,
  reportKind: 'user' | 'message',
  reporterId: string,
  targetKey: string,
): Promise<boolean> {
  const r = await client.query(
    `INSERT INTO echo_safety_report_cooldowns
       (report_kind, reporter_id, target_key, last_reported_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (report_kind, reporter_id, target_key) DO UPDATE
       SET last_reported_at = NOW()
       WHERE echo_safety_report_cooldowns.last_reported_at <= NOW() - INTERVAL '24 hours'
     RETURNING target_key`,
    [reportKind, reporterId, targetKey],
  );
  return (r.rowCount ?? 0) > 0;
}

function buildContentSnapshot(row: {
  content: string | null;
  searchIndexText: string | null;
}): string {
  const search = row.searchIndexText?.trim() ?? '';
  const content = row.content?.trim() ?? '';
  const combined = search || content || '(empty message)';
  return combined.slice(0, MAX_CONTENT_SNAPSHOT);
}

function buildAttachmentsSnapshot(attachments: unknown): unknown {
  if (!Array.isArray(attachments)) return [];
  const out: { url?: string; contentType?: string; filename?: string }[] = [];
  for (const item of attachments) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const url = typeof o.url === 'string' ? o.url.slice(0, 512) : undefined;
    const contentType =
      typeof o.contentType === 'string'
        ? o.contentType.slice(0, 128)
        : undefined;
    const filename =
      typeof o.filename === 'string' ? o.filename.slice(0, 256) : undefined;
    if (url || contentType || filename) {
      out.push({
        ...(url ? { url } : {}),
        ...(contentType ? { contentType } : {}),
        ...(filename ? { filename } : {}),
      });
    }
    if (out.length >= 20) break;
  }
  return out;
}

export async function insertEchoUserReport(
  pool: pg.Pool,
  reporterId: string,
  input: EchoUserReportInput,
): Promise<EchoSafetyReportInsertResult> {
  const targetId = input.targetId.trim();
  if (!targetId || reporterId === targetId) {
    return { inserted: false, duplicate: true };
  }
  const id = nextEchoSnowflakeId();
  const category = normalizeCategory(input.category);
  const reason = trimReason(input.reason);
  const messageId =
    typeof input.messageId === 'string' && input.messageId.trim()
      ? input.messageId.trim()
      : null;
  const channelId =
    typeof input.channelId === 'string' && input.channelId.trim()
      ? input.channelId.trim()
      : null;
  const serverId =
    input.serverId === null
      ? null
      : typeof input.serverId === 'string' && input.serverId.trim()
        ? input.serverId.trim()
        : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await reserveReportCooldown(client, 'user', reporterId, targetId))) {
      await client.query('ROLLBACK');
      return { inserted: false, duplicate: true };
    }
    await client.query(
      `
    INSERT INTO echo_user_reports (
      id, reporter_id, target_id, reason, category, message_id, channel_id, server_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        id,
        reporterId,
        targetId,
        reason,
        category,
        messageId,
        channelId,
        serverId,
      ],
    );
    await client.query('COMMIT');
    return { inserted: true, id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type InsertEchoMessageReportResult =
  | EchoSafetyReportInsertResult
  | { inserted: false; error: 'not_found' | 'forbidden' | 'self_report' };

export async function insertEchoMessageReport(
  pool: pg.Pool,
  reporterId: string,
  input: EchoMessageReportInput,
): Promise<InsertEchoMessageReportResult> {
  const messageId = input.messageId.trim();
  const channelId = input.channelId.trim();
  if (!messageId || !channelId) {
    return { inserted: false, error: 'not_found' };
  }
  if (!(await canUserAccessChannel(pool, reporterId, channelId))) {
    return { inserted: false, error: 'forbidden' };
  }
  const row = await selectEchoMessageSafetySnapshotByChannel(
    pool,
    channelId,
    messageId,
  );
  if (!row) {
    return { inserted: false, error: 'not_found' };
  }
  const authorId = row.authorId;
  if (authorId === reporterId) {
    return { inserted: false, error: 'self_report' };
  }
  const serverId = await getEchoChannelServerId(pool, channelId);
  const id = nextEchoSnowflakeId();
  const category = normalizeCategory(input.category);
  const reason = trimReason(input.reason);
  const contentSnapshot = buildContentSnapshot(row);
  const attachmentsSnapshot = buildAttachmentsSnapshot(row.attachments);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (
      !(await reserveReportCooldown(client, 'message', reporterId, messageId))
    ) {
      await client.query('ROLLBACK');
      return { inserted: false, duplicate: true };
    }
    await client.query(
      `
    INSERT INTO echo_message_reports (
      id, reporter_id, message_id, channel_id, server_id, author_id,
      category, reason, content_snapshot, attachments_snapshot
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      `,
      [
        id,
        reporterId,
        messageId,
        channelId,
        serverId,
        authorId,
        category,
        reason,
        contentSnapshot,
        JSON.stringify(attachmentsSnapshot),
      ],
    );
    await client.query('COMMIT');
    return { inserted: true, id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
