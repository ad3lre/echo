/** Slider ranges for inline letter-spacing and line-height marks. */

export const PAPER_LETTER_SPACING_RANGE = {
  min: -2,
  max: 4,
  step: 0.1,
  /** Normal / inherited tracking (unset mark). */
  default: 0,
} as const;

export const PAPER_LINE_HEIGHT_RANGE = {
  min: 0.75,
  max: 2.5,
  step: 0.05,
  /** Normal / inherited leading (unset mark). */
  default: 1.35,
} as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseLetterSpacingPx(value: string): number | null {
  const n = Number.parseFloat(value.replace(/px$/i, '').trim());
  return Number.isFinite(n) ? n : null;
}

export function letterSpacingSliderValue(
  value: string | null | undefined,
): number {
  if (!value) return PAPER_LETTER_SPACING_RANGE.default;
  const n = parseLetterSpacingPx(value);
  if (n == null) return PAPER_LETTER_SPACING_RANGE.default;
  return clamp(
    n,
    PAPER_LETTER_SPACING_RANGE.min,
    PAPER_LETTER_SPACING_RANGE.max,
  );
}

export function letterSpacingFromSlider(n: number): string | null {
  const clamped = clamp(
    n,
    PAPER_LETTER_SPACING_RANGE.min,
    PAPER_LETTER_SPACING_RANGE.max,
  );
  if (
    Math.abs(clamped - PAPER_LETTER_SPACING_RANGE.default) <
    PAPER_LETTER_SPACING_RANGE.step / 2
  ) {
    return null;
  }
  const rounded = Math.round(clamped * 10) / 10;
  return `${rounded}px`;
}

export function formatLetterSpacingLabel(
  value: string | null | undefined,
  mixed = false,
): string {
  if (mixed) return 'Mixed';
  if (!value) return 'Normal';
  return value;
}

export function lineHeightSliderValue(
  value: string | null | undefined,
): number {
  if (!value) return PAPER_LINE_HEIGHT_RANGE.default;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return PAPER_LINE_HEIGHT_RANGE.default;
  return clamp(n, PAPER_LINE_HEIGHT_RANGE.min, PAPER_LINE_HEIGHT_RANGE.max);
}

export function lineHeightFromSlider(n: number): string | null {
  const clamped = clamp(
    n,
    PAPER_LINE_HEIGHT_RANGE.min,
    PAPER_LINE_HEIGHT_RANGE.max,
  );
  if (
    Math.abs(clamped - PAPER_LINE_HEIGHT_RANGE.default) <
    PAPER_LINE_HEIGHT_RANGE.step / 2
  ) {
    return null;
  }
  const rounded = Math.round(clamped * 100) / 100;
  return String(rounded);
}

export function formatLineHeightLabel(
  value: string | null | undefined,
  mixed = false,
): string {
  if (mixed) return 'Mixed';
  if (!value) return 'Normal';
  return value;
}
