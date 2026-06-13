import { AsyncLocalStorage } from 'node:async_hooks';

export type PgQueryContextScope = 'rest' | 'socket' | 'job' | 'internal';

export type PgQueryContext = {
  scope: PgQueryContextScope;
  /** REST route group, socket event name, or job type label (low cardinality). */
  label: string;
};

const storage = new AsyncLocalStorage<PgQueryContext>();

export function runWithPgQueryContext<T>(ctx: PgQueryContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getPgQueryContext(): PgQueryContext | undefined {
  return storage.getStore();
}

/** Bind PG query labels for the current async continuation (e.g. HTTP request). */
export function enterPgQueryContext(ctx: PgQueryContext): void {
  storage.enterWith(ctx);
}

export function formatPgQueryContextLabel(): string {
  const ctx = getPgQueryContext();
  if (!ctx) return 'internal:unlabeled';
  return `${ctx.scope}:${ctx.label}`;
}

/**
 * Per-operation query tally, independent of {@link storage}. Wraps a region of
 * work (e.g. one message send) so callers can count exactly how many PG
 * roundtrips it issued — see {@link echoMessageSendDbQueries}.
 */
const queryTally = new AsyncLocalStorage<{ count: number }>();

/** Increment the active tally, if any. Called from the query instrumentation. */
export function bumpPgQueryTally(): void {
  const t = queryTally.getStore();
  if (t) t.count += 1;
}

/** Run `fn` inside a fresh tally and return its result plus the query count. */
export async function countPgQueriesDuring<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; queryCount: number }> {
  const tally = { count: 0 };
  const result = await queryTally.run(tally, fn);
  return { result, queryCount: tally.count };
}
