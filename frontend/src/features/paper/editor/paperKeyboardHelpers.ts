import {
  PAPER_FONT_CATALOG,
  PAPER_FONT_SIZE_PRESETS,
  PAPER_HIGHLIGHT_COLORS,
  type PaperFontDefinition,
  paperFontIdFromFamily,
} from '@/features/paper/editor/paperTypography';

export function stepFontSizePx(
  currentPx: number,
  direction: 'up' | 'down',
): number {
  const presets = PAPER_FONT_SIZE_PRESETS;
  if (direction === 'up') {
    const next = presets.find((p) => p > currentPx);
    return next ?? presets[presets.length - 1]!;
  }
  const prev = [...presets].reverse().find((p) => p < currentPx);
  return prev ?? presets[0]!;
}

export function cycleFontInCatalog(
  currentFamily: string,
  direction: 'prev' | 'next',
): PaperFontDefinition {
  const catalog = PAPER_FONT_CATALOG;
  const currentId = paperFontIdFromFamily(currentFamily);
  const idx = Math.max(
    0,
    catalog.findIndex((f) => f.id === currentId),
  );
  const delta = direction === 'next' ? 1 : -1;
  const nextIdx = (idx + delta + catalog.length) % catalog.length;
  return catalog[nextIdx]!;
}

export function cycleHighlightColor(current: string | null): string | null {
  const colors = PAPER_HIGHLIGHT_COLORS.map((c) => c.value);
  if (!current) return colors[0] ?? null;
  const idx = colors.findIndex(
    (c) => c.toLowerCase() === current.toLowerCase(),
  );
  if (idx < 0) return colors[0] ?? null;
  const next = (idx + 1) % colors.length;
  return colors[next] ?? null;
}
