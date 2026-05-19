import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import {
  compareEchoPublicId,
  isEchoPublicId,
  parseSnowflakeTime,
} from '@shared/snowflakeIds';

/** Prefer ISO `timestamp`; fall back to snowflake-derived time when the string does not parse. */
function orderingTimeMs(msg: RawMessage): number | null {
  const t = Date.parse(msg.timestamp);
  if (Number.isFinite(t)) return t;
  const id = msg.id;
  if (id && isEchoPublicId(id)) {
    const d = parseSnowflakeTime(id);
    return d ? d.getTime() : null;
  }
  return null;
}

/** Same basis as {@link compareRawMessagesChronologically} — use for DM inbox recency, etc. */
export function rawMessageOrderingTimeMs(msg: RawMessage): number | null {
  return orderingTimeMs(msg);
}

/**
 * Order chat rows for display: wall-clock first, then snowflake id, then string id tie-break.
 * Needed when message ids mix client UUIDs and Echo decimal snowflakes.
 */
export function compareRawMessagesChronologically(
  a: RawMessage,
  b: RawMessage,
): number {
  const ta = orderingTimeMs(a);
  const tb = orderingTimeMs(b);
  if (ta !== null && tb !== null && ta !== tb) {
    return ta - tb;
  }
  if (ta !== null && tb === null) return -1;
  if (ta === null && tb !== null) return 1;

  const ida = a.id ?? '';
  const idb = b.id ?? '';
  if (ida && idb && isEchoPublicId(ida) && isEchoPublicId(idb)) {
    return compareEchoPublicId(ida, idb);
  }

  if (ida && idb) {
    return ida < idb ? -1 : ida > idb ? 1 : 0;
  }
  if (!ida && !idb) return 0;
  return ida ? 1 : -1;
}

export function sortRawMessagesInPlace(list: RawMessage[]): void {
  list.sort(compareRawMessagesChronologically);
}
