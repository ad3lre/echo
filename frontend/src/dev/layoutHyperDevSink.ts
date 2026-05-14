import { isEchoLayoutHyperLogEnabled } from '@/utils/panelDiagEnabled';

const DEV_CONSOLE_LOG_ENDPOINT = '/__dev/console-log';

let mirrorPostingFailed = false;

function safeSerialize(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? '',
    };
  }
  if (Array.isArray(value)) {
    if (depth >= 2) return value.map((item) => String(item));
    return value.slice(0, 20).map((item) => safeSerialize(item, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= 2) return String(value);
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = safeSerialize(nested, depth + 1);
    }
    return out;
  }
  return String(value);
}

/**
 * POST layout hyper-log payloads to the local dev log file endpoint (same as
 * `consoleLogRecorder`). Safe on prod: failures are ignored; use when debugging
 * against a real hostname with a dev server proxying `/__dev/*`.
 */
export function mirrorLayoutHyperLogToDevEndpoint(
  message: string,
  payload: Record<string, unknown>,
): void {
  if (mirrorPostingFailed || typeof fetch !== 'function') return;
  if (!isEchoLayoutHyperLogEnabled()) return;
  void fetch(DEV_CONSOLE_LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn' as const,
      kind: 'console' as const,
      message,
      details: [safeSerialize(payload)],
      href: typeof window !== 'undefined' ? window.location.href : '',
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    }),
    keepalive: true,
  }).catch(() => {
    mirrorPostingFailed = true;
  });
}
