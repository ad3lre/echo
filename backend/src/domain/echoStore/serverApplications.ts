import type pg from 'pg';
import { nextEchoSnowflakeId } from '../echoSnowflake';
import { joinEchoServerFromInvite } from './servers';
import {
  parseEchoApplicationFormFromDb,
  validateEchoApplicationAnswers,
  type EchoApplicationForm,
} from './applicationForm';
import { resolveEchoInviteTarget } from './invites';
import { insertEchoAudit } from './auditLog';
import { isUserBannedFromServer } from './access';
import { echoDirectoryExcludedNamesSql } from './constants';

export async function getEchoServerApplicationSettings(
  pool: pg.Pool,
  serverId: string,
): Promise<{
  applicationsEnabled: boolean;
  applicationForm: EchoApplicationForm;
} | null> {
  const r = await pool.query(
    `SELECT applications_enabled, application_form FROM echo_servers WHERE id = $1 LIMIT 1`,
    [serverId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const form = parseEchoApplicationFormFromDb(row.application_form);
  if (!form) return null;
  return {
    applicationsEnabled: Boolean(row.applications_enabled),
    applicationForm: form,
  };
}

export type SubmitEchoServerApplicationResult =
  | { ok: true; applicationId: string }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'disabled'
        | 'already_member'
        | 'banned'
        | 'invalid_body'
        | 'invalid_source'
        | 'invite_mismatch'
        | 'not_listed'
        | 'duplicate_pending';
    };

export async function submitEchoServerApplication(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  body: {
    source: 'invite' | 'directory';
    inviteToken?: string | null;
    answers: unknown;
  },
): Promise<SubmitEchoServerApplicationResult> {
  if (body.source !== 'invite' && body.source !== 'directory')
    return { ok: false, reason: 'invalid_source' };

  if (await isUserBannedFromServer(pool, serverId, userId))
    return { ok: false, reason: 'banned' };

  const mem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  if (mem.rows.length > 0) return { ok: false, reason: 'already_member' };

  const settings = await getEchoServerApplicationSettings(pool, serverId);
  if (!settings) return { ok: false, reason: 'not_found' };
  if (!settings.applicationsEnabled) return { ok: false, reason: 'disabled' };

  if (body.source === 'invite') {
    const tok =
      typeof body.inviteToken === 'string' ? body.inviteToken.trim() : '';
    if (!tok) return { ok: false, reason: 'invalid_body' };
    const inv = await resolveEchoInviteTarget(pool, tok);
    if (!inv || inv.serverId !== serverId)
      return { ok: false, reason: 'invite_mismatch' };
  } else {
    const exclude = echoDirectoryExcludedNamesSql();
    const listed = await pool.query(
      `SELECT id FROM echo_servers WHERE id = $1 AND listed_in_directory = true AND ${exclude} LIMIT 1`,
      [serverId],
    );
    if (!listed.rows[0]) return { ok: false, reason: 'not_listed' };
  }

  const validated = validateEchoApplicationAnswers(
    settings.applicationForm,
    body.answers,
    { serverId, userId },
  );
  if (!validated.ok) return { ok: false, reason: 'invalid_body' };

  const id = nextEchoSnowflakeId();
  const snap =
    body.source === 'invite' &&
    typeof body.inviteToken === 'string' &&
    body.inviteToken.trim()
      ? body.inviteToken.trim().slice(0, 512)
      : '';

  try {
    await pool.query(
      `INSERT INTO echo_server_applications (
        id, server_id, user_id, status, source, invite_token_snapshot, answers
      ) VALUES ($1, $2, $3, 'pending', $4, $5, $6::jsonb)`,
      [
        id,
        serverId,
        userId,
        body.source,
        snap,
        JSON.stringify(validated.answers),
      ],
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === '23505')
      return { ok: false, reason: 'duplicate_pending' };
    throw e;
  }
  return { ok: true, applicationId: id };
}

export type EchoServerApplicationListRow = {
  id: string;
  userId: string;
  status: string;
  source: string;
  answers: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string;
};

export async function listEchoServerApplications(
  pool: pg.Pool,
  serverId: string,
  status: 'pending' | 'approved' | 'rejected' | 'all',
): Promise<EchoServerApplicationListRow[]> {
  const params: string[] = [serverId];
  let where = 'WHERE a.server_id = $1';
  if (status !== 'all') {
    params.push(status);
    where += ` AND a.status = $${params.length}`;
  }
  const r = await pool.query(
    `
    SELECT a.id, a.user_id, a.status, a.source, a.answers, a.created_at,
           a.resolved_at, a.resolved_by, a.resolution_note
    FROM echo_server_applications a
    ${where}
    ORDER BY a.created_at DESC
    LIMIT 200
    `,
    params,
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    userId: String(row.user_id),
    status: String(row.status),
    source: String(row.source),
    answers:
      row.answers &&
      typeof row.answers === 'object' &&
      !Array.isArray(row.answers)
        ? (row.answers as Record<string, unknown>)
        : {},
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? ''),
    resolvedAt:
      row.resolved_at instanceof Date
        ? row.resolved_at.toISOString()
        : row.resolved_at
          ? String(row.resolved_at)
          : null,
    resolvedBy: row.resolved_by != null ? String(row.resolved_by) : null,
    resolutionNote: String(row.resolution_note ?? ''),
  }));
}

