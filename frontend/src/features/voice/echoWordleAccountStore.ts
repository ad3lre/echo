import { wordlineDailyCalendarKey } from '@/features/voice/wordline/wordlineDailyCalendar';

const STORAGE_PREFIX = 'echo.wordle.v1';

export function echoWordleAccountStorageKey(
  userId: string | null | undefined,
): string {
  const u = userId?.trim();
  return u ? `${STORAGE_PREFIX}:u:${u}` : `${STORAGE_PREFIX}:guest`;
}

export type EchoWordleCellPersistState =
  | 'empty'
  | 'tbd'
  | 'correct'
  | 'present'
  | 'absent';

export type EchoWordleDailyPersist = {
  dayKey: string;
  status: 'playing' | 'won' | 'lost';
  currentRow: number;
  currentCol: number;
  grid: { letter: string; state: EchoWordleCellPersistState }[][];
};

type EchoWordleAccountBlob = {
  /** After finishing a daily on this calendar day, remind once after that day passes. */
  pendingReminderAfterCompletionDay: string | null;
  dailyByDay: Record<string, EchoWordleDailyPersist>;
};

function emptyBlob(): EchoWordleAccountBlob {
  return {
    pendingReminderAfterCompletionDay: null,
    dailyByDay: {},
  };
}

function readBlob(key: string): EchoWordleAccountBlob {
  if (typeof localStorage === 'undefined') return emptyBlob();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return emptyBlob();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return emptyBlob();
    }
    const o = parsed as Partial<EchoWordleAccountBlob>;
    const dailyByDay =
      o.dailyByDay &&
      typeof o.dailyByDay === 'object' &&
      !Array.isArray(o.dailyByDay)
        ? (o.dailyByDay as Record<string, EchoWordleDailyPersist>)
        : {};
    return {
      pendingReminderAfterCompletionDay:
        typeof o.pendingReminderAfterCompletionDay === 'string'
          ? o.pendingReminderAfterCompletionDay
          : null,
      dailyByDay,
    };
  } catch {
    return emptyBlob();
  }
}

function writeBlob(key: string, blob: EchoWordleAccountBlob) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(blob));
  } catch {
    // ignore quota / private mode
  }
}

export function wordleDayKeyLocalMs(dayKey: string): number {
  const parts = dayKey.split('-');
  if (parts.length !== 3) return 0;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
    return 0;
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

export function isWordleCalendarDayAfter(
  aDayKey: string,
  bDayKey: string,
): boolean {
  return wordleDayKeyLocalMs(aDayKey) > wordleDayKeyLocalMs(bDayKey);
}

export function loadEchoWordleDaily(
  storageKey: string,
  dayKey: string,
): EchoWordleDailyPersist | null {
  const blob = readBlob(storageKey);
  const row = blob.dailyByDay[dayKey];
  return row && typeof row === 'object' ? row : null;
}

export function saveEchoWordleDaily(
  storageKey: string,
  payload: EchoWordleDailyPersist,
) {
  const blob = readBlob(storageKey);
  blob.dailyByDay[payload.dayKey] = payload;
  writeBlob(storageKey, blob);
}

export function markEchoWordleDailyCompleteForReminder(
  storageKey: string,
  completionDayKey: string,
) {
  const blob = readBlob(storageKey);
  blob.pendingReminderAfterCompletionDay = completionDayKey;
  writeBlob(storageKey, blob);
}

/**
 * If the user finished a daily on an earlier calendar day, show a one-time toast
 * and clear the pending flag.
 */
export function consumeEchoWordleNextDayReminder(storageKey: string): boolean {
  const blob = readBlob(storageKey);
  const pending = blob.pendingReminderAfterCompletionDay?.trim();
  if (!pending) return false;
  const today = wordlineDailyCalendarKey(new Date());
  if (!isWordleCalendarDayAfter(today, pending)) return false;
  blob.pendingReminderAfterCompletionDay = null;
  writeBlob(storageKey, blob);
  return true;
}
