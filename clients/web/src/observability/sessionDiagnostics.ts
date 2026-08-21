import type {
  DiagnosticDomain,
  DiagnosticEvent,
  DiagnosticLevel,
  DiagnosticStage,
} from '@shared/diagnostics';
import { createDiagnosticEvent } from '@shared/diagnostics';

const INGEST_PATH = '/api/v1/dev/diagnostics/ingest';
const FLUSH_MS = 1500;
const MAX_BATCH = 80;
const SUCCESS_SAMPLE_RATE = (() => {
  const raw = String(
    import.meta.env.VITE_DIAG_SAMPLE_SUCCESS_RATE ?? '',
  ).trim();
  if (!raw) return 0.25;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.25;
  return Math.max(0, Math.min(1, n));
})();
const COALESCE_WINDOW_MS = (() => {
  const raw = String(import.meta.env.VITE_DIAG_COALESCE_WINDOW_MS ?? '').trim();
  if (!raw) return 1500;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1500;
  return Math.max(0, Math.floor(n));
})();

let queue: DiagnosticEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const pendingCoalesced = new Map<
  string,
  { event: DiagnosticEvent; count: number; firstTsMs: number; lastTsMs: number }
>();

function isLocalhostHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

export function diagnosticsEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  return isLocalhostHost(window.location.hostname);
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newTraceId(): string {
  return newId('trace');
}

export function newSpanId(): string {
  return newId('span');
}

async function flushNow(): Promise<void> {
  if (!diagnosticsEnabled()) return;
  flushCoalescedToQueue();
  if (queue.length === 0) return;
  const batch = queue.slice(0, MAX_BATCH);
  queue = queue.slice(batch.length);
  try {
    await fetch(INGEST_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // Silent by design — diagnostics must never affect primary UX.
  }
  if (queue.length > 0) scheduleFlush();
}

function scheduleFlush(): void {
  if (timer != null) return;
  timer = setTimeout(() => {
    timer = null;
    void flushNow();
  }, FLUSH_MS);
}

export function emitDiagnostic(params: {
  level: DiagnosticLevel;
  domain: DiagnosticDomain;
  event: string;
  stage?: DiagnosticStage;
  status?: string;
  durationMs?: number;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  chainKey?: string;
  context?: Record<string, unknown>;
  error?: { code?: string; message?: string; stack?: string };
}): void {
  if (!diagnosticsEnabled()) return;
  const ev = createDiagnosticEvent({
    source: 'frontend',
    ...params,
  });
  enqueueWithOptimization(ev);
  if (queue.length >= MAX_BATCH) {
    void flushNow();
    return;
  }
  scheduleFlush();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (!diagnosticsEnabled()) return;
    flushCoalescedToQueue();
    if (queue.length === 0) return;
    try {
      const payload = JSON.stringify({ events: queue.slice(0, MAX_BATCH) });
      navigator.sendBeacon(
        INGEST_PATH,
        new Blob([payload], { type: 'application/json' }),
      );
    } catch {
      // ignore
    }
  });
}

function isLosslessRequired(ev: DiagnosticEvent): boolean {
  if (ev.level === 'warn' || ev.level === 'error') return true;
  if (ev.stage === 'fail') return true;
  if (ev.error != null) return true;
  return false;
}

function isOptimizableSuccess(ev: DiagnosticEvent): boolean {
  if (isLosslessRequired(ev)) return false;
  if (ev.level !== 'info') return false;
  return ev.stage === 'success' || ev.stage === 'end';
}

function sampleGroupFor(ev: DiagnosticEvent): string {
  const method = String(ev.context?.method ?? '');
  const path = String(ev.context?.path ?? '');
  return `${ev.source}|${ev.domain}|${ev.event}|${ev.stage ?? ''}|${method}|${path}`;
}

function withSampleContext(ev: DiagnosticEvent): DiagnosticEvent {
  return createDiagnosticEvent({
    ...ev,
    context: {
      ...(ev.context ?? {}),
      sampled: true,
      sampleRate: SUCCESS_SAMPLE_RATE,
      sampleGroup: sampleGroupFor(ev),
    },
  });
}

function coalesceKey(ev: DiagnosticEvent): string {
  return JSON.stringify({
    source: ev.source,
    level: ev.level,
    domain: ev.domain,
    event: ev.event,
    stage: ev.stage ?? '',
    status: ev.status ?? '',
    method: ev.context?.method ?? '',
    path: ev.context?.path ?? '',
  });
}

function flushCoalescedToQueue(): void {
  for (const [, entry] of pendingCoalesced) {
    if (entry.count <= 1) {
      queue.push(entry.event);
      continue;
    }
    queue.push(
      createDiagnosticEvent({
        ...entry.event,
        context: {
          ...(entry.event.context ?? {}),
          count: entry.count,
          sampled: true,
          windowMs: Math.max(0, entry.lastTsMs - entry.firstTsMs),
        },
      }),
    );
  }
  pendingCoalesced.clear();
}

function enqueueWithOptimization(ev: DiagnosticEvent): void {
  if (!isOptimizableSuccess(ev)) {
    flushCoalescedToQueue();
    queue.push(ev);
    return;
  }
  if (Math.random() >= SUCCESS_SAMPLE_RATE) return;
  const sampled = withSampleContext(ev);
  const key = coalesceKey(sampled);
  const nowMs = Date.now();
  const existing = pendingCoalesced.get(key);
  if (existing && nowMs - existing.lastTsMs <= COALESCE_WINDOW_MS) {
    existing.count += 1;
    existing.lastTsMs = nowMs;
    return;
  }
  pendingCoalesced.set(key, {
    event: sampled,
    count: 1,
    firstTsMs: nowMs,
    lastTsMs: nowMs,
  });
}
