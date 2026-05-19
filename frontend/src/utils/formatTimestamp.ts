import {
  formatRelativeTimestampWithPreferences,
  formatTimeWithPreferences,
} from '@/features/settings/timeLanguagePreferences';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Local calendar date as YYYY/MM/DD (year-first ISO order; `/` separators — not locale `DD.MM.YY` etc.).
 */
export function formatIsoCalendarDateLocal(d: Date): string {
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

/** Local date + short time for settings and system strings when no other format is specified. */
export function formatIsoDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const t = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${formatIsoCalendarDateLocal(d)} ${t}`;
}

/**
 * Format ISO timestamp for chat display:
 * — Today: "Today at" time
 * — Yesterday / older: long date + time without "at"
 */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return 'Invalid date';
  }
  return formatRelativeTimestampWithPreferences(d);
}

/** Short time label (e.g. continuation gutter) using current time preferences. */
export function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatTimeWithPreferences(d);
}
