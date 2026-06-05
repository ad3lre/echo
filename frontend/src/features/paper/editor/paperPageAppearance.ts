/** Derive paper surface CSS variables from a custom page hex color. */

export type PaperAppearanceMode = 'light' | 'dark' | 'sunny' | 'amoled';

/** Cycle order matches Settings → Appearance theme cards (Sunny, Light, Dark, Amoled). */
export const PAPER_APPEARANCE_CYCLE: readonly PaperAppearanceMode[] = [
  'sunny',
  'light',
  'dark',
  'amoled',
] as const;

export type PaperPageColorPair = {
  light: string | null;
  dark: string | null;
};

/** Default page canvas colors when the document has no custom page hex. */
export const PAPER_DEFAULT_PAGE_HEX: Record<PaperAppearanceMode, string> = {
  light: '#ffffff',
  dark: '#16161c',
  sunny: '#fffbf0',
  amoled: '#000000',
};

export function isPaperDarkAppearance(
  appearance: PaperAppearanceMode,
): boolean {
  return appearance === 'dark' || appearance === 'amoled';
}

export function paperAppearanceShortLabel(
  appearance: PaperAppearanceMode,
): string {
  if (appearance === 'sunny') return 'Sunny';
  if (appearance === 'amoled') return 'AMOLED';
  if (appearance === 'dark') return 'Dark';
  return 'Light';
}

export function paperAppearanceCanvasLabel(
  appearance: PaperAppearanceMode,
): string {
  return `${paperAppearanceShortLabel(appearance)} canvas`;
}

export function nextPaperAppearance(
  current: PaperAppearanceMode,
): PaperAppearanceMode {
  const idx = PAPER_APPEARANCE_CYCLE.indexOf(current);
  const next = (idx + 1) % PAPER_APPEARANCE_CYCLE.length;
  return PAPER_APPEARANCE_CYCLE[next] ?? 'light';
}

export function readPaperPageColors(
  doc: Record<string, unknown> | null | undefined,
): PaperPageColorPair {
  if (!doc || typeof doc !== 'object') return { light: null, dark: null };
  const attrs = doc.attrs;
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
    return { light: null, dark: null };
  }
  const a = attrs as Record<string, unknown>;
  const light =
    typeof a.paperPageColorLight === 'string' ? a.paperPageColorLight : null;
  const dark =
    typeof a.paperPageColorDark === 'string' ? a.paperPageColorDark : null;
  return { light, dark };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '').trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function derivePaperSurfaceStyle(hex: string): Record<string, string> {
  const rgb = hexToRgb(hex);
  if (!rgb) return {};
  const lum = relativeLuminance(rgb.r, rgb.g, rgb.b);
  const fg =
    lum > 0.55 ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.94)';
  const muted =
    lum > 0.55 ? 'rgba(51, 65, 85, 0.72)' : 'rgba(255, 255, 255, 0.58)';
  const border =
    lum > 0.55 ? 'rgba(15, 23, 42, 0.1)' : 'rgba(255, 255, 255, 0.09)';
  return {
    '--paper-surface-bg': hex,
    '--paper-surface-fg': fg,
    '--paper-surface-muted': muted,
    '--paper-surface-border': border,
  };
}

/** Resolve the active page hex for the current paper appearance mode. */
export function resolvePaperPageHex(
  appearance: PaperAppearanceMode,
  colors: PaperPageColorPair,
): string {
  if (isPaperDarkAppearance(appearance)) {
    return colors.dark?.trim() || PAPER_DEFAULT_PAGE_HEX[appearance];
  }
  if (appearance === 'sunny') {
    return colors.light?.trim() || PAPER_DEFAULT_PAGE_HEX.sunny;
  }
  return colors.light?.trim() || PAPER_DEFAULT_PAGE_HEX.light;
}

/**
 * Inline page surface tokens — always derived for the active appearance so paper
 * canvas text stays readable when the app theme (data-theme) differs.
 */
export function resolvePaperPageSurfaceStyle(
  appearance: PaperAppearanceMode,
  colors: PaperPageColorPair,
): Record<string, string> {
  const derived = derivePaperSurfaceStyle(
    resolvePaperPageHex(appearance, colors),
  );
  const fg = derived['--paper-surface-fg'];
  const muted = derived['--paper-surface-muted'];
  if (!fg) return derived;
  const soft = `color-mix(in srgb, ${fg} 82%, transparent)`;
  return {
    ...derived,
    '--text': fg,
    '--muted': muted ?? fg,
    '--ui-fg': fg,
    '--ui-fg-subtle': muted ?? fg,
    '--ui-fg-soft': soft,
    '--color-foreground': fg,
    '--color-fg': fg,
    '--color-fg-soft': soft,
    '--color-fg-subtle': muted ?? fg,
    '--color-muted': muted ?? fg,
    '--fg': fg,
    '--fg-subtle': muted ?? fg,
  };
}
