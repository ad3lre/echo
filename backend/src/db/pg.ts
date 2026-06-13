/**
 * PostgreSQL client.
 * Connects when DATABASE_URL is set (ECHO_BACKEND_STORAGE=postgres).
 */

import pg from 'pg';
import { config } from '../config';
import {
  bumpPgQueryTally,
  formatPgQueryContextLabel,
  getPgQueryContext,
  runWithPgQueryContext,
} from './pgQueryContext';
import { echoPgQueryRoundtripsTotal } from '../observability/echoMetrics';
import { boundedInteger } from '../shared/numberParsing';

const { Pool } = pg;

let pool: pg.Pool | null = null;

const SLOW_QUERY_MS = boundedInteger(
  process.env.ECHO_SLOW_QUERY_MS,
  100,
  1,
  60_000,
);

function fingerprint(text: unknown): string {
  if (typeof text !== 'string') return '(non-string)';
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

type Queryable = Pick<pg.Pool, 'query'>;

function recordPgRoundtrip(): void {
  const ctx = getPgQueryContext();
  echoPgQueryRoundtripsTotal.inc({
    scope: ctx?.scope ?? 'internal',
    label: ctx?.label ?? 'unlabeled',
  });
  bumpPgQueryTally();
}

function wrapQueryWithInstrumentation(
  origQuery: (...args: unknown[]) => unknown,
): (...args: unknown[]) => unknown {
  return function queryWithTiming(...args: unknown[]): unknown {
    recordPgRoundtrip();
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
              `[slow-query] ${Math.round(ms)}ms | ${formatPgQueryContextLabel()} | ${fingerprint(text)}`,
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
              `[slow-query-error] ${Math.round(ms)}ms | ${formatPgQueryContextLabel()} | ${fingerprint(text)}`,
            );
          }
          throw err;
        },
      );
    }
    return result;
  };
}

const instrumentedQueryables = new WeakSet<object>();

function instrumentQueryable<T extends Queryable>(raw: T): T {
  if (!raw?.query || typeof raw.query !== 'function') return raw;
  if (instrumentedQueryables.has(raw as object)) return raw;
  const origQuery = raw.query.bind(raw) as (...args: unknown[]) => unknown;
  raw.query = wrapQueryWithInstrumentation(origQuery) as typeof raw.query;
  instrumentedQueryables.add(raw as object);
  return raw;
}

function instrumentPoolClient(client: pg.PoolClient | undefined): void {
  if (client) instrumentQueryable(client);
}

/**
 * Wraps pool.query (and clients from pool.connect) to count roundtrips and
 * emit structured warnings for queries exceeding ECHO_SLOW_QUERY_MS.
 */
function instrumentPool(raw: pg.Pool): pg.Pool {
  instrumentQueryable(raw);
  const origConnect = raw.connect.bind(raw);
  type ConnectCallback = (
    err: Error,
    client: pg.PoolClient,
    done: (release?: boolean) => void,
  ) => void;
  raw.connect = ((...args: unknown[]) => {
    const maybeCb = args[args.length - 1];
    if (typeof maybeCb === 'function') {
      const userCb = maybeCb as ConnectCallback;
      args[args.length - 1] = (
        err: Error,
        client: pg.PoolClient,
        done: (release?: boolean) => void,
      ) => {
        if (!err) instrumentPoolClient(client);
        userCb(err, client, done);
      };
      return origConnect(...(args as Parameters<typeof origConnect>));
    }
    return (
      origConnect(
        ...(args as Parameters<typeof origConnect>),
      ) as unknown as Promise<pg.PoolClient>
    ).then((client) => {
      instrumentPoolClient(client);
      return client;
    });
  }) as typeof raw.connect;
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

export { runWithPgQueryContext };
