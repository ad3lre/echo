import type pg from 'pg';
import { MAX_PAPER_COMMENT_BODY_CHARS } from '../../../../../../contracts/types/paper';
import { nextEchoSnowflakeId } from '../../echoSnowflake';
import { assertEchoPaperChannelAccess } from './paper';
import { getPaperCapabilitiesForUser } from '../members/access';

export type EchoPaperCommentRow = {
  id: string;
  channelId: string;
  anchorBlockId: string;
  anchorFrom: number | null;
  anchorTo: number | null;
  anchorQuote: string;
  authorId: string;
  body: string;
  parentCommentId: string | null;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapCommentRow(row: Record<string, unknown>): EchoPaperCommentRow {
  return {
    id: String(row.id),
    channelId: String(row.channel_id),
    anchorBlockId: String(row.anchor_block_id),
    anchorFrom: row.anchor_from != null ? Number(row.anchor_from) : null,
    anchorTo: row.anchor_to != null ? Number(row.anchor_to) : null,
    anchorQuote: String(row.anchor_quote ?? ''),
    authorId: String(row.author_id),
    body: String(row.body),
    parentCommentId:
      row.parent_comment_id != null ? String(row.parent_comment_id) : null,
    resolvedAt:
      row.resolved_at != null ? new Date(String(row.resolved_at)) : null,
    resolvedByUserId:
      row.resolved_by_user_id != null ? String(row.resolved_by_user_id) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export function echoPaperCommentToPayload(row: EchoPaperCommentRow) {
  return {
    id: row.id,
    channelId: row.channelId,
    anchorBlockId: row.anchorBlockId,
    anchorFrom: row.anchorFrom,
    anchorTo: row.anchorTo,
    anchorQuote: row.anchorQuote,
    authorId: row.authorId,
    body: row.body,
    parentCommentId: row.parentCommentId,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedByUserId: row.resolvedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listEchoPaperComments(
  pool: pg.Pool,
  channelId: string,
): Promise<EchoPaperCommentRow[]> {
  const r = await pool.query(
    `SELECT id, channel_id, anchor_block_id, anchor_from, anchor_to, anchor_quote,
            author_id, body, parent_comment_id, resolved_at, resolved_by_user_id,
            created_at, updated_at
     FROM echo_paper_comments
     WHERE channel_id = $1
     ORDER BY created_at ASC`,
    [channelId],
  );
  return r.rows.map((row) => mapCommentRow(row));
}

export async function createEchoPaperComment(
  pool: pg.Pool,
  channelId: string,
  userId: string,
  input: {
    anchorBlockId: string;
    anchorFrom?: number | null;
    anchorTo?: number | null;
    anchorQuote?: string;
    body: string;
    parentCommentId?: string | null;
  },
): Promise<
  | { ok: true; row: EchoPaperCommentRow }
  | { ok: false; error: string; status: number }
> {
  const access = await assertEchoPaperChannelAccess(pool, userId, channelId);
  if (!access.ok) {
    return {
      ok: false,
      error: access.code === 'not_paper' ? 'Not a paper channel' : 'Forbidden',
      status: access.code === 'not_found' ? 404 : 403,
    };
  }
  const caps = await getPaperCapabilitiesForUser(pool, channelId, userId);
  if (!caps.canCommentOnPaper) {
    return { ok: false, error: 'Cannot comment on paper', status: 403 };
  }
  const body = String(input.body ?? '').trim();
  if (!body) return { ok: false, error: 'body required', status: 400 };
  if (body.length > MAX_PAPER_COMMENT_BODY_CHARS) {
    return { ok: false, error: 'Comment too long', status: 400 };
  }
  const parentId =
    input.parentCommentId != null && String(input.parentCommentId).trim()
      ? String(input.parentCommentId).trim()
      : null;

  let anchorBlockId = String(input.anchorBlockId ?? '').trim();
  let anchorFrom = input.anchorFrom ?? null;
  let anchorTo = input.anchorTo ?? null;
  let anchorQuote = String(input.anchorQuote ?? '');

  if (parentId) {
    const parent = await pool.query(
      `SELECT anchor_block_id, anchor_from, anchor_to, anchor_quote
       FROM echo_paper_comments WHERE id = $1 AND channel_id = $2`,
      [parentId, channelId],
    );
    if (parent.rows.length === 0) {
      return { ok: false, error: 'Parent comment not found', status: 400 };
    }
    const prow = parent.rows[0];
    if (!anchorBlockId) {
      anchorBlockId = String(prow.anchor_block_id ?? '').trim();
      if (anchorFrom == null) {
        anchorFrom = prow.anchor_from != null ? Number(prow.anchor_from) : null;
      }
      if (anchorTo == null) {
        anchorTo = prow.anchor_to != null ? Number(prow.anchor_to) : null;
      }
      if (!anchorQuote.trim()) {
        anchorQuote = String(prow.anchor_quote ?? '');
      }
    }
  }

  if (!anchorBlockId) {
    return { ok: false, error: 'anchorBlockId required', status: 400 };
  }
  const id = nextEchoSnowflakeId();
  const r = await pool.query(
    `INSERT INTO echo_paper_comments (
       id, channel_id, anchor_block_id, anchor_from, anchor_to, anchor_quote,
       author_id, body, parent_comment_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, channel_id, anchor_block_id, anchor_from, anchor_to, anchor_quote,
               author_id, body, parent_comment_id, resolved_at, resolved_by_user_id,
               created_at, updated_at`,
    [
      id,
      channelId,
      anchorBlockId,
      anchorFrom,
      anchorTo,
      anchorQuote.slice(0, 2000),
      userId,
      body,
      parentId,
    ],
  );
  return { ok: true, row: mapCommentRow(r.rows[0]) };
}

export async function patchEchoPaperComment(
  pool: pg.Pool,
  channelId: string,
  commentId: string,
  userId: string,
  input: {
    body?: string;
    resolve?: boolean;
    unresolve?: boolean;
  },
): Promise<
  | { ok: true; row: EchoPaperCommentRow }
  | { ok: false; error: string; status: number }
> {
  const access = await assertEchoPaperChannelAccess(pool, userId, channelId);
  if (!access.ok) {
    return {
      ok: false,
      error: 'Forbidden',
      status: access.code === 'not_found' ? 404 : 403,
    };
  }
  const existing = await pool.query(
    `SELECT author_id, resolved_at FROM echo_paper_comments
     WHERE id = $1 AND channel_id = $2`,
    [commentId, channelId],
  );
  if (existing.rows.length === 0) {
    return { ok: false, error: 'Comment not found', status: 404 };
  }
  const authorId = String(existing.rows[0].author_id);
  const caps = await getPaperCapabilitiesForUser(pool, channelId, userId);
  const isAuthor = authorId === userId;

  if (input.resolve === true || input.unresolve === true) {
    if (!caps.canManagePaperComments && !isAuthor) {
      return { ok: false, error: 'Cannot resolve comment', status: 403 };
    }
    const resolved = input.unresolve === true ? null : new Date();
    const resolvedBy = input.unresolve === true ? null : userId;
    const r = await pool.query(
      `UPDATE echo_paper_comments
       SET resolved_at = $3, resolved_by_user_id = $4, updated_at = NOW()
       WHERE id = $1 AND channel_id = $2
       RETURNING id, channel_id, anchor_block_id, anchor_from, anchor_to, anchor_quote,
                 author_id, body, parent_comment_id, resolved_at, resolved_by_user_id,
                 created_at, updated_at`,
      [commentId, channelId, resolved, resolvedBy],
    );
    return { ok: true, row: mapCommentRow(r.rows[0]) };
  }

  if (input.body !== undefined) {
    if (!isAuthor) {
      return { ok: false, error: 'Cannot edit comment', status: 403 };
    }
    if (!caps.canCommentOnPaper) {
      return { ok: false, error: 'Cannot comment on paper', status: 403 };
    }
    const body = String(input.body).trim();
    if (!body) return { ok: false, error: 'body required', status: 400 };
    if (body.length > MAX_PAPER_COMMENT_BODY_CHARS) {
      return { ok: false, error: 'Comment too long', status: 400 };
    }
    const r = await pool.query(
      `UPDATE echo_paper_comments SET body = $3, updated_at = NOW()
       WHERE id = $1 AND channel_id = $2
       RETURNING id, channel_id, anchor_block_id, anchor_from, anchor_to, anchor_quote,
                 author_id, body, parent_comment_id, resolved_at, resolved_by_user_id,
                 created_at, updated_at`,
      [commentId, channelId, body],
    );
    return { ok: true, row: mapCommentRow(r.rows[0]) };
  }

  return { ok: false, error: 'No changes', status: 400 };
}

export async function deleteEchoPaperComment(
  pool: pg.Pool,
  channelId: string,
  commentId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const access = await assertEchoPaperChannelAccess(pool, userId, channelId);
  if (!access.ok) {
    return {
      ok: false,
      error: 'Forbidden',
      status: access.code === 'not_found' ? 404 : 403,
    };
  }
  const existing = await pool.query(
    `SELECT author_id FROM echo_paper_comments WHERE id = $1 AND channel_id = $2`,
    [commentId, channelId],
  );
  if (existing.rows.length === 0) {
    return { ok: false, error: 'Comment not found', status: 404 };
  }
  const caps = await getPaperCapabilitiesForUser(pool, channelId, userId);
  const isAuthor = String(existing.rows[0].author_id) === userId;
  if (!isAuthor && !caps.canManagePaperComments) {
    return { ok: false, error: 'Cannot delete comment', status: 403 };
  }
  await pool.query(
    `DELETE FROM echo_paper_comments WHERE id = $1 AND channel_id = $2`,
    [commentId, channelId],
  );
  return { ok: true };
}
