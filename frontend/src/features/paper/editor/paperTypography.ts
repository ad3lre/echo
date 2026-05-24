/** Canva-style font catalog and typography presets for Paper. */

import { PAPER_DEFAULT_FONT_FAMILY } from '@shared/types/paperEmptyDocument';
import { PAPER_FONT_CATALOG } from '@/features/paper/editor/paperFontCatalog';

export type {
  PaperFontCategory,
  PaperFontDefinition,
  PaperFontHolderAttributes,
} from '@/features/paper/editor/paperFontCatalog';
export {
  PAPER_FONT_CATALOG,
  paperFontHolderBindings,
} from '@/features/paper/editor/paperFontCatalog';

export const PAPER_FONT_SIZE_PRESETS = [
  10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72,
] as const;

/** Default px when no explicit fontSize mark (matches paperTheme.css). */
export const PAPER_BLOCK_DEFAULT_FONT_PX = {
  paragraph: 15,
  heading1: 36,
  heading2: 24,
  heading3: 19,
} as const;

export const PAPER_HIGHLIGHT_COLORS = [
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green', value: '#bbf7d0' },
  { label: 'Cyan', value: '#a5f3fc' },
  { label: 'Pink', value: '#fbcfe8' },
  { label: 'Orange', value: '#fed7aa' },
  { label: 'Lavender', value: '#e9d5ff' },
  { label: 'Lime', value: '#d9f99d' },
  { label: 'Coral', value: '#fecdd3' },
] as const;

export const PAPER_TEXT_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Black', value: '#111111' },
  { label: 'Gray', value: '#6b7280' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Teal', value: '#0d9488' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Pink', value: '#db2777' },
  { label: 'White', value: '#f8fafc' },
] as const;

export function paperFontFamilyCss(family: string): string {
  const hit = PAPER_FONT_CATALOG.find(
    (f) => f.family === family || f.id === family,
  );
  return hit?.family ?? family;
}

export function paperFontIdFromFamily(
  family: string | null | undefined,
): string {
  if (!family?.trim()) return 'inter';
  const hit = PAPER_FONT_CATALOG.find((f) => f.family === family.trim());
  return hit?.id ?? 'inter';
}

export function defaultFontPxForBlock(
  blockType: string,
  headingLevel?: number,
): number {
  if (blockType === 'heading') {
    if (headingLevel === 1) return PAPER_BLOCK_DEFAULT_FONT_PX.heading1;
    if (headingLevel === 2) return PAPER_BLOCK_DEFAULT_FONT_PX.heading2;
    if (headingLevel === 3) return PAPER_BLOCK_DEFAULT_FONT_PX.heading3;
  }
  return PAPER_BLOCK_DEFAULT_FONT_PX.paragraph;
}

export function readDocDefaultFontFamily(
  doc: Record<string, unknown> | null | undefined,
): string {
  if (!doc || typeof doc !== 'object') return PAPER_DEFAULT_FONT_FAMILY;
  const attrs = doc.attrs;
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    const f = (attrs as Record<string, unknown>).defaultFontFamily;
    if (typeof f === 'string' && f.trim()) return f.trim();
  }
  return PAPER_DEFAULT_FONT_FAMILY;
}
