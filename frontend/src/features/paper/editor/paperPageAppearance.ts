/** Derive paper surface CSS variables from a custom page hex color. */

export type PaperPageColorPair = {
  light: string | null;
  dark: string | null;
};

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
