import type pg from 'pg';
import {
  normalizeEchoReportCategory,
  type EchoReportCategory,
} from '../../../../shared/safetyReports';
import { selectEchoMessageSafetySnapshotByChannel } from '../echoMessagesDal';
import { canUserAccessChannel, getEchoChannelServerId } from './access';
import { nextEchoSnowflakeId } from '../echoSnowflake';

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

async function hasRecentUserReport(
  pool: pg.Pool,
  reporterId: string,
  targetId: string,
): Promise<boolean> {
  const r = await pool.query(
    `
    SELECT 1 FROM echo_user_reports
    WHERE reporter_id = $1 AND target_id = $2
      AND created_at > NOW() - INTERVAL '24 hours'
    LIMIT 1
    `,
    [reporterId, targetId],
  );
  return r.rows.length > 0;
}

async function hasRecentMessageReport(
  pool: pg.Pool,
  reporterId: string,
  messageId: string,
): Promise<boolean> {
  const r = await pool.query(
    `
    SELECT 1 FROM echo_message_reports
    WHERE reporter_id = $1 AND message_id = $2
      AND created_at > NOW() - INTERVAL '24 hours'
    LIMIT 1
    `,
    [reporterId, messageId],
  );
  return r.rows.length > 0;
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
  if (await hasRecentUserReport(pool, reporterId, targetId)) {
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

  await pool.query(
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
  return { inserted: true, id };
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
  if (await hasRecentMessageReport(pool, reporterId, messageId)) {
    return { inserted: false, duplicate: true };
  }

  const serverId = await getEchoChannelServerId(pool, channelId);
  const id = nextEchoSnowflakeId();
  const category = normalizeCategory(input.category);
  const reason = trimReason(input.reason);
  const contentSnapshot = buildContentSnapshot(row);
  const attachmentsSnapshot = buildAttachmentsSnapshot(row.attachments);

  await pool.query(
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
  return { inserted: true, id };
}
