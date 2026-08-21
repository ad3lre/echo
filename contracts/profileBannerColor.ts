export const PROFILE_BANNER_COLOR_MAX_LENGTH = 200;
export const DEFAULT_PROFILE_BANNER_SOLID_HEX = '#7c5cff';

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LINEAR_GRADIENT_RE = /^linear-gradient\((.*)\)$/i;
const ANGLE_RE = /^[+-]?(?:\d+|\d*\.\d+)deg$/i;
const DIRECTION_RE =
  /^to\s+(?:(?:top|bottom)(?:\s+(?:left|right))?|(?:left|right)(?:\s+(?:top|bottom))?)$/i;
const COLOR_STOP_RE =
  /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})(?:\s+((?:\d+|\d*\.\d+)%))?$/;

function canonicalHex(input: string): string | null {
  const trimmed = input.trim();
  if (!HEX_COLOR_RE.test(trimmed)) return null;
  const hex = trimmed.slice(1).toLowerCase();
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return `#${hex}`;
}

function canonicalNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(3)));
}

function normalizeGradientLead(input: string): string | null {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  if (ANGLE_RE.test(trimmed)) {
    const degrees = Number(trimmed.slice(0, -3));
    if (!Number.isFinite(degrees) || Math.abs(degrees) > 360) return null;
    return `${canonicalNumber(degrees)}deg`;
  }
  if (DIRECTION_RE.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

function normalizeColorStop(input: string): string | null {
  const match = input.trim().replace(/\s+/g, ' ').match(COLOR_STOP_RE);
  if (!match) return null;

  const color = canonicalHex(match[1] ?? '');
  if (!color) return null;

  const rawPercent = match[2];
  if (!rawPercent) return color;

  const percent = Number(rawPercent.slice(0, -1));
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return `${color} ${canonicalNumber(percent)}%`;
}

export function parseProfileBannerColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > PROFILE_BANNER_COLOR_MAX_LENGTH) return null;

  const hex = canonicalHex(trimmed);
  if (hex) return hex;

  const gradientMatch = trimmed.match(LINEAR_GRADIENT_RE);
  if (!gradientMatch) return null;

  const parts = (gradientMatch[1] ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const normalizedParts: string[] = [];
  const firstLead = normalizeGradientLead(parts[0] ?? '');
  if (firstLead) {
    normalizedParts.push(firstLead);
    parts.shift();
  }

  if (parts.length < 2 || parts.length > 6) return null;

  for (const part of parts) {
    const stop = normalizeColorStop(part);
    if (!stop) return null;
    normalizedParts.push(stop);
  }

  const normalized = `linear-gradient(${normalizedParts.join(', ')})`;
  return normalized.length <= PROFILE_BANNER_COLOR_MAX_LENGTH
    ? normalized
    : null;
}

export function normalizeProfileBannerColor(
  value: unknown,
  fallback = DEFAULT_PROFILE_BANNER_SOLID_HEX,
): string {
  return parseProfileBannerColor(value) ?? fallback;
}

export function isSafeProfileBannerColor(value: unknown): boolean {
  return parseProfileBannerColor(value) !== null;
}

export function isLinearGradientProfileBannerColor(value: unknown): boolean {
  const parsed = parseProfileBannerColor(value);
  return parsed !== null && parsed.toLowerCase().startsWith('linear-gradient(');
}
