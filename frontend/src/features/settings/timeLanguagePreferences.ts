export interface TimeLanguageOption {
  label: string;
  value: string;
}

export type SupportedEchoLocale = 'en-US' | 'en-GB';

export interface TimeLanguagePreferences {
  locale: SupportedEchoLocale;
  timeZone: string;
}

const STORAGE_KEY = 'echo-time-language-preferences-v1';
const DEFAULT_LOCALE: SupportedEchoLocale = 'en-US';
const SUPPORTED_LOCALES: SupportedEchoLocale[] = ['en-US', 'en-GB'];

const FALLBACK_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
];

let cachedPreferences: TimeLanguagePreferences | null = null;
let cachedSupportedTimeZones: string[] | null = null;
let cachedRepresentativeTimeZonesByOffset: Map<string, string> | null = null;
const cachedNormalizedTimeZones = new Map<string, string>();
const cachedOffsetLabelsByTimeZone = new Map<string, string>();
const cachedOffsetLabelFormatters = new Map<string, Intl.DateTimeFormat>();
const cachedDateKeyFormatters = new Map<string, Intl.DateTimeFormat>();
const cachedTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const cachedDateLabelFormatters = new Map<string, Intl.DateTimeFormat>();
const cachedDateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function isSupportedLocale(value: unknown): value is SupportedEchoLocale {
  return (
    typeof value === 'string' && SUPPORTED_LOCALES.includes(value as never)
  );
}

function getSystemTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && typeof tz === 'string') return tz;
  } catch {
    /* ignore */
  }
  return 'UTC';
}

function getSupportedTimeZones(): string[] {
  if (cachedSupportedTimeZones) return cachedSupportedTimeZones;
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      const tzs = Intl.supportedValuesOf('timeZone');
      if (Array.isArray(tzs) && tzs.length > 0) {
        cachedSupportedTimeZones = [...tzs];
        return cachedSupportedTimeZones;
      }
    }
  } catch {
    /* ignore */
  }
  cachedSupportedTimeZones = [...FALLBACK_TIMEZONES];
  return cachedSupportedTimeZones;
}

function normalizeTimeZone(value: unknown): string {
  if (typeof value === 'string') {
    const cached = cachedNormalizedTimeZones.get(value);
    if (cached) return cached;
  }

  const zones = getSupportedTimeZones();
  const byOffset = representativeTimeZonesByOffset();
  if (typeof value === 'string') {
    if (zones.includes(value)) {
      const offset = timeZoneOffsetLabel(value);
      const normalized = byOffset.get(offset) ?? value;
      cachedNormalizedTimeZones.set(value, normalized);
      return normalized;
    }
    if (byOffset.has(value)) {
      const normalized = byOffset.get(value)!;
      cachedNormalizedTimeZones.set(value, normalized);
      return normalized;
    }
  }
  const system = getSystemTimeZone();
  if (zones.includes(system)) {
    const offset = timeZoneOffsetLabel(system);
    const normalized = byOffset.get(offset) ?? system;
    if (typeof value === 'string')
      cachedNormalizedTimeZones.set(value, normalized);
    return normalized;
  }
  const normalized = byOffset.get('UTC') ?? 'UTC';
  if (typeof value === 'string')
    cachedNormalizedTimeZones.set(value, normalized);
  return normalized;
}

function readStoredPreferences(): Partial<TimeLanguagePreferences> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<TimeLanguagePreferences>;
  } catch {
    return {};
  }
}

export function loadTimeLanguagePreferences(): TimeLanguagePreferences {
  if (cachedPreferences) return cachedPreferences;
  const stored = readStoredPreferences();
  const locale = isSupportedLocale(stored.locale)
    ? stored.locale
    : DEFAULT_LOCALE;
  const timeZone = normalizeTimeZone(stored.timeZone);
  cachedPreferences = { locale, timeZone };
  return cachedPreferences;
}

export function saveTimeLanguagePreferences(
  next: Partial<TimeLanguagePreferences>,
): TimeLanguagePreferences {
  const current = loadTimeLanguagePreferences();
  const merged: TimeLanguagePreferences = {
    locale: isSupportedLocale(next.locale) ? next.locale : current.locale,
    timeZone: normalizeTimeZone(next.timeZone ?? current.timeZone),
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
  }
  cachedPreferences = merged;
  return merged;
}

export function languageOptions(): TimeLanguageOption[] {
  return [
    { label: 'English (US)', value: 'en-US' },
    { label: 'English (UK)', value: 'en-GB' },
  ];
}

/**
 * Offset label for an instant in `timeZone` (e.g. UTC-5). Formatter is cached per zone;
 * the string is not cached so DST/history stays correct for message times.
 */
