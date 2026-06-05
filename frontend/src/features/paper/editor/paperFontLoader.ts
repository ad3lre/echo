import {
  PAPER_FONT_CATALOG,
  paperFontPackageName,
} from '@/features/paper/editor/paperFontCatalog';

const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();

const BUNDLED_FONT_IMPORTS: Record<string, () => Promise<unknown>> = {
  'lohit-devanagari': () =>
    import('@/features/paper/fonts/lohit-devanagari.css'),
};

/**
 * Resolve @fontsource via package name (works with hoisted monorepo node_modules).
 * Uses latin-400.css subset to minimize font file dependencies and ensure reliable
 * loading. The latin subset covers standard English and Western European characters.
 */
const FONT_IMPORTS = Object.fromEntries(
  PAPER_FONT_CATALOG.filter((font) => !font.bundled).map((font) => {
    const pkg = paperFontPackageName(font);
    return [font.id, () => import(`@fontsource/${pkg}/latin-400.css`)];
  }),
) as Record<string, () => Promise<unknown>>;

function loaderForFontId(fontId: string): (() => Promise<unknown>) | undefined {
  return BUNDLED_FONT_IMPORTS[fontId] ?? FONT_IMPORTS[fontId];
}

/** Whether a catalog font id has a registered CSS loader. */
export function paperFontHasLoader(fontId: string): boolean {
  return !!loaderForFontId(fontId.trim().toLowerCase());
}

/** Load font CSS for a catalog font id (idempotent). */
export async function ensurePaperFontLoaded(fontId: string): Promise<void> {
  const id = fontId.trim().toLowerCase();
  if (!id) return;

  const inFlight = loading.get(id);
  if (inFlight) return inFlight;
  if (loaded.has(id)) return;

  const loader = loaderForFontId(id);
  if (!loader) return;

  const promise = loader()
    .then(() => {
      loaded.add(id);
    })
    .finally(() => {
      loading.delete(id);
    });

  loading.set(id, promise);
  return promise;
}

/** Preload the full Paper font catalog (call once when opening Paper). */
export function preloadPaperFontCatalog(): void {
  for (const font of PAPER_FONT_CATALOG) {
    void ensurePaperFontLoaded(font.id);
  }
}
