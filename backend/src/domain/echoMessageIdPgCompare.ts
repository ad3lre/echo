/**
 * SQL fragments to compare `echo_messages.id` values consistently with
 * {@link compareEchoTimelineIds} / `compareEchoPublicId` on the client:
 * pure decimal strings use numeric ordering; otherwise text ordering (legacy UUID ids).
 *
 * Lexicographic `>` on digit strings of different lengths is wrong (e.g. `"9" > "10"`).
 */

/** True when `a` is strictly greater than `b` (both are SQL column/expression strings). */
export function echoMessageIdPgGreaterThan(a: string, b: string): string {
  return `(
    (${a} ~ '^[0-9]+$' AND ${b} ~ '^[0-9]+$' AND (${a})::numeric > (${b})::numeric)
    OR (NOT (${a} ~ '^[0-9]+$' AND ${b} ~ '^[0-9]+$') AND ${a} > ${b})
  )`;
}
