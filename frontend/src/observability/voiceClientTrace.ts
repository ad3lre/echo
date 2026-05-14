import {
  isBugHunterRecordingEnabled,
  pushBugHunterEntry,
  sanitizeBugHunterMeta,
} from './bugHunterTrace';
import { emitDiagnostic } from './sessionDiagnostics';

const STORAGE_KEY = 'echo_vc_verbose';

function envVerbose(): boolean {
  const v = import.meta.env.VITE_ECHO_VC_VERBOSE;
  return v === 'true' || v === '1' || v === 'yes';
}

function storageVerbose(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === '1' || v === 'true' || v === 'yes';
  } catch {
    return false;
  }
}

export function isVoiceClientVerbose(): boolean {
  return envVerbose() || storageVerbose();
}

export function jwtMetaForClientLog(jwt: string): {
  jwtParts: number;
  tokenChars: number;
} {
  return { jwtParts: jwt.split('.').length, tokenChars: jwt.length };
}

export function voiceClientTrace(
  msg: string,
  meta: Record<string, unknown> = {},
): void {
  emitDiagnostic({
    level: 'info',
    domain: 'voice',
    event: msg,
    stage: 'attempt',
    context: meta,
  });
  if (isBugHunterRecordingEnabled()) {
    pushBugHunterEntry({
      kind: 'voice',
      event: msg,
      meta: sanitizeBugHunterMeta({ ...meta, vcTrace: true }),
    });
  }
}

export type VoiceClientDiagLevel = 'debug' | 'info' | 'warn' | 'error';

export function voiceClientDiag(
  level: VoiceClientDiagLevel,
  msg: string,
  meta: Record<string, unknown> = {},
): void {
  emitDiagnostic({
    level,
    domain: 'voice',
    event: msg,
    stage: level === 'error' ? 'fail' : 'attempt',
    context: meta,
  });
  if (isBugHunterRecordingEnabled()) {
    pushBugHunterEntry({
      kind: 'voice',
      event: msg,
      meta: sanitizeBugHunterMeta({ ...meta, vcDiagLevel: level }),
    });
  }
}
