import type pg from 'pg';

/** Tracks one-time Echo DDL/data migrations applied via `ensureEchoTables`. */
export async function runEchoSchemaMigrationOnce(
  pool: pg.Pool,
  migrationId: string,
  run: () => Promise<void>,
): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const existing = await pool.query(
    `SELECT 1 FROM echo_schema_migrations WHERE id = $1 LIMIT 1`,
    [migrationId],
  );
  if (existing.rows.length > 0) return;
  await run();
  await pool.query(
    `INSERT INTO echo_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [migrationId],
  );
}
