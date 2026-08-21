import { formatTimeWithPreferences } from '@/features/settings/timeLanguagePreferences';

export type MagicTimeRenderContext = {
  messageTimestampIso: string;
  senderTimeZone: string;
  viewerTimeZone: string;
  /** Included in markdown parse cache key when chip labels depend on locale. */
  viewerLocale: string;
};

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Skip regex work for the vast majority of messages. */
const MAY_CONTAIN_MAGIC_TIME = /(?:\d\s*:\s*\d|[ap]\s*m\.?|\d\s*[ap]\s*m)/i;

// --- Cached Intl formatters (allocating DateTimeFormat per call was the dominant cost) ---

const wallPartsFormatterByTz = new Map<string, Intl.DateTimeFormat>();

function getWallPartsFormatter(tz: string): Intl.DateTimeFormat | null {
  let fmt = wallPartsFormatterByTz.get(tz);
  if (fmt) return fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
  } catch {
    return null;
  }
  wallPartsFormatterByTz.set(tz, fmt);
  return fmt;
}

function wallPartsInZone(
  instantMs: number,
  tz: string,
): { y: number; mo: number; d: number; h: number; min: number } | null {
  const fmt = getWallPartsFormatter(tz);
  if (!fmt) return null;
  const parts = fmt.formatToParts(new Date(instantMs));
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value ?? 'NaN');
  const y = get('year');
  const mo = get('month');
  const d = get('day');
  const h = get('hour');
  const min = get('minute');
  if (![y, mo, d, h, min].every((n) => Number.isFinite(n))) return null;
  return { y, mo, d, h, min };
}

function lexDate(
  a: { y: number; mo: number; d: number },
  b: { y: number; mo: number; d: number },
): number {
  if (a.y !== b.y) return a.y < b.y ? -1 : 1;
  if (a.mo !== b.mo) return a.mo < b.mo ? -1 : 1;
  if (a.d !== b.d) return a.d < b.d ? -1 : 1;
  return 0;
}

/**
 * UTC ms range where local calendar date can still plausibly equal `anchor` in `tz`
 * when the message was sent near `refMs`. (Offsets are within ±14h of UTC.)
 */
function utcWindowForLocalAnchorDay(refMs: number): { lo: number; hi: number } {
  return { lo: refMs - 30 * 3600000, hi: refMs + 30 * 3600000 };
}

const instantResolveCache = new Map<string, number | null>();
const INSTANT_CACHE_MAX = 400;

function instantCacheGet(key: string): number | null | undefined {
  return instantResolveCache.get(key);
}

function instantCacheSet(key: string, v: number | null): void {
  if (instantResolveCache.size >= INSTANT_CACHE_MAX) {
    const first = instantResolveCache.keys().next().value as string | undefined;
    if (first !== undefined) instantResolveCache.delete(first);
  }
  instantResolveCache.set(key, v);
}

/**
 * Find UTC instant where `tz` shows the given local calendar date + clock time.
 * Minute walk inside a ±30h window (<= 3600 Intl calls worst case, typically far fewer
 * once the day is found early); results memoized per (zone, day, clock, ref-day-bucket).
 */
function instantForWallClockInZone(
  y: number,
  mo: number,
  d: number,
  hour24: number,
  minute: number,
  tz: string,
  refMs: number,
): number | null {
  const refDayBucket = Math.floor(refMs / 86400000);
  const cacheKey = `${tz}\x1f${y}-${mo}-${d}\x1f${hour24}:${minute}\x1f${refDayBucket}`;
  const cached = instantCacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const { lo, hi } = utcWindowForLocalAnchorDay(refMs);
  const anchor = { y, mo, d };
  let found: number | null = null;

  for (let t = lo; t <= hi; t += 60000) {
    const p = wallPartsInZone(t, tz);
    if (!p) continue;
    if (lexDate(p, anchor) !== 0) continue;
    if (p.h === hour24 && p.min === minute) {
      found = t;
      break;
    }
  }

  instantCacheSet(cacheKey, found);
  return found;
}

function anchorCalendarInSenderZone(
  messageTimestampIso: string,
  senderTimeZone: string,
): { y: number; mo: number; d: number } | null {
  const ref = new Date(messageTimestampIso);
  const ms = Number.isFinite(ref.getTime()) ? ref.getTime() : Date.now();
  const p = wallPartsInZone(ms, senderTimeZone);
  if (!p) return null;
  return { y: p.y, mo: p.mo, d: p.d };
}

type ParsedClock = {
  hour24: number;
  minute: number;
};

function parseAmPmHour(
  hourStr: string,
  minuteStr: string,
  ap: string,
): ParsedClock | null {
  let h = Number(hourStr);
  const min = Number(minuteStr);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (min < 0 || min > 59) return null;
  const apLow = ap.toLowerCase();
  const isPm = apLow.startsWith('p');
  if (h < 1 || h > 12) return null;
  if (h === 12) h = isPm ? 12 : 0;
  else if (isPm) h += 12;
  return { hour24: h, minute: min };
}

function parse24(hourStr: string, minuteStr: string): ParsedClock | null {
  const h = Number(hourStr);
  const min = Number(minuteStr);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { hour24: h, minute: min };
}

export type MagicTimeSlot = {
  /** Token inserted into plaintext before markdown. */
  placeholder: string;
  /** Raw matched text (trimmed). */
  original: string;
  /** HTML fragment for the chip + tooltip (safe attributes). */
  chipHtml: string;
};

