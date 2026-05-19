import { randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { DiagnosticEvent } from '../../../shared/diagnostics';
import { createDiagnosticEvent } from '../../../shared/diagnostics';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_SESSION_BYTES = 200 * 1024 * 1024;

type FileKind = 'frontend_events' | 'backend_events' | 'spans';
type CoalesceEntry = {
  event: DiagnosticEvent;
  count: number;
  firstTsMs: number;
  lastTsMs: number;
};
type WriterState = {
  rootDir: string;
  sessionId: string;
  sessionDir: string;
  startTime: string;
  bytesByKind: Record<FileKind, number>;
  segmentByKind: Record<FileKind, number>;
  totalBytes: number;
  initialized: boolean;
  pendingCoalescedByKind: Record<FileKind, Map<string, CoalesceEntry>>;
};

const state: WriterState = {
  rootDir: '',
  sessionId: '',
  sessionDir: '',
  startTime: '',
  bytesByKind: { frontend_events: 0, backend_events: 0, spans: 0 },
  segmentByKind: { frontend_events: 1, backend_events: 1, spans: 1 },
  totalBytes: 0,
  initialized: false,
  pendingCoalescedByKind: {
    frontend_events: new Map<string, CoalesceEntry>(),
    backend_events: new Map<string, CoalesceEntry>(),
    spans: new Map<string, CoalesceEntry>(),
  },
};

const SUCCESS_SAMPLE_RATE = (() => {
  const raw = process.env.DIAG_SAMPLE_SUCCESS_RATE?.trim();
  if (!raw) return 0.25;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.25;
  return Math.max(0, Math.min(1, n));
})();
const COALESCE_WINDOW_MS = (() => {
  const raw = process.env.DIAG_COALESCE_WINDOW_MS?.trim();
  if (!raw) return 1500;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1500;
  return Math.max(0, Math.floor(n));
})();
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

function shouldKeepSampledSuccess(ev: DiagnosticEvent): boolean {
  const group = sampleGroupFor(ev);
  // Keep certain flow anchors 100% for easier chain reads.
  if (group.includes('|api|http_request|start|')) return true;
  if (group.includes('|api|http_response|fail|')) return true;
  return Math.random() < SUCCESS_SAMPLE_RATE;
}

function withSampleContext(ev: DiagnosticEvent): DiagnosticEvent {
  const group = sampleGroupFor(ev);
  return createDiagnosticEvent({
    ...ev,
    context: {
      ...(ev.context ?? {}),
      sampled: true,
      sampleRate: SUCCESS_SAMPLE_RATE,
      sampleGroup: group,
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

function sessionStamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
}

function shortId(): string {
  return randomBytes(4).toString('hex');
}

function segmentPath(kind: FileKind): string {
  const seg = String(state.segmentByKind[kind]).padStart(3, '0');
  return path.join(state.sessionDir, `${kind}_${seg}.jsonl`);
}

function eventLine(ev: DiagnosticEvent): string {
  return `${JSON.stringify(ev)}\n`;
}

async function writeManifest(end?: { endTime: string; status: string }) {
  const manifestPath = path.join(state.sessionDir, 'manifest.json');
  const payload = {
    sessionId: state.sessionId,
    startTime: state.startTime,
    ...(end ?? {}),
    pid: process.pid,
    nodeEnv: process.env.NODE_ENV ?? '',
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? '',
    gitDirty: process.env.GIT_DIRTY === 'true',
    appVersion: process.env.npm_package_version ?? '',
  };
  await fs.writeFile(manifestPath, JSON.stringify(payload, null, 2), 'utf8');
}

async function updateIndex(
  rootDir: string,
  sessionId: string,
  sessionDir: string,
) {
  const indexPath = path.join(rootDir, 'index.json');
  let existing: Array<Record<string, unknown>> = [];
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) existing = parsed;
  } catch {
    existing = [];
  }
  existing.push({
    sessionId,
    sessionDir,
    startedAt: state.startTime,
    pid: process.pid,
  });
  await fs.writeFile(
    indexPath,
    JSON.stringify(existing.slice(-200), null, 2),
    'utf8',
  );
}

export async function initSessionDiagnostics(rootDir: string): Promise<void> {
  if (state.initialized) return;
  const sessionId = `session_${sessionStamp()}_${shortId()}`;
  const sessionDir = path.join(rootDir, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  state.rootDir = rootDir;
  state.sessionId = sessionId;
  state.sessionDir = sessionDir;
  state.startTime = new Date().toISOString();
  state.initialized = true;
  await writeManifest();
  await updateIndex(rootDir, sessionId, sessionDir);
}

export function getSessionDiagnosticsState(): {
  enabled: boolean;
  sessionId: string;
  sessionDir: string;
} {
  return {
    enabled: state.initialized,
    sessionId: state.sessionId,
    sessionDir: state.sessionDir,
  };
}

async function appendKind(kind: FileKind, ev: DiagnosticEvent): Promise<void> {
  if (!state.initialized) return;
  const line = eventLine(ev);
  const lineBytes = Buffer.byteLength(line, 'utf8');
  if (state.totalBytes + lineBytes > MAX_SESSION_BYTES) return;
  if (state.bytesByKind[kind] + lineBytes > MAX_FILE_BYTES) {
    state.segmentByKind[kind] += 1;
    state.bytesByKind[kind] = 0;
  }
  await fs.appendFile(segmentPath(kind), line, 'utf8');
  state.bytesByKind[kind] += lineBytes;
  state.totalBytes += lineBytes;
}

async function flushCoalescedKind(kind: FileKind): Promise<void> {
  const pending = state.pendingCoalescedByKind[kind];
  if (pending.size === 0) return;
  for (const [, entry] of pending) {
    const base = entry.event;
    const out =
      entry.count > 1
        ? createDiagnosticEvent({
            ...base,
            context: {
              ...(base.context ?? {}),
              count: entry.count,
              sampled: true,
              windowMs: Math.max(0, entry.lastTsMs - entry.firstTsMs),
            },
          })
        : base;
    await appendKind(kind, out);
  }
  pending.clear();
}

async function flushAllCoalesced(): Promise<void> {
  await flushCoalescedKind('frontend_events');
  await flushCoalescedKind('backend_events');
  await flushCoalescedKind('spans');
}

async function appendWithOptimization(
  kind: FileKind,
  ev: DiagnosticEvent,
): Promise<void> {
  if (!isOptimizableSuccess(ev)) {
    await flushCoalescedKind(kind);
    await appendKind(kind, ev);
    return;
  }
  if (!shouldKeepSampledSuccess(ev)) return;
  const sampled = withSampleContext(ev);
  const key = coalesceKey(sampled);
  const nowMs = Date.now();
  const pending = state.pendingCoalescedByKind[kind];
  const existing = pending.get(key);
  if (existing && nowMs - existing.lastTsMs <= COALESCE_WINDOW_MS) {
    existing.count += 1;
    existing.lastTsMs = nowMs;
    return;
  }
  if (existing) {
    const out = createDiagnosticEvent({
      ...existing.event,
      context: {
        ...(existing.event.context ?? {}),
        count: existing.count,
        sampled: true,
        windowMs: Math.max(0, existing.lastTsMs - existing.firstTsMs),
      },
    });
    await appendKind(kind, out);
  }
  pending.set(key, {
    event: sampled,
    count: 1,
    firstTsMs: nowMs,
    lastTsMs: nowMs,
  });
}

export async function appendBackendDiagnostic(
  base: Omit<DiagnosticEvent, 'ts' | 'source'>,
): Promise<void> {
  if (!state.initialized) return;
  const ev = createDiagnosticEvent({
    ...base,
    source: 'backend',
    sessionId: state.sessionId,
  });
  await appendWithOptimization('backend_events', ev);
  await appendWithOptimization('spans', ev);
}

export async function appendFrontendDiagnosticBatch(
  events: DiagnosticEvent[],
): Promise<void> {
  if (!state.initialized || events.length === 0) return;
  for (const incoming of events) {
    const ev = createDiagnosticEvent({
      ...incoming,
      source: 'frontend',
      sessionId: state.sessionId,
    });
    await appendWithOptimization('frontend_events', ev);
    await appendWithOptimization('spans', ev);
  }
}

export async function closeSessionDiagnostics(status: 'closed' | 'crashed') {
  if (!state.initialized) return;
  await flushAllCoalesced();
  await writeManifest({ endTime: new Date().toISOString(), status });
}
