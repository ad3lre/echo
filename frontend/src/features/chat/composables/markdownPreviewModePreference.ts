export type MarkdownPreviewMenuMode = 'off' | 'inline' | 'split' | 'full';

/**
 * When false, the composer markdown menu hides **Inline preview** and stored
 * `inline` is coerced to `split`. Implementation stays in place (TipTap
 * decorations, `setMarkdownDecorationsEnabled`, `applyMarkdownPreviewMode('inline')`).
 * Set to `true` to ship the feature. See `docs/plans/FUTURE_FEATURES.md`.
 */
export const INLINE_MARKDOWN_PREVIEW_UI_ENABLED = false;

const STORAGE_KEY = 'echo.chat.markdownPreviewMode';

const VALID = new Set<MarkdownPreviewMenuMode>([
  'off',
  'inline',
  'split',
  'full',
]);

function parseStored(raw: string | null): MarkdownPreviewMenuMode | null {
  if (!raw || !VALID.has(raw as MarkdownPreviewMenuMode)) return null;
  return raw as MarkdownPreviewMenuMode;
}

export function readMarkdownPreviewModePreference(): MarkdownPreviewMenuMode | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return parseStored(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeMarkdownPreviewModePreference(
  mode: MarkdownPreviewMenuMode,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* quota / private mode */
  }
}

/** Maps disallowed modes (e.g. inline when UI is off) to a shipped substitute. */
export function normalizeMarkdownPreviewModeForShipping(
  mode: MarkdownPreviewMenuMode,
): MarkdownPreviewMenuMode {
  if (mode === 'inline' && !INLINE_MARKDOWN_PREVIEW_UI_ENABLED) return 'split';
  return mode;
}
