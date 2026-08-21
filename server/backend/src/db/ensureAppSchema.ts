import type { Pool } from 'pg';
import { ensureAuthTables } from './authTables';
import { ensureEchoTables } from './echoTables';
import { ensureBotTables } from './botTables';
import { ensureIntegrationTables } from './integrationTables';
import { ensureSerperImageSearchCacheTables } from './serperImageSearchCacheTables';

let inflight: Promise<void> | null = null;

/**
 * Runs auth then Echo DDL once per process (shared promise). Parallel callers await the same work,
 * avoiding concurrent CREATE TABLE races (e.g. duplicate pg_type for auth_users).
 */
export async function ensureAppSchema(pool: Pool): Promise<void> {
  if (!inflight) {
    const run = (async () => {
      await ensureAuthTables(pool);
      await ensureEchoTables(pool);
      await ensureIntegrationTables(pool);
      await ensureBotTables(pool);
      await ensureSerperImageSearchCacheTables(pool);
    })();
    inflight = run.catch((err) => {
      inflight = null;
      throw err;
    });
  }
  await inflight;
}
