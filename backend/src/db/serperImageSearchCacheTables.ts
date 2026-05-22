import type { Pool } from 'pg';

/** Durable Serper image search cache (90-day freshness + refresh failure tracking). */
export async function ensureSerperImageSearchCacheTables(
  pool: Pool,
): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_serper_image_search_cache (
      cache_key TEXT PRIMARY KEY,
      query_text TEXT NOT NULL,
      image_num INT NOT NULL,
      page INT NOT NULL DEFAULT 1,
      results JSONB NOT NULL,
      refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_failed_at TIMESTAMPTZ NULL,
      failure_count INT NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_serper_image_search_cache_refreshed_idx
    ON echo_serper_image_search_cache (refreshed_at);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_serper_image_search_cache_fail_idx
    ON echo_serper_image_search_cache (last_failed_at)
    WHERE failure_count > 0;
  `);
}