export type ResolveEchoServerApplicationResult =
  | {
      ok: true;
      row: {
        id: string;
        serverId: string;
        userId: string;
        status: string;
      };
    }
  | { ok: false; reason: 'not_found' | 'bad_status' };

export async function getEchoServerApplicationById(
  pool: pg.Pool,
  serverId: string,
  applicationId: string,
): Promise<ResolveEchoServerApplicationResult> {
  const r = await pool.query(
    `SELECT id, server_id, user_id, status FROM echo_server_applications
     WHERE id = $1 AND server_id = $2 LIMIT 1`,
    [applicationId, serverId],
  );
  const row = r.rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  return {
    ok: true,
    row: {
      id: String(row.id),
      serverId: String(row.server_id),
      userId: String(row.user_id),
      status: String(row.status),
    },
  };
}

export type ApproveEchoServerApplicationResult =
  | {
      ok: true;
      joinAuditId: string | null;
      alreadyMember: boolean;
      approvedUserId: string;
    }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'bad_status'
        | 'join_failed'
        | 'banned'
        | 'not_found_server';
    };

export async function approveEchoServerApplication(
  pool: pg.Pool,
  serverId: string,
  applicationId: string,
  actorId: string,
  joinClientIp: string | null,
): Promise<ApproveEchoServerApplicationResult> {
  const got = await getEchoServerApplicationById(pool, serverId, applicationId);
  if (!got.ok) return { ok: false, reason: 'not_found' };
  if (got.row.status !== 'pending') return { ok: false, reason: 'bad_status' };

  const join = await joinEchoServerFromInvite(
    pool,
    serverId,
    got.row.userId,
    joinClientIp,
    { skipInviteJoinGate: true },
  );
  if (!join.ok) {
    if (join.reason === 'banned') return { ok: false, reason: 'banned' };
    if (join.reason === 'not_found')
      return { ok: false, reason: 'not_found_server' };
    return { ok: false, reason: 'join_failed' };
  }

  await pool.query(
    `UPDATE echo_server_applications
     SET status = 'approved', resolved_at = NOW(), resolved_by = $1, resolution_note = ''
     WHERE id = $2 AND server_id = $3 AND status = 'pending'`,
    [actorId, applicationId, serverId],
  );

  await insertEchoAudit(
    pool,
    serverId,
    actorId,
    'application.approve',
    'user',
    got.row.userId,
    { applicationId },
  );

  return {
    ok: true,
    joinAuditId: join.joinAuditId,
    alreadyMember: join.alreadyMember,
    approvedUserId: got.row.userId,
  };
}

export async function rejectEchoServerApplication(
  pool: pg.Pool,
  serverId: string,
  applicationId: string,
  actorId: string,
  note?: string,
): Promise<'ok' | 'not_found' | 'bad_status'> {
  const got = await getEchoServerApplicationById(pool, serverId, applicationId);
  if (!got.ok) return 'not_found';
  if (got.row.status !== 'pending') return 'bad_status';
  const n = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  await pool.query(
    `UPDATE echo_server_applications
     SET status = 'rejected', resolved_at = NOW(), resolved_by = $1, resolution_note = $2
     WHERE id = $3 AND server_id = $4 AND status = 'pending'`,
    [actorId, n, applicationId, serverId],
  );
  await insertEchoAudit(
    pool,
    serverId,
    actorId,
    'application.reject',
    'user',
    got.row.userId,
    { applicationId, note: n },
  );
  return 'ok';
}

/** When true, REST join should return APPLICATION_REQUIRED instead of adding membership. */
export async function shouldBlockEchoJoinForPendingApplication(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  skipsApplication: boolean,
): Promise<boolean> {
  if (skipsApplication) return false;
  const s = await pool.query(
    `SELECT applications_enabled FROM echo_servers WHERE id = $1 LIMIT 1`,
    [serverId],
  );
  if (!s.rows[0] || !Boolean(s.rows[0].applications_enabled)) return false;
  const mem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  if (mem.rows.length > 0) return false;
  return true;
}
