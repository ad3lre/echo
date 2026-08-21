import type pg from 'pg';
import { ensureAppSchema } from '../../db/ensureAppSchema';
import { closePgPool, getPgPool } from '../../db/pg';
import { isPgUnavailableError } from '../../db/pgErrors';
import { config } from '../../config';

export async function getEchoStore(): Promise<{
  enabled: boolean;
  pool: pg.Pool | null;
}> {
  const pool = getPgPool();
  if (!pool) {
    if (config.backendStorageMode === 'postgres') {
      throw new Error(
        'Echo Postgres store selected but pool is unavailable. Check DATABASE_URL.',
      );
    }
    return { enabled: false, pool: null };
  }
  try {
    await ensureAppSchema(pool);
    return { enabled: true, pool };
  } catch (err) {
    if (isPgUnavailableError(err)) {
      await closePgPool().catch(() => {});
      if (config.backendStorageMode === 'postgres') {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Postgres is unavailable (backend storage mode is postgres): ${detail}`,
        );
      }
      return { enabled: false, pool: null };
    }
    throw err;
  }
}
