/**
 * Echo public Snowflake IDs — decimal string in API/DB.
 * ADR: docs/adr/002-echo-public-snowflake-ids.md
 */

/** Milliseconds since Unix epoch at 2015-01-01T00:00:00.000Z */
export const ECHO_SNOWFLAKE_EPOCH_MS = 1420070400000;

/** Inclusive bounds for decimal string length (tune only with ADR revision). */
export const ECHO_PUBLIC_ID_MIN_LEN = 15;
export const ECHO_PUBLIC_ID_MAX_LEN = 22;

const DIGITS_ONLY = /^\d+$/;

export function isEchoPublicId(id: string | null | undefined): boolean {
  if (id == null || typeof id !== 'string') return false;
  const s = id.trim();
  if (s.length < ECHO_PUBLIC_ID_MIN_LEN || s.length > ECHO_PUBLIC_ID_MAX_LEN)
    return false;
  if (!DIGITS_ONLY.test(s)) return false;
  if (s.length > 1 && s.startsWith('0')) return false;
  return true;
}

/** Total ordering for snowflake decimal strings (numeric, not lexicographic). */
export function compareEchoPublicId(a: string, b: string): number {
  const ba = BigInt(a);
  const bb = BigInt(b);
  if (ba < bb) return -1;
  if (ba > bb) return 1;
  return 0;
}

export function parseSnowflakeTime(id: string): Date | null {
  if (!isEchoPublicId(id)) return null;
  try {
    const n = BigInt(id);
    const ts = (n >> 22n) + BigInt(ECHO_SNOWFLAKE_EPOCH_MS);
    const ms = Number(ts);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms);
  } catch {
    return null;
  }
}

export type SnowflakeGeneratorHooks = {
  /** Called each time the generator blocks until the next millisecond. */
  onWaitNextMs?: () => void;
  /** Called with the sequence value (0–4095) used for this id. */
  onEmitSequence?: (sequence: number) => void;
};

export type SnowflakeGeneratorOptions = {
  workerId: number;
  datacenterId?: number;
  /** Injectable clock (tests). */
  now?: () => number;
} & SnowflakeGeneratorHooks;

/**
 * Factory for a process-local monotonic generator (one instance per worker).
 */
export function createSnowflakeGenerator(
  options: SnowflakeGeneratorOptions,
): () => string {
  const dc = Math.max(0, Math.min(31, Math.floor(options.datacenterId ?? 1)));
  const worker = Math.max(0, Math.min(31, Math.floor(options.workerId)));
  const nowFn = options.now ?? (() => Date.now());

  let sequence = 0;
  let lastTimestamp = -1;

  return (): string => {
    let timestamp = nowFn();

    if (timestamp < lastTimestamp) {
      while (nowFn() < lastTimestamp) {
        /* spin — clock must catch up */
      }
      timestamp = nowFn();
    }

    if (timestamp === lastTimestamp) {
      sequence += 1;
      if (sequence > 0xfff) {
        options.onWaitNextMs?.();
        while (nowFn() <= lastTimestamp) {
          /* wait for next ms */
        }
        timestamp = nowFn();
        sequence = 0;
      }
    } else {
      sequence = 0;
    }

    lastTimestamp = timestamp;
    options.onEmitSequence?.(sequence);

    const delta = BigInt(timestamp - ECHO_SNOWFLAKE_EPOCH_MS);
    const id =
      (delta << 22n) |
      (BigInt(dc) << 17n) |
      (BigInt(worker) << 12n) |
      BigInt(sequence);

    const out = id.toString(10);
    if (!isEchoPublicId(out)) {
      throw new Error(`snowflake: generated id failed contract check: ${out}`);
    }
    return out;
  };
}
