import type pg from 'pg';

export type EchoMessageSearchIndexHealth = {
  pgTrgmAvailable: boolean;
  trigramIndexPresent: boolean;
};

/**
 * Verify message-search performance prerequisites after schema ensure.
 * Logs loudly when the trigram GIN index is missing — ILIKE '%q%' otherwise seq-scans.
 */
export async function verifyEchoMessageSearchIndexes(
  pool: pg.Pool,
): Promise<EchoMessageSearchIndexHealth> {
  let pgTrgmAvailable = false;
  try {
    const ext = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
       ) AS exists`,
    );
    pgTrgmAvailable = ext.rows[0]?.exists === true;
  } catch {
    pgTrgmAvailable = false;
  }

  let trigramIndexPresent = false;
  try {
    const idx = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE indexname = 'echo_messages_search_index_text_trgm_idx'
       ) AS exists`,
    );
    trigramIndexPresent = idx.rows[0]?.exists === true;
  } catch {
    trigramIndexPresent = false;
  }

  if (!pgTrgmAvailable) {
    console.error(
      '[echo] CRITICAL: pg_trgm extension is not installed. Message search ILIKE queries will sequential-scan echo_messages.search_index_text. Install CREATE EXTENSION pg_trgm (requires superuser or delegated extension role).',
    );
  } else if (!trigramIndexPresent) {
    console.error(
      '[echo] CRITICAL: echo_messages_search_index_text_trgm_idx is missing. Message search ILIKE queries will sequential-scan echo_messages.search_index_text. Ensure index creation is permitted for the app DB role.',
    );
  }

  return { pgTrgmAvailable, trigramIndexPresent };
}
