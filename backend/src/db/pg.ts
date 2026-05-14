/**
 * PostgreSQL client.
 * Connects when DATABASE_URL is set (ECHO_BACKEND_STORAGE=postgres).
 */

import pg from 'pg';
import { config } from '../config';

const { Pool } = pg;

let pool: pg.Pool | null = null;

const SLOW_QUERY_MS = Number(process.env.ECHO_SLOW_QUERY_MS) || 100;

function fingerprint(text: unknown): string {
  if (typeof text !== 'string') return '(non-string)';
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * Wraps pool.query to emit structured warnings for queries exceeding
 * ECHO_SLOW_QUERY_MS (default 100ms).  Transparent to callers.
 */
function instrumentPool(raw: pg.Pool): pg.Pool {
  const origQuery = raw.query.bind(raw) as (...args: unknown[]) => unknown;

  const instrumented = function queryWithTiming(
    this: pg.Pool,
    ...args: unknown[]
  ): unknown {
    const t0 = process.hrtime.bigint();
    const result = origQuery(...args);
    if (result && typeof (result as { then?: unknown }).then === 'function') {
      return (result as Promise<unknown>).then(
        (res) => {
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          if (ms >= SLOW_QUERY_MS) {
            const text =
              typeof args[0] === 'string'
                ? args[0]
                : (args[0] as { text?: string })?.text;
            console.warn(
              `[slow-query] ${Math.round(ms)}ms | ${fingerprint(text)}`,
            );
          }
          return res;
        },
        (err) => {
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          if (ms >= SLOW_QUERY_MS) {
            const text =
              typeof args[0] === 'string'
                ? args[0]
                : (args[0] as { text?: string })?.text;
            console.warn(
              `[slow-query-error] ${Math.round(ms)}ms | ${fingerprint(text)}`,
            );
          }
          throw err;
        },
      );
    }
    return result;
  };
  raw.query = instrumented as typeof raw.query;
  return raw;
}

export function getPgPool(): pg.Pool | null {
  if (!config.databaseUrl) {
    return null;
  }
  if (!pool) {
    pool = instrumentPool(
      new Pool({
        connectionString: config.databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }),
    );
  }
  return pool;
}

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
