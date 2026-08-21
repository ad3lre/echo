/**
 * Raw chat rows (`RawMessage`) keep `timestamp` / `editedAt` as ISO 8601 so
 * `compareRawMessagesChronologically` can sort reliably. Human-readable strings
 * like "Today at 3:45 PM" do not parse with `Date.parse` and break ordering when
 * mixed with client UUIDs vs Echo snowflake ids.
 */
export function toStoredMessageTimestamp(isoLike: string): string {
  const t = Date.parse(isoLike);
  if (Number.isFinite(t)) return new Date(t).toISOString();
  return isoLike;
}