const PLACEHOLDER_PREFIX = '\uE000MT';
const PLACEHOLDER_SUFFIX = '\uE001';

function makePlaceholder(id: number): string {
  return `${PLACEHOLDER_PREFIX}${id.toString(36)}${PLACEHOLDER_SUFFIX}`;
}

const RE_WITH_MINUTES_AMPM = /\b(\d{1,2}):(\d{2})\s*([ap])(?:m\.?|m)\b/gi;
const RE_HOUR_ONLY_AMPM = /\b(\d{1,2})\s*([ap])(?:m\.?|m)\b/gi;
const RE_24H_NO_AMPM =
  /\b(?:[01]?\d|2[0-3]):[0-5]\d\b(?!\s*[ap](?:m\.?|m)\b)/gi;

type RawMatch = {
  start: number;
  end: number;
  original: string;
  clock: ParsedClock;
};

function collectMagicTimeMatches(text: string): RawMatch[] {
  const raw: RawMatch[] = [];
  const tryRe = (
    re: RegExp,
    parse: (m: RegExpExecArray) => ParsedClock | null,
  ) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const clock = parse(m);
      if (!clock) continue;
      raw.push({
        start: m.index,
        end: m.index + m[0].length,
        original: m[0],
        clock,
      });
    }
  };

  tryRe(RE_WITH_MINUTES_AMPM, (m) =>
    parseAmPmHour(m[1] ?? '', m[2] ?? '', m[3] ?? ''),
  );
  tryRe(RE_HOUR_ONLY_AMPM, (m) => parseAmPmHour(m[1] ?? '', '0', m[2] ?? ''));
  tryRe(RE_24H_NO_AMPM, (m) => {
    const [hh, mm] = (m[0] ?? '').split(':');
    return parse24(hh ?? '', mm ?? '');
  });

  raw.sort((a, b) => a.start - b.start || b.end - a.end);

  const kept: RawMatch[] = [];
  for (const r of raw) {
    if (kept.some((k) => r.start < k.end && r.end > k.start)) continue;
    kept.push(r);
  }
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

export function buildMagicTimeParseCacheExtra(
  ctx: MagicTimeRenderContext,
): string {
  const ref = new Date(ctx.messageTimestampIso);
  const day = anchorCalendarInSenderZone(
    ctx.messageTimestampIso,
    ctx.senderTimeZone,
  );
  return [
    'v3',
    ctx.senderTimeZone,
    ctx.viewerTimeZone,
    ctx.viewerLocale,
    Number.isFinite(ref.getTime()) ? ref.getTime() : 0,
    day ? `${day.y}-${day.mo}-${day.d}` : 'x',
  ].join('\x1f');
}

export function applyMagicTimeToPlaintext(
  text: string,
  ctx: MagicTimeRenderContext,
): { text: string; slots: MagicTimeSlot[] } {
  const refMs = new Date(ctx.messageTimestampIso).getTime();
  if (!text || !Number.isFinite(refMs)) return { text, slots: [] };
  if (!MAY_CONTAIN_MAGIC_TIME.test(text)) return { text, slots: [] };

  const anchor = anchorCalendarInSenderZone(
    ctx.messageTimestampIso,
    ctx.senderTimeZone,
  );
  if (!anchor) return { text, slots: [] };

  const matches = collectMagicTimeMatches(text);
  if (!matches.length) return { text, slots: [] };

  const slots: MagicTimeSlot[] = [];
  let out = '';
  let cursor = 0;
  let id = 0;

  for (const mt of matches) {
    if (mt.start < cursor) continue;
    out += text.slice(cursor, mt.start);
    const instant = instantForWallClockInZone(
      anchor.y,
      anchor.mo,
      anchor.d,
      mt.clock.hour24,
      mt.clock.minute,
      ctx.senderTimeZone,
      refMs,
    );
    if (instant == null) {
      out += mt.original;
      cursor = mt.end;
      continue;
    }
    const viewerDate = new Date(instant);
    const label = formatTimeWithPreferences(viewerDate, ctx.viewerTimeZone);
    const origTrim = mt.original.trim();
    if (label.trim().toLowerCase() === origTrim.toLowerCase()) {
      out += mt.original;
      cursor = mt.end;
      continue;
    }

    const ph = makePlaceholder(id++);
    const tip = escapeAttr(
      'Magic Time shows this message’s time in your timezone. Times are interpreted in the sender’s timezone setting for the day the message was sent.',
    );
    const chipHtml = `<span class="echo-magic-time-wrap" tabindex="0" role="note" aria-label="${tip}"><span class="echo-magic-time-chip">${escapeAttr(label)}</span><span class="echo-magic-time-tooltip" role="tooltip">${tip}</span></span>`;
    slots.push({ placeholder: ph, original: mt.original, chipHtml });
    out += mt.original + '\u2009' + ph;
    cursor = mt.end;
  }
  out += text.slice(cursor);
  return { text: out, slots };
}

export function replaceMagicTimePlaceholdersInHtml(
  html: string,
  slots: MagicTimeSlot[],
): string {
  if (!slots.length) return html;
  let h = html;
  for (const s of slots) {
    if (!h.includes(s.placeholder)) continue;
    h = h.split(s.placeholder).join(s.chipHtml);
  }
  return h;
}
