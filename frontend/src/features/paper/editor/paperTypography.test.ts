import { describe, expect, it } from 'vitest';
import {
  PAPER_FONT_CATALOG,
  paperFontIdFromFamily,
} from '@/features/paper/editor/paperTypography';
import { paperFontPackageName } from '@/features/paper/editor/paperFontCatalog';
import {
  ensurePaperFontLoaded,
  paperFontHasLoader,
} from '@/features/paper/editor/paperFontLoader';

describe('paperTypography', () => {
  it('maps catalog families to stable ids', () => {
    for (const font of PAPER_FONT_CATALOG) {
      expect(paperFontIdFromFamily(font.family)).toBe(font.id);
    }
  });

  it('defines holder attributes for every catalog font', () => {
    for (const font of PAPER_FONT_CATALOG) {
      expect(font.attributes['data-font-id']).toBe(font.id);
      expect(font.attributes['data-font-family']).toBe(font.family);
      expect(font.attributes['data-font-category']).toBe(font.category);
      if (font.bundled) {
        expect(font.attributes['data-font-bundled']).toBe('true');
      }
    }
  });

  it('includes expanded Canva-style library', () => {
    expect(PAPER_FONT_CATALOG.length).toBeGreaterThanOrEqual(90);
    const categories = new Set(PAPER_FONT_CATALOG.map((f) => f.category));
    expect(categories.has('sans')).toBe(true);
    expect(categories.has('serif')).toBe(true);
    expect(categories.has('display')).toBe(true);
    expect(categories.has('script')).toBe(true);
    expect(categories.has('mono')).toBe(true);
    expect(categories.has('devanagari')).toBe(true);
  });

  it('registers a loader for every catalog font', () => {
    for (const font of PAPER_FONT_CATALOG) {
      expect(
        paperFontHasLoader(font.id),
        `missing loader for ${font.id} (${paperFontPackageName(font)})`,
      ).toBe(true);
    }
  });

  it('loads every catalog font from @fontsource', async () => {
    for (const font of PAPER_FONT_CATALOG) {
      await expect(
        ensurePaperFontLoaded(font.id),
        `failed to load ${font.id} (${paperFontPackageName(font)})`,
      ).resolves.toBeUndefined();
    }
  }, 60_000);
});
