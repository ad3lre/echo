/**
 * In-memory ring buffer for Bug Hunter mode. Bounded size; no PII-heavy payloads.
 */

const MAX_ENTRIES = 400;
const MAX_META_KEYS = 32;
const MAX_ARRAY_ITEMS = 16;
const MAX_DEPTH = 4;
const MAX_STRING_CHARS = 800;
const REDACTED = '[redacted]';
const SENSITIVE_VALUE = '[value]';

const SAFE_TOKEN_META_KEYS = new Set(['jwtParts', 'tokenChars']);
const SENSITIVE_KEY_PARTS = [
  'authorization',
  'apikey',
  'cookie',
  'credential',
  'jwt',
  'password',
  'secret',
  'sessionid',
  'token',
];
const BEARER_VALUE_RE = /\bBearer\s+[-._~+/=A-Za-z0-9]{8,}\b/gi;
const JWT_VALUE_RE =
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;
const SENSITIVE_QUERY_VALUE_RE =
  /([?&](?:access_?token|api_?key|authorization|jwt|password|refresh_?token|secret|token)=)[^&#\s]+/gi;

export type BugHunterTraceEntry = {
  t: string;
  kind: 'socket' | 'http' | 'app' | 'voice';
  event: string;
  meta?: Record<string, unknown>;
};

let recordingEnabled = false;
const entries: BugHunterTraceEntry[] = [];

function keyLooksSensitive(key: string): boolean {
  if (SAFE_TOKEN_META_KEYS.has(key)) return false;
  const compact = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_PARTS.some((part) => compact.includes(part));
}

function redactSensitiveText(value: string): string {
  return value
    .replace(BEARER_VALUE_RE, 'Bearer [redacted]')
    .replace(JWT_VALUE_RE, '[redacted:jwt]')
    .replace(SENSITIVE_QUERY_VALUE_RE, '$1[redacted]');
}

function trimString(value: string): string {
  const redacted = redactSensitiveText(value);
  return redacted.length > MAX_STRING_CHARS
    ? `${redacted.slice(0, MAX_STRING_CHARS)}...`
    : redacted;
}

function sanitizeValue(
  key: string,
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (keyLooksSensitive(key)) return REDACTED;
  if (value == null) return value;
  if (typeof value === 'string') return trimString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'symbol' || typeof value === 'function') {
    return SENSITIVE_VALUE;
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return '[array]';
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue('', item, depth + 1, seen));
  }
  if (typeof value === 'object') {
    if (depth >= MAX_DEPTH) return '[object]';
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value).slice(0, MAX_META_KEYS);
    for (const k of keys) {
      const sanitized = sanitizeValue(
        k,
        (value as Record<string, unknown>)[k],
        depth + 1,
        seen,
      );
      if (typeof sanitized !== 'undefined') out[k] = sanitized;
    }
    seen.delete(value);
    return out;
  }
  return SENSITIVE_VALUE;
}

export function sanitizeBugHunterMeta(
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  const keys = Object.keys(meta).slice(0, MAX_META_KEYS);
  const seen = new WeakSet<object>();
  for (const k of keys) {
    const sanitized = sanitizeValue(k, meta[k], 0, seen);
    if (typeof sanitized !== 'undefined') out[k] = sanitized;
  }
  return Object.keys(out).length ? out : undefined;
}

export function setBugHunterRecordingEnabled(enabled: boolean): void {
  recordingEnabled = enabled;
}

export function isBugHunterRecordingEnabled(): boolean {
  return recordingEnabled;
}

export function clearBugHunterTrace(): void {
  entries.length = 0;
}

export function pushBugHunterEntry(
  entry: Omit<BugHunterTraceEntry, 't'>,
): void {
  if (!recordingEnabled) return;
  const e: BugHunterTraceEntry = {
    t: new Date().toISOString(),
    kind: entry.kind,
    event: entry.event,
    meta: sanitizeBugHunterMeta(entry.meta),
  };
  entries.push(e);
  while (entries.length > MAX_ENTRIES) entries.shift();
}

export function getBugHunterTracePayload(): {
  entries: BugHunterTraceEntry[];
} {
  return { entries: entries.map((x) => ({ ...x })) };
}

/** Returns JSON length; used to avoid unbounded payloads on submit. */
export function estimateBugHunterTraceJsonSize(): number {
  try {
    return JSON.stringify(getBugHunterTracePayload()).length;
  } catch {
    return entries.length * 100;
  }
}

export function trimTraceIfNeededForSubmit(maxChars: number): {
  entries: BugHunterTraceEntry[];
  truncated: boolean;
} {
  const payload = getBugHunterTracePayload();
  const j = JSON.stringify(payload);
  if (j.length <= maxChars)
    return { entries: payload.entries, truncated: false };
  const ratio = maxChars / j.length;
  const keep = Math.max(1, Math.floor(payload.entries.length * ratio * 0.95));
  const sliced = payload.entries.slice(-keep);
  return {
    entries: sliced,
    truncated: true,
  };
}
