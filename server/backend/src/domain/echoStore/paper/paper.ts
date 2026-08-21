import type pg from 'pg';
import { ECHO_CONTENT_SCHEMA_VERSION } from '../../../../../../contracts/echoMessageFormatV2';
import {
  applyPaperAttributionStamp,
  EMPTY_PAPER_DOC,
  stripPaperAttributionFromDoc,
} from '../../paperAttribution';
import { validatePaperContentJsonForWrite } from '../../contentJsonValidation';
import { getEchoChannelType } from '../voice/voice';
import {
  diagnoseEchoChannelAccess,
  getEchoChannelServerId,
  getPaperCapabilitiesForUser,
} from '../members/access';

export type EchoPaperDocumentRow = {
  channelId: string;
  contentJson: Record<string, unknown>;
  contentSchemaVersion: number;
  revision: number;
  updatedAt: Date;
  updatedByUserId: string | null;
};

export async function getEchoPaperChannelSettings(
  pool: pg.Pool,
  channelId: string,
): Promise<{
  paperCommentsEnabled: boolean;
  paperShowAuthorGutter: boolean;
} | null> {
  const r = await pool.query(
    `SELECT paper_comments_enabled, paper_show_author_gutter
     FROM echo_channels WHERE id = $1 LIMIT 1`,
    [channelId],
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    paperCommentsEnabled: row.paper_comments_enabled !== false,
    paperShowAuthorGutter: row.paper_show_author_gutter !== false,
  };
}

export async function getEchoPaperDocument(
  pool: pg.Pool,
  channelId: string,
): Promise<EchoPaperDocumentRow | null> {
  const r = await pool.query(
    `SELECT channel_id, content_json, content_schema_version, revision,
            updated_at, updated_by_user_id
     FROM echo_paper_documents WHERE channel_id = $1`,
    [channelId],
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    channelId: String(row.channel_id),
    contentJson: row.content_json as Record<string, unknown>,
    contentSchemaVersion: Number(row.content_schema_version ?? 1),
    revision: Number(row.revision ?? 1),
    updatedAt: new Date(String(row.updated_at)),
    updatedByUserId:
      row.updated_by_user_id != null ? String(row.updated_by_user_id) : null,
  };
}

export async function bootstrapEchoPaperDocument(
  pool: pg.Pool,
  channelId: string,
  authorUserId: string | null,
): Promise<void> {
  const doc =
    authorUserId != null
      ? applyPaperAttributionStamp(null, EMPTY_PAPER_DOC, authorUserId)
      : EMPTY_PAPER_DOC;
  await pool.query(
    `INSERT INTO echo_paper_documents (
       channel_id, content_json, content_schema_version, revision, updated_by_user_id
     ) VALUES ($1, $2::jsonb, $3, 1, $4)
     ON CONFLICT (channel_id) DO NOTHING`,
    [channelId, JSON.stringify(doc), ECHO_CONTENT_SCHEMA_VERSION, authorUserId],
  );
}

export type PatchEchoPaperDocumentResult =
  | { ok: true; row: EchoPaperDocumentRow }
  | {
      ok: false;
      error: 'not_found' | 'not_paper' | 'forbidden' | 'validation';
      message: string;
    }
  | {
      ok: false;
      error: 'conflict';
      expectedRevision: number;
      actualRevision: number;
    };

export async function patchEchoPaperDocument(
  pool: pg.Pool,
  channelId: string,
  userId: string,
  contentJson: unknown,
  expectedRevision: number,
): Promise<PatchEchoPaperDocumentResult> {
  const sid = await getEchoChannelServerId(pool, channelId);
  if (!sid)
    return { ok: false, error: 'not_found', message: 'Channel not found' };
  const chType = await getEchoChannelType(pool, sid, channelId);
  if (chType !== 'paper') {
    return { ok: false, error: 'not_paper', message: 'Not a paper channel' };
  }
  const caps = await getPaperCapabilitiesForUser(pool, channelId, userId);
  if (!caps.canAuthorPaper) {
    return {
      ok: false,
      error: 'forbidden',
      message: 'Cannot edit paper document',
    };
  }

  const stripped =
    typeof contentJson === 'object' &&
    contentJson !== null &&
    !Array.isArray(contentJson)
      ? stripPaperAttributionFromDoc(contentJson as Record<string, unknown>)
      : null;
  if (!stripped) {
    return {
      ok: false,
      error: 'validation',
      message: 'contentJson must be an object',
    };
  }
  const validated = validatePaperContentJsonForWrite(stripped);
  if (!validated.ok) {
    return { ok: false, error: 'validation', message: validated.error };
  }

  const prev = await getEchoPaperDocument(pool, channelId);
  if (!prev) {
    return {
      ok: false,
      error: 'not_found',
      message: 'Paper document not found',
    };
  }
  if (prev.revision !== expectedRevision) {
    return {
      ok: false,
      error: 'conflict',
      expectedRevision,
      actualRevision: prev.revision,
    };
  }

  const stamped = applyPaperAttributionStamp(
    prev.contentJson,
    validated.doc,
    userId,
  );
  const nextRevision = prev.revision + 1;
  const r = await pool.query(
    `UPDATE echo_paper_documents
     SET content_json = $2::jsonb,
         content_schema_version = $3,
         revision = $4,
         updated_at = NOW(),
         updated_by_user_id = $5
     WHERE channel_id = $1 AND revision = $6
     RETURNING channel_id, content_json, content_schema_version, revision,
               updated_at, updated_by_user_id`,
    [
      channelId,
      JSON.stringify(stamped),
      ECHO_CONTENT_SCHEMA_VERSION,
      nextRevision,
      userId,
      expectedRevision,
    ],
  );
  if (r.rows.length === 0) {
    const cur = await getEchoPaperDocument(pool, channelId);
    return {
      ok: false,
      error: 'conflict',
      expectedRevision,
      actualRevision: cur?.revision ?? expectedRevision,
    };
  }
  const row = r.rows[0];
  return {
    ok: true,
    row: {
      channelId: String(row.channel_id),
      contentJson: row.content_json as Record<string, unknown>,
      contentSchemaVersion: Number(row.content_schema_version),
      revision: Number(row.revision),
      updatedAt: new Date(String(row.updated_at)),
      updatedByUserId: String(row.updated_by_user_id),
    },
  };
}

export async function assertEchoPaperChannelAccess(
  pool: pg.Pool,
  userId: string,
  channelId: string,
): Promise<
  | { ok: true; serverId: string }
  | { ok: false; code: 'not_found' | 'not_paper' | 'forbidden' }
> {
  const sid = await getEchoChannelServerId(pool, channelId);
  if (!sid) return { ok: false, code: 'not_found' };
  const chType = await getEchoChannelType(pool, sid, channelId);
  if (chType !== 'paper') return { ok: false, code: 'not_paper' };
  const access = await diagnoseEchoChannelAccess(pool, userId, channelId);
  if (!access.ok) return { ok: false, code: 'forbidden' };
  return { ok: true, serverId: sid };
}
