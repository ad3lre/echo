export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';
export type DiagnosticSource = 'frontend' | 'backend';
export type DiagnosticDomain =
  | 'api'
  | 'socket'
  | 'ui'
  | 'voice'
  | 'perm'
  | 'nav'
  | 'chat'
  | 'perf';
export type DiagnosticStage = 'start' | 'attempt' | 'success' | 'fail' | 'end';

export type DiagnosticError = {
  code?: string;
  message?: string;
  stack?: string;
};

export type DiagnosticEvent = {
  ts: string;
  level: DiagnosticLevel;
  source: DiagnosticSource;
  domain: DiagnosticDomain;
  sessionId?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  chainKey?: string;
  event: string;
  stage?: DiagnosticStage;
  status?: string;
  durationMs?: number;
  context?: Record<string, unknown>;
  error?: DiagnosticError;
};

export const DIAGNOSTIC_SENSITIVE_KEYS = [
  'token',
  'secret',
  'password',
  'authorization',
  'cookie',
] as const;

const CONTEXT_ALLOWLIST = new Set([
  'method',
  'path',
  'route',
  'status',
  'statusCode',
  'ok',
  'durationMs',
  'retry',
  'attempt',
  'channelId',
  'before',
  'messageId',
  'serverId',
  'userId',
  'action',
  'reason',
  'code',
  'detail',
  'host',
  'origin',
  'transport',
  'connected',
  'flow',
  'phase',
  'component',
  'name',
  'count',
  'size',
  'bytes',
  'limit',
  'resultCount',
  'messageCount',
  'accessMs',
  'listMs',
  'totalMs',
  'queryMs',
  'pollMs',
  'reactionsMs',
  'authorsMs',
  'sampled',
  // Voice / LiveKit audio diagnostics
  'identity',
  'trackSid',
  'source',
  'isSubscribed',
  'isMuted',
  'deafened',
  'hasMediaStreamTrack',
  'hasTrack',
  'mstReadyState',
  'mstEnabled',
  'mstMuted',
  'canPlaybackAudio',
  'outputVolume',
  'remoteParticipants',
  'audioTracks',
  'tracks',
  'label',
  'localLevel',
  'localSpeaking',
  'remoteSpeakerCount',
  'remoteSpeakers',
  'localId',
  'note',
  'isMic',
  'eventVerb',
  // Generic helpers used in many diagnostics
  'sampleRate',
  'windowMs',
  'err',
  'connectionState',
  'gain',
  'hasSetVolume',
]);

function hasSensitiveKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return DIAGNOSTIC_SENSITIVE_KEYS.some((s) => lowered.includes(s));
}

function serializeValue(input: unknown): unknown {
  if (
    input == null ||
    typeof input === 'string' ||
    typeof input === 'number' ||
    typeof input === 'boolean'
  ) {
    return input;
  }
  if (Array.isArray(input)) {
    return input.slice(0, 16).map((v) => serializeValue(v));
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (hasSensitiveKey(k)) continue;
      out[k] = serializeValue(v);
    }
    return out;
  }
  return String(input);
}

/**
 * Allowlist-first sanitizer. Unknown keys are dropped.
 * Sensitive keys are always stripped (denylist fallback).
 */
export function sanitizeContext(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    if (hasSensitiveKey(k)) continue;
    if (!CONTEXT_ALLOWLIST.has(k)) continue;
    out[k] = serializeValue(v);
  }
  return Object.keys(out).length ? out : undefined;
}

export function createDiagnosticEvent(
  base: Omit<DiagnosticEvent, 'ts' | 'context'> & {
    context?: Record<string, unknown>;
  },
): DiagnosticEvent {
  return {
    ...base,
    ts: new Date().toISOString(),
    context: sanitizeContext(base.context),
  };
}
