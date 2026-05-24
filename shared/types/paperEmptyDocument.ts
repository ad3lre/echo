/** Default empty paper document — title block (H1) + document font preference. */

export const PAPER_DEFAULT_FONT_FAMILY = 'Inter';

export function createEmptyPaperContentJson(): Record<string, unknown> {
  return {
    type: 'doc',
    attrs: { defaultFontFamily: PAPER_DEFAULT_FONT_FAMILY },
    content: [{ type: 'heading', attrs: { level: 1 }, content: [] }],
  };
}

export const EMPTY_PAPER_CONTENT_JSON: Record<string, unknown> =
  createEmptyPaperContentJson();
