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