function formatTimeZoneOffsetForInstant(
  timeZone: string,
  instant: Date,
): string {
  try {
    let fmt = cachedOffsetLabelFormatters.get(timeZone);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'shortOffset',
        hour: '2-digit',
        minute: '2-digit',
      });
      cachedOffsetLabelFormatters.set(timeZone, fmt);
    }
    const parts = fmt.formatToParts(instant);
    const token = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (token?.trim()) {
      return token.replace('GMT', 'UTC');
    }
  } catch {
    /* ignore */
  }
  return 'UTC';
}

function timeZoneOffsetLabel(timeZone: string): string {
  const cached = cachedOffsetLabelsByTimeZone.get(timeZone);
  if (cached) return cached;
  const label = formatTimeZoneOffsetForInstant(timeZone, new Date());
  cachedOffsetLabelsByTimeZone.set(timeZone, label);
  return label;
}

export function timeZoneOptions(): TimeLanguageOption[] {
  const byOffset = representativeTimeZonesByOffset();
  const options = Array.from(byOffset.entries())
    .sort(([a], [b]) => offsetSortKey(a) - offsetSortKey(b))
    .map(([offset, zone]) => ({
      label: offset,
      value: zone,
    }));
  return options.length > 0 ? options : [{ label: 'UTC', value: 'UTC' }];
}

function representativeTimeZonesByOffset(): Map<string, string> {
  if (cachedRepresentativeTimeZonesByOffset) {
    return cachedRepresentativeTimeZonesByOffset;
  }
  const map = new Map<string, string>();
  for (const tz of getSupportedTimeZones()) {
    const offset = timeZoneOffsetLabel(tz);
    if (!map.has(offset)) map.set(offset, tz);
  }
  if (!map.has('UTC')) map.set('UTC', 'UTC');
  cachedRepresentativeTimeZonesByOffset = map;
  return cachedRepresentativeTimeZonesByOffset;
}

function offsetSortKey(offsetLabel: string): number {
  if (offsetLabel === 'UTC') return 0;
  const m = /^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(offsetLabel);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = Number(m[2] ?? 0);
  const minutes = Number(m[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

function toDateKey(date: Date, timeZone: string): string {
  let fmt = cachedDateKeyFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    cachedDateKeyFormatters.set(timeZone, fmt);
  }
  return fmt.format(date);
}

export function formatTimeWithPreferences(
  date: Date,
  timeZone?: string,
): string {
  const prefs = loadTimeLanguagePreferences();
  const locale = prefs.locale;
  const safeZone = normalizeTimeZone(timeZone ?? prefs.timeZone);
  const key = `${locale}::${safeZone}`;
  let fmt = cachedTimeFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, {
      timeZone: safeZone,
      hour: 'numeric',
      minute: '2-digit',
    });
    cachedTimeFormatters.set(key, fmt);
  }
  return fmt.format(date);
}

export function formatDateTimeWithPreferences(date: Date): string {
  const prefs = loadTimeLanguagePreferences();
  return formatDateTimeForSelection(prefs.locale, prefs.timeZone, date);
}

export function formatDateTimeForSelection(
  locale: SupportedEchoLocale,
  timeZone: string,
  date: Date,
): string {
  const safeZone = normalizeTimeZone(timeZone);
  const key = `${locale}::${safeZone}`;
  let fmt = cachedDateTimeFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, {
      timeZone: safeZone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    cachedDateTimeFormatters.set(key, fmt);
  }
  return fmt.format(date);
}

export function formatRelativeTimestampWithPreferences(date: Date): string {
  const prefs = loadTimeLanguagePreferences();
  const safeZone = normalizeTimeZone(prefs.timeZone);
  const now = new Date();
  const todayKey = toDateKey(now, safeZone);
  const yesterdayKey = toDateKey(new Date(now.getTime() - 864e5), safeZone);
  const dateKey = toDateKey(date, safeZone);
  const time = formatTimeWithPreferences(date, safeZone);
  if (dateKey === todayKey) return `Today at ${time}`;
  if (dateKey === yesterdayKey) return `Yesterday ${time}`;
  const dateLabelKey = `${prefs.locale}::${safeZone}`;
  let dateLabelFmt = cachedDateLabelFormatters.get(dateLabelKey);
  if (!dateLabelFmt) {
    dateLabelFmt = new Intl.DateTimeFormat(prefs.locale, {
      timeZone: safeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    cachedDateLabelFormatters.set(dateLabelKey, dateLabelFmt);
  }
  const dateLabel = dateLabelFmt.format(date);
  return `${dateLabel} ${time}`;
}
