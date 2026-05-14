/** PostgreSQL `undefined_column` — query referenced a column that does not exist yet. */
export function isPostgresUndefinedColumnError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '42703'
  );
}

/** PostgreSQL `undefined_table` / missing relation (e.g. migration not applied). */
export function isPostgresUndefinedRelationError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '42P01'
  );
}

const NODE_PG_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'EPIPE',
]);

/**
 * True when Postgres (or the network path to it) is unreachable — as opposed to SQL/logic errors.
 * Used so HTTP handlers return 503 instead of letting the error surface as 500.
 */
export function isPgUnavailableError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: string; errors?: unknown[] };
  if (typeof e.code === 'string') {
    if (NODE_PG_UNAVAILABLE_CODES.has(e.code)) return true;
    // SQLSTATE class 08 — connection exception (e.g. 08006 connection_failure)
    if (e.code.startsWith('08')) return true;
    // Server admin / cannot accept connections (transient)
    if (e.code === '57P01' || e.code === '57P02' || e.code === '57P03')
      return true;
  }
  if (Array.isArray(e.errors) && e.errors.length > 0) {
    return e.errors.some((x) => isPgUnavailableError(x));
  }
  return false;
}
