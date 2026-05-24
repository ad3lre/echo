/**
 * In-server-settings event list expand state (never guild navigation).
 */
export function toggleExpandedEventId(
  current: string | null,
  id: string,
): string | null {
  return current === id ? null : id;
}
