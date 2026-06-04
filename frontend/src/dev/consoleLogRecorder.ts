const DEV_CONSOLE_LOG_ENDPOINT = '/__dev/console-log';
import { isDesktop } from '@/platform/desktopBridge';

type ConsoleIssueLevel = 'warn' | 'error';
type ConsoleIssueKind = 'console' | 'window_error' | 'unhandled_rejection';

type ConsoleIssuePayload = {
  timestamp: string;
  level: ConsoleIssueLevel;
  kind: ConsoleIssueKind;
  message: string;
  details?: unknown[];
  href?: string;
  userAgent?: string;
};

const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);

const SENSITIVE_LOG_KEY =
  /^(password|passwd|secret|token|accessToken|refreshToken|authorization|csrf|mfaToken|recoveryCode|apiKey|jwt|cookie|handoff|code|nonce)$/i;

let recorderInstalled = false;
let isPostingFailure = false;
let isDesktopInvokeFailure = false;

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
    return value.slice(0, 10).map((item) => safeSerialize(item, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= 2) return String(value);
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = SENSITIVE_LOG_KEY.test(key)
        ? '[REDACTED]'
        : safeSerialize(nested, depth + 1);
    }
    return out;
  }
  return String(value);
}

function toMessage(args: unknown[]): string {
  for (const arg of args) {
    if (arg instanceof Error && arg.message.trim()) return arg.message.trim();
    if (typeof arg === 'string' && arg.trim()) return arg.trim();
  }
  return args
    .map((arg) => {
      const serialized = safeSerialize(arg);
      return typeof serialized === 'string'
        ? serialized
        : JSON.stringify(serialized);
    })
    .join(' ')
    .trim();
}

function postConsoleIssue(payload: ConsoleIssuePayload): void {
  if (isDesktop()) {
    if (isDesktopInvokeFailure) return;
    void import('@tauri-apps/api/core')
      .then(({ invoke }) =>
        invoke('log_frontend_event', {
          payload,
        }),
      )
      .catch(() => {
        isDesktopInvokeFailure = true;
        originalWarn(
          '[desktop-log] Failed to invoke log_frontend_event; disabling recorder posts for this session.',
        );
      });
    return;
  }

  if (isPostingFailure || typeof fetch !== 'function') return;
  void fetch(DEV_CONSOLE_LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    isPostingFailure = true;
    originalWarn(
      '[dev-console-log] Failed to write to console-log.json; disabling recorder posts for this session.',
    );
  });
}

function reportConsoleIssue(
  level: ConsoleIssueLevel,
  kind: ConsoleIssueKind,
  args: unknown[],
): void {
  const message = toMessage(args);
  if (!message) return;
  postConsoleIssue({
    timestamp: new Date().toISOString(),
    level,
    kind,
    message,
    details: args.map((arg) => safeSerialize(arg)),
    href: typeof window !== 'undefined' ? window.location.href : '',
    userAgent:
      typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  });
}

export function installDevConsoleLogRecorder(): void {
  if (recorderInstalled || typeof window === 'undefined') return;
  if (!import.meta.env.DEV && !isDesktop()) return;
  recorderInstalled = true;

  console.warn = (...args: unknown[]) => {
    reportConsoleIssue('warn', 'console', args);
    originalWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    reportConsoleIssue('error', 'console', args);
    originalError(...args);
  };

  window.addEventListener('error', (event) => {
    const details: unknown[] = [];
    if (event.filename) details.push({ filename: event.filename });
    if (event.lineno || event.colno) {
      details.push({ line: event.lineno, column: event.colno });
    }
    if (event.error) details.push(event.error);
    reportConsoleIssue('error', 'window_error', [
      event.message || 'Uncaught window error',
      ...details,
    ]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportConsoleIssue('error', 'unhandled_rejection', [
      'Unhandled promise rejection',
      event.reason,
    ]);
  });
}
