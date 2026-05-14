/**
 * Socket.IO client diagnostics. Structured entries go to Bug Hunter when recording;
 * console output removed.
 */

import {
  isBugHunterRecordingEnabled,
  pushBugHunterEntry,
} from './bugHunterTrace';
import { emitDiagnostic } from './sessionDiagnostics';

export function socketDiagInfo(
  event: string,
  meta: Record<string, unknown> = {},
): void {
  emitDiagnostic({
    level: 'info',
    domain: 'socket',
    event,
    stage: 'attempt',
    context: meta,
  });
  if (isBugHunterRecordingEnabled()) {
    pushBugHunterEntry({ kind: 'socket', event, meta });
  }
}

export function socketDiagWarn(
  event: string,
  meta: Record<string, unknown> = {},
): void {
  emitDiagnostic({
    level: 'warn',
    domain: 'socket',
    event,
    stage: 'fail',
    context: meta,
  });
  if (isBugHunterRecordingEnabled()) {
    pushBugHunterEntry({
      kind: 'socket',
      event,
      meta: { ...meta, level: 'warn' },
    });
  }
}

export function socketDiagError(
  event: string,
  meta: Record<string, unknown> = {},
): void {
  emitDiagnostic({
    level: 'error',
    domain: 'socket',
    event,
    stage: 'fail',
    context: meta,
  });
  if (isBugHunterRecordingEnabled()) {
    pushBugHunterEntry({
      kind: 'socket',
      event,
      meta: { ...meta, level: 'error' },
    });
  }
}

/** Dev-only extra line — no console; Bug Hunter only when recording. */
export function socketDiagDevWarn(
  event: string,
  meta: Record<string, unknown> = {},
): void {
  if (!import.meta.env.DEV) return;
  emitDiagnostic({
    level: 'warn',
    domain: 'socket',
    event,
    stage: 'attempt',
    context: meta,
  });
  if (isBugHunterRecordingEnabled()) {
    pushBugHunterEntry({
      kind: 'socket',
      event,
      meta: { ...meta, level: 'warn', devOnly: true },
    });
  }
}

/** Dev-only nested dump — Bug Hunter when recording. */
export function socketDiagDevDir(event: string, obj: unknown): void {
  if (!import.meta.env.DEV) return;
  emitDiagnostic({
    level: 'warn',
    domain: 'socket',
    event,
    stage: 'attempt',
    context: { detail: 'dev_dir', dump: obj },
  });
  if (isBugHunterRecordingEnabled()) {
    pushBugHunterEntry({
      kind: 'socket',
      event,
      meta: {
        level: 'warn',
        devOnly: true,
        detail:
          'message_failed diagnostics (userId, roles, perms, overrides, VIEW/SEND trace)',
        dump: obj,
      },
    });
  }
}
