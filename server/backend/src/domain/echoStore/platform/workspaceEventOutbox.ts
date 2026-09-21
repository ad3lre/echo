import type pg from 'pg';
import type { EchoWorkspaceEvent } from '../../../../../../contracts/types/socket';

export type EchoWorkspaceEventOutboxTarget = {
  serverId?: string;
  userId?: string;
};

export type EchoWorkspaceEventOutboxRow = {
  id: string;
  payload: EchoWorkspaceEvent;
  targetServerId: string | null;
  targetUserId: string | null;
  attempts: number;
};

/**
 * Reserve an event for immediate delivery. Processing rows are recoverable by
 * the drain if the process exits between fanout and the delivered update.
 */
export async function insertEchoWorkspaceEventOutboxProcessing(
  pool: pg.Pool,
  args: {
    id: string;
    payload: EchoWorkspaceEvent;
    targets?: EchoWorkspaceEventOutboxTarget;
  },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO echo_workspace_event_outbox
      (id, event_kind, payload, target_server_id, target_user_id,
       status, attempts, locked_at)
    VALUES ($1, $2, $3::jsonb, $4, $5, 'processing', 1, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [
      args.id,
      args.payload.kind,
      JSON.stringify(args.payload),
      args.targets?.serverId ?? null,
      args.targets?.userId ?? null,
    ],
  );
}

export async function markEchoWorkspaceEventOutboxDelivered(
  pool: pg.Pool,
  id: string,
): Promise<void> {
  await pool.query(
    `
    UPDATE echo_workspace_event_outbox
    SET status = 'delivered', delivered_at = NOW(), locked_at = NULL,
        updated_at = NOW(), last_error = NULL
    WHERE id = $1 AND status = 'processing'
    `,
    [id],
  );
}

/** Claim pending rows and rows whose immediate-delivery owner went away. */
export async function claimEchoWorkspaceEventOutbox(
  pool: pg.Pool,
  limit: number,
  lockTimeoutMs = 60_000,
): Promise<EchoWorkspaceEventOutboxRow[]> {
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const boundedLockTimeoutMs = Math.max(1_000, Math.floor(lockTimeoutMs));
  const result = await pool.query(
    `
    WITH candidates AS (
      SELECT id
      FROM echo_workspace_event_outbox
      WHERE available_at <= NOW()
        AND (
          status = 'pending'
          OR (
            status = 'processing'
            AND locked_at <= NOW() - ($2::bigint * INTERVAL '1 millisecond')
          )
        )
      ORDER BY created_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    )
    UPDATE echo_workspace_event_outbox AS o
    SET status = 'processing', attempts = o.attempts + 1,
        locked_at = NOW(), updated_at = NOW()
    FROM candidates
    WHERE o.id = candidates.id
    RETURNING o.id, o.payload, o.target_server_id, o.target_user_id, o.attempts
    `,
    [boundedLimit, boundedLockTimeoutMs],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    payload: row.payload as EchoWorkspaceEvent,
    targetServerId: row.target_server_id ? String(row.target_server_id) : null,
    targetUserId: row.target_user_id ? String(row.target_user_id) : null,
    attempts: Number(row.attempts),
  }));
}

export async function markEchoWorkspaceEventOutboxFailed(
  pool: pg.Pool,
  args: { id: string; attempts: number; error: string; maxAttempts: number },
): Promise<void> {
  const maxAttempts = Math.max(1, Math.floor(args.maxAttempts));
  const error = args.error.slice(0, 2_000);
  await pool.query(
    `
    UPDATE echo_workspace_event_outbox
    SET status = CASE WHEN attempts >= $2 THEN 'failed' ELSE 'pending' END,
        available_at = CASE
          WHEN attempts >= $2 THEN NOW()
          ELSE NOW() + LEAST((POWER(2, GREATEST(attempts - 1, 0)) * INTERVAL '1 second'), INTERVAL '5 minutes')
        END,
        locked_at = NULL, updated_at = NOW(), last_error = $3
    WHERE id = $1 AND status = 'processing'
    `,
    [args.id, maxAttempts, error],
  );
}

/** Keep the outbox as a recovery buffer, not an unbounded event archive. */
export async function pruneEchoWorkspaceEventOutbox(
  pool: pg.Pool,
  retentionDays = 7,
  limit = 1_000,
): Promise<number> {
  const boundedDays = Math.max(1, Math.floor(retentionDays));
  const boundedLimit = Math.max(1, Math.min(10_000, Math.floor(limit)));
  const result = await pool.query(
    `
    WITH doomed AS (
      SELECT id
      FROM echo_workspace_event_outbox
      WHERE status IN ('delivered', 'failed')
        AND updated_at < NOW() - ($1::int * INTERVAL '1 day')
      ORDER BY updated_at ASC, id ASC
      LIMIT $2
    )
    DELETE FROM echo_workspace_event_outbox AS o
    USING doomed
    WHERE o.id = doomed.id
    `,
    [boundedDays, boundedLimit],
  );
  return result.rowCount ?? 0;
}
