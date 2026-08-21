import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import {
  getEchoChannelCapabilitiesForUser,
  getEchoChannelServerId,
  getPaperCapabilitiesForUser,
} from '../members/access';
import { getEchoPaperDocument } from './paper';
import { getEchoChannelType } from '../voice/voice';

export type PaperShareVisibility = 'server' | 'private' | 'global';

export type PaperShareRow = {
  visibility: PaperShareVisibility;
  shareToken: string | null;
  channelName: string;
  serverId: string;
};

function normalizeVisibility(raw: unknown): PaperShareVisibility {
  if (raw === 'private' || raw === 'global') return raw;
  return 'server';
}

function newShareToken(): string {
  return randomBytes(18).toString('base64url');
}

export async function getPaperShareRow(
  pool: pg.Pool,
  channelId: string,
): Promise<PaperShareRow | null> {
  const res = await pool.query(
    `SELECT name AS channel_name,
            paper_share_visibility,
            paper_share_token,
            server_id
     FROM echo_channels
     WHERE id = $1 AND type = 'paper'
     LIMIT 1`,
    [channelId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    visibility: normalizeVisibility(row.paper_share_visibility),
    shareToken:
      typeof row.paper_share_token === 'string' ? row.paper_share_token : null,
    channelName: String(row.channel_name ?? 'Paper'),
    serverId: String(row.server_id),
  };
}

export async function ensurePaperShareToken(
  pool: pg.Pool,
  channelId: string,
): Promise<string> {
  const existing = await getPaperShareRow(pool, channelId);
  if (existing?.shareToken) return existing.shareToken;
  const token = newShareToken();
  await pool.query(
    `UPDATE echo_channels SET paper_share_token = $2 WHERE id = $1`,
    [channelId, token],
  );
  return token;
}

export function buildPaperShareAudience(visibility: PaperShareVisibility): {
  headline: string;
  detail: string;
} {
  switch (visibility) {
    case 'private':
      return {
        headline: 'Authors only',
        detail:
          'Only members with “Author in paper” on this channel can open the document.',
      };
    case 'global':
      return {
        headline: 'Anyone with the link',
        detail:
          'Anyone on the internet can view this document (read-only). Echo sign-in is not required.',
      };
    case 'server':
    default:
      return {
        headline: 'Server members',
        detail:
          'Members who can view this channel under server roles and permission overwrites.',
      };
  }
}

export async function assertCanManagePaperShare(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<
  | { ok: true; serverId: string }
  | { ok: false; code: 'not_found' | 'not_paper' | 'forbidden' }
> {
  const sid = await getEchoChannelServerId(pool, channelId);
  if (!sid) return { ok: false, code: 'not_found' };
  const chType = await getEchoChannelType(pool, sid, channelId);
  if (chType !== 'paper') return { ok: false, code: 'not_paper' };
  const caps = await getEchoChannelCapabilitiesForUser(pool, channelId, userId);
  if (!caps.canManageChannel) return { ok: false, code: 'forbidden' };
  return { ok: true, serverId: sid };
}

export async function updatePaperShareVisibility(
  pool: pg.Pool,
  channelId: string,
  userId: string,
  visibility: PaperShareVisibility,
): Promise<
  | { ok: true; row: PaperShareRow }
  | { ok: false; code: 'not_found' | 'not_paper' | 'forbidden' }
> {
  const gate = await assertCanManagePaperShare(pool, channelId, userId);
  if (!gate.ok) return gate;
  if (visibility === 'global') {
    await ensurePaperShareToken(pool, channelId);
  }
  await pool.query(
    `UPDATE echo_channels SET paper_share_visibility = $2 WHERE id = $1`,
    [channelId, visibility],
  );
  const row = await getPaperShareRow(pool, channelId);
  if (!row) return { ok: false, code: 'not_found' };
  return { ok: true, row };
}

/** Enforces visibility for authenticated in-app paper GET and comments. */
export async function assertPaperContentVisibleToUser(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; code: 'forbidden'; message: string }> {
  const share = await getPaperShareRow(pool, channelId);
  if (!share) return { ok: true };
  if (share.visibility !== 'private') return { ok: true };
  const caps = await getPaperCapabilitiesForUser(pool, channelId, userId);
  if (!caps.canAuthorPaper) {
    return {
      ok: false,
      code: 'forbidden',
      message: 'This paper is private to authors only.',
    };
  }
  return { ok: true };
}

/** @deprecated Use {@link assertPaperContentVisibleToUser}. */
export const assertPaperDocumentVisibilityForUser =
  assertPaperContentVisibleToUser;

export async function isPaperSharePrivate(
  pool: pg.Pool,
  channelId: string,
): Promise<boolean> {
  const share = await getPaperShareRow(pool, channelId);
  return share?.visibility === 'private';
}

/** Omit document body from server-wide realtime when visibility is private. */
export function trimPaperDocumentWorkspacePayload<
  T extends {
    channelId: string;
    revision: number;
    updatedAt: string;
    updatedByUserId?: string | null;
    contentJson?: Record<string, unknown>;
  },
>(full: T, isPrivate: boolean): T {
  if (!isPrivate) return full;
  return {
    channelId: full.channelId,
    revision: full.revision,
    updatedAt: full.updatedAt,
    updatedByUserId: full.updatedByUserId,
  } as T;
}

export async function getPaperChannelIdByShareToken(
  pool: pg.Pool,
  token: string,
): Promise<{ channelId: string; channelName: string } | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const res = await pool.query(
    `SELECT id, name FROM echo_channels
     WHERE paper_share_token = $1
       AND type = 'paper'
       AND paper_share_visibility = 'global'
     LIMIT 1`,
    [trimmed],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    channelId: String(row.id),
    channelName: String(row.name ?? 'Paper'),
  };
}

export async function getPublicPaperDocumentByToken(
  pool: pg.Pool,
  token: string,
): Promise<{
  channelId: string;
  channelName: string;
  contentJson: Record<string, unknown>;
  contentSchemaVersion: number;
  revision: number;
  updatedAt: Date;
} | null> {
  const ch = await getPaperChannelIdByShareToken(pool, token);
  if (!ch) return null;
  const doc = await getEchoPaperDocument(pool, ch.channelId);
  if (!doc) return null;
  return {
    channelId: ch.channelId,
    channelName: ch.channelName,
    contentJson: doc.contentJson,
    contentSchemaVersion: doc.contentSchemaVersion,
    revision: doc.revision,
    updatedAt: doc.updatedAt,
  };
}
