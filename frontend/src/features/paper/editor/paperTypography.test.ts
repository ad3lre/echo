import { describe, expect, it } from 'vitest';
import {
  PAPER_FONT_CATALOG,
  paperFontIdFromFamily,
} from '@/features/paper/editor/paperTypography';

describe('paperTypography', () => {
  it('maps catalog families to stable ids', () => {
    for (const font of PAPER_FONT_CATALOG) {
      expect(paperFontIdFromFamily(font.family)).toBe(font.id);
    }
  });

  it('includes expanded Canva-style library', () => {
    expect(PAPER_FONT_CATALOG.length).toBeGreaterThanOrEqual(24);
    const categories = new Set(PAPER_FONT_CATALOG.map((f) => f.category));
    expect(categories.has('sans')).toBe(true);
    expect(categories.has('serif')).toBe(true);
  });
});
