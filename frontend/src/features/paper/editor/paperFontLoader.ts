import { PAPER_FONT_CATALOG } from '@/features/paper/editor/paperTypography';

const loaded = new Set<string>();

const FONT_IMPORTS: Record<string, () => Promise<unknown>> = {
  inter: () => import('@fontsource/inter/400.css'),
  'open-sans': () => import('@fontsource/open-sans/400.css'),
  lato: () => import('@fontsource/lato/400.css'),
  montserrat: () => import('@fontsource/montserrat/400.css'),
  poppins: () => import('@fontsource/poppins/400.css'),
  roboto: () => import('@fontsource/roboto/400.css'),
  nunito: () => import('@fontsource/nunito/400.css'),
  raleway: () => import('@fontsource/raleway/400.css'),
  'work-sans': () => import('@fontsource/work-sans/400.css'),
  'dm-sans': () => import('@fontsource/dm-sans/400.css'),
  'source-sans-3': () => import('@fontsource/source-sans-3/400.css'),
  rubik: () => import('@fontsource/rubik/400.css'),
  oswald: () => import('@fontsource/oswald/400.css'),
  playfair: () => import('@fontsource/playfair-display/400.css'),
  merriweather: () => import('@fontsource/merriweather/400.css'),
  lora: () => import('@fontsource/lora/400.css'),
  'libre-baskerville': () => import('@fontsource/libre-baskerville/400.css'),
  'source-serif-4': () => import('@fontsource/source-serif-4/400.css'),
  'bebas-neue': () => import('@fontsource/bebas-neue/400.css'),
  pacifico: () => import('@fontsource/pacifico/400.css'),
  'dancing-script': () => import('@fontsource/dancing-script/400.css'),
  'jetbrains-mono': () => import('@fontsource/jetbrains-mono/400.css'),
  'source-code-pro': () => import('@fontsource/source-code-pro/400.css'),
  'noto-sans': () => import('@fontsource/noto-sans/400.css'),
};

/** Load @fontsource CSS for a catalog font id (idempotent). */
export async function ensurePaperFontLoaded(fontId: string): Promise<void> {
  const id = fontId.trim().toLowerCase();
  if (!id || loaded.has(id)) return;
  const loader = FONT_IMPORTS[id];
  if (!loader) return;
  loaded.add(id);
  await loader();
}

/** Preload the full Paper font catalog (call once when opening Paper). */
export function preloadPaperFontCatalog(): void {
  for (const font of PAPER_FONT_CATALOG) {
    void ensurePaperFontLoaded(font.id);
  }
}
