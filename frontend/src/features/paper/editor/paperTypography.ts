/** Canva-style font catalog and typography presets for Paper. */

import { PAPER_DEFAULT_FONT_FAMILY } from '@shared/types/paperEmptyDocument';

export type PaperFontDefinition = {
  id: string;
  label: string;
  family: string;
  category: 'sans' | 'serif' | 'display' | 'script' | 'mono';
};

/** Curated fonts similar to Canva’s default library. */
export const PAPER_FONT_CATALOG: readonly PaperFontDefinition[] = [
  { id: 'inter', label: 'Inter', family: 'Inter', category: 'sans' },
  {
    id: 'open-sans',
    label: 'Open Sans',
    family: 'Open Sans',
    category: 'sans',
  },
  { id: 'lato', label: 'Lato', family: 'Lato', category: 'sans' },
  {
    id: 'montserrat',
    label: 'Montserrat',
    family: 'Montserrat',
    category: 'sans',
  },
  { id: 'poppins', label: 'Poppins', family: 'Poppins', category: 'sans' },
  { id: 'roboto', label: 'Roboto', family: 'Roboto', category: 'sans' },
  { id: 'nunito', label: 'Nunito', family: 'Nunito', category: 'sans' },
  { id: 'raleway', label: 'Raleway', family: 'Raleway', category: 'sans' },
  {
    id: 'work-sans',
    label: 'Work Sans',
    family: 'Work Sans',
    category: 'sans',
  },
  { id: 'dm-sans', label: 'DM Sans', family: 'DM Sans', category: 'sans' },
  {
    id: 'source-sans-3',
    label: 'Source Sans 3',
    family: 'Source Sans 3',
    category: 'sans',
  },
  { id: 'rubik', label: 'Rubik', family: 'Rubik', category: 'sans' },
  {
    id: 'playfair',
    label: 'Playfair Display',
    family: 'Playfair Display',
    category: 'serif',
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    family: 'Merriweather',
    category: 'serif',
  },
  { id: 'lora', label: 'Lora', family: 'Lora', category: 'serif' },
  {
    id: 'libre-baskerville',
    label: 'Libre Baskerville',
    family: 'Libre Baskerville',
    category: 'serif',
  },
  {
    id: 'source-serif-4',
    label: 'Source Serif 4',
    family: 'Source Serif 4',
    category: 'serif',
  },
  { id: 'oswald', label: 'Oswald', family: 'Oswald', category: 'display' },
  {
    id: 'bebas-neue',
    label: 'Bebas Neue',
    family: 'Bebas Neue',
    category: 'display',
  },
  {
    id: 'pacifico',
    label: 'Pacifico',
    family: 'Pacifico',
    category: 'script',
  },
  {
    id: 'dancing-script',
    label: 'Dancing Script',
    family: 'Dancing Script',
    category: 'script',
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    family: 'JetBrains Mono',
    category: 'mono',
  },
  {
    id: 'source-code-pro',
    label: 'Source Code Pro',
    family: 'Source Code Pro',
    category: 'mono',
  },
  {
    id: 'noto-sans',
    label: 'Noto Sans',
    family: 'Noto Sans',
    category: 'sans',
  },
] as const;

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
] as const;

export const PAPER_TEXT_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Black', value: '#111111' },
  { label: 'Gray', value: '#6b7280' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Purple', value: '#7c3aed' },
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
