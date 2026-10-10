import type pg from 'pg';

/** Tracks one-time Echo DDL/data migrations applied via `ensureEchoTables`. */
export async function runEchoSchemaMigrationOnce(
  pool: pg.Pool,
  migrationId: string,
  run: () => Promise<void>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
    CREATE TABLE IF NOT EXISTS echo_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    `);
    // A session lock is required here because existing migration callbacks
    // issue their statements through the pool instead of a transaction client.
    await client.query(
      `SELECT pg_advisory_lock(hashtext('echo_schema_migration'), hashtext($1))`,
      [migrationId],
    );
    const existing = await client.query(
      `SELECT 1 FROM echo_schema_migrations WHERE id = $1 LIMIT 1`,
      [migrationId],
    );
    if (existing.rows.length > 0) return;
    await run();
    await client.query(
      `INSERT INTO echo_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [migrationId],
    );
  } finally {
    try {
      await client.query(
        `SELECT pg_advisory_unlock(hashtext('echo_schema_migration'), hashtext($1))`,
        [migrationId],
      );
      client.release();
    } catch (unlockError) {
      // Never return a possibly still-locked session to the pool.
      client.release(unlockError as Error);
    }
  }
}
