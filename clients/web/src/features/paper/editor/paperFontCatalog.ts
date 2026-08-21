/** Curated @fontsource-backed fonts for Paper (Canva-style library). */

export type PaperFontCategory =
  | 'sans'
  | 'serif'
  | 'display'
  | 'script'
  | 'mono'
  | 'devanagari';

/** HTML data attributes for font preview / picker rows. */
export type PaperFontHolderAttributes = {
  'data-font-id': string;
  'data-font-family': string;
  'data-font-category': PaperFontCategory;
  'data-font-bundled'?: 'true';
};

export type PaperFontDefinition = {
  id: string;
  label: string;
  family: string;
  category: PaperFontCategory;
  attributes: PaperFontHolderAttributes;
  /** @fontsource npm package when it differs from `id`. */
  pkg?: string;
  /** Self-hosted OFL font (not from @fontsource). */
  bundled?: boolean;
};

function font(
  id: string,
  label: string,
  family: string,
  category: PaperFontCategory,
  opts?: { pkg?: string; bundled?: boolean },
): PaperFontDefinition {
  return {
    id,
    label,
    family,
    category,
    attributes: {
      'data-font-id': id,
      'data-font-family': family,
      'data-font-category': category,
      ...(opts?.bundled ? { 'data-font-bundled': 'true' as const } : {}),
    },
    ...(opts?.pkg ? { pkg: opts.pkg } : {}),
    ...(opts?.bundled ? { bundled: true } : {}),
  };
}

export function paperFontHolderBindings(font: PaperFontDefinition): {
  attributes: PaperFontHolderAttributes;
  style: { fontFamily: string };
} {
  return {
    attributes: font.attributes,
    style: { fontFamily: font.family },
  };
}

export const PAPER_FONT_CATALOG: readonly PaperFontDefinition[] = [
  // Sans serif
  font('inter', 'Inter', 'Inter', 'sans'),
  font('open-sans', 'Open Sans', 'Open Sans', 'sans'),
  font('roboto', 'Roboto', 'Roboto', 'sans'),
  font('lato', 'Lato', 'Lato', 'sans'),
  font('montserrat', 'Montserrat', 'Montserrat', 'sans'),
  font('poppins', 'Poppins', 'Poppins', 'sans'),
  font('nunito', 'Nunito', 'Nunito', 'sans'),
  font('nunito-sans', 'Nunito Sans', 'Nunito Sans', 'sans'),
  font('raleway', 'Raleway', 'Raleway', 'sans'),
  font('work-sans', 'Work Sans', 'Work Sans', 'sans'),
  font('dm-sans', 'DM Sans', 'DM Sans', 'sans'),
  font('source-sans-3', 'Source Sans 3', 'Source Sans 3', 'sans'),
  font('rubik', 'Rubik', 'Rubik', 'sans'),
  font('noto-sans', 'Noto Sans', 'Noto Sans', 'sans'),
  font('figtree', 'Figtree', 'Figtree', 'sans'),
  font('manrope', 'Manrope', 'Manrope', 'sans'),
  font('outfit', 'Outfit', 'Outfit', 'sans'),
  font('plus-jakarta-sans', 'Plus Jakarta Sans', 'Plus Jakarta Sans', 'sans'),
  font('ibm-plex-sans', 'IBM Plex Sans', 'IBM Plex Sans', 'sans'),
  font('fira-sans', 'Fira Sans', 'Fira Sans', 'sans'),
  font('ubuntu', 'Ubuntu', 'Ubuntu', 'sans'),
  font('public-sans', 'Public Sans', 'Public Sans', 'sans'),
  font('lexend', 'Lexend', 'Lexend', 'sans'),
  font('barlow', 'Barlow', 'Barlow', 'sans'),
  font('mulish', 'Mulish', 'Mulish', 'sans'),
  font('karla', 'Karla', 'Karla', 'sans'),
  font('cabin', 'Cabin', 'Cabin', 'sans'),
  font('quicksand', 'Quicksand', 'Quicksand', 'sans'),
  font('josefin-sans', 'Josefin Sans', 'Josefin Sans', 'sans'),
  font('exo-2', 'Exo 2', 'Exo 2', 'sans'),
  font('titillium-web', 'Titillium Web', 'Titillium Web', 'sans'),
  font('overpass', 'Overpass', 'Overpass', 'sans'),
  font('signika', 'Signika', 'Signika', 'sans'),
  font('arimo', 'Arimo', 'Arimo', 'sans'),
  font('catamaran', 'Catamaran', 'Catamaran', 'sans'),
  font('hind', 'Hind', 'Hind', 'sans'),
  font('mukta', 'Mukta', 'Mukta', 'sans'),
  font('oxygen', 'Oxygen', 'Oxygen', 'sans'),
  font('asap', 'Asap', 'Asap', 'sans'),
  font(
    'atkinson-hyperlegible',
    'Atkinson Hyperlegible',
    'Atkinson Hyperlegible',
    'sans',
  ),
  font('sora', 'Sora', 'Sora', 'sans'),
  font('urbanist', 'Urbanist', 'Urbanist', 'sans'),
  font('space-grotesk', 'Space Grotesk', 'Space Grotesk', 'sans'),
  font('comfortaa', 'Comfortaa', 'Comfortaa', 'sans'),
  font('reddit-sans', 'Reddit Sans', 'Reddit Sans', 'sans'),

  // Serif
  font('playfair', 'Playfair Display', 'Playfair Display', 'serif', {
    pkg: 'playfair-display',
  }),
  font('merriweather', 'Merriweather', 'Merriweather', 'serif'),
  font('lora', 'Lora', 'Lora', 'serif'),
  font('libre-baskerville', 'Libre Baskerville', 'Libre Baskerville', 'serif'),
  font('source-serif-4', 'Source Serif 4', 'Source Serif 4', 'serif'),
  font('crimson-text', 'Crimson Text', 'Crimson Text', 'serif'),
  font('eb-garamond', 'EB Garamond', 'EB Garamond', 'serif'),
  font('pt-serif', 'PT Serif', 'PT Serif', 'serif'),
  font('bitter', 'Bitter', 'Bitter', 'serif'),
  font('cormorant', 'Cormorant', 'Cormorant', 'serif'),
  font('noto-serif', 'Noto Serif', 'Noto Serif', 'serif'),
  font('vollkorn', 'Vollkorn', 'Vollkorn', 'serif'),
  font('zilla-slab', 'Zilla Slab', 'Zilla Slab', 'serif'),
  font('roboto-slab', 'Roboto Slab', 'Roboto Slab', 'serif'),
  font('literata', 'Literata', 'Literata', 'serif'),
  font('spectral', 'Spectral', 'Spectral', 'serif'),
  font('gelasio', 'Gelasio', 'Gelasio', 'serif'),
  font('frank-ruhl-libre', 'Frank Ruhl Libre', 'Frank Ruhl Libre', 'serif'),
  font('old-standard-tt', 'Old Standard TT', 'Old Standard TT', 'serif'),
  font('cardo', 'Cardo', 'Cardo', 'serif'),
  font('lusitana', 'Lusitana', 'Lusitana', 'serif'),
  font('aleo', 'Aleo', 'Aleo', 'serif'),
  font('domine', 'Domine', 'Domine', 'serif'),

  // Display
  font('oswald', 'Oswald', 'Oswald', 'display'),
  font('bebas-neue', 'Bebas Neue', 'Bebas Neue', 'display'),
  font('anton', 'Anton', 'Anton', 'display'),
  font('archivo-black', 'Archivo Black', 'Archivo Black', 'display'),
  font('bungee', 'Bungee', 'Bungee', 'display'),
  font('righteous', 'Righteous', 'Righteous', 'display'),
  font('teko', 'Teko', 'Teko', 'display'),
  font('russo-one', 'Russo One', 'Russo One', 'display'),
  font('orbitron', 'Orbitron', 'Orbitron', 'display'),
  font('abel', 'Abel', 'Abel', 'display'),
  font('staatliches', 'Staatliches', 'Staatliches', 'display'),
  font(
    'big-shoulders-display',
    'Big Shoulders Display',
    'Big Shoulders Display',
    'display',
  ),
  font('fjalla-one', 'Fjalla One', 'Fjalla One', 'display'),
  font('passion-one', 'Passion One', 'Passion One', 'display'),
  font('ultra', 'Ultra', 'Ultra', 'display'),

  // Script & handwriting
  font('pacifico', 'Pacifico', 'Pacifico', 'script'),
  font('dancing-script', 'Dancing Script', 'Dancing Script', 'script'),
  font('great-vibes', 'Great Vibes', 'Great Vibes', 'script'),
  font('sacramento', 'Sacramento', 'Sacramento', 'script'),
  font('satisfy', 'Satisfy', 'Satisfy', 'script'),
  font('kaushan-script', 'Kaushan Script', 'Kaushan Script', 'script'),
  font('parisienne', 'Parisienne', 'Parisienne', 'script'),
  font('tangerine', 'Tangerine', 'Tangerine', 'script'),
  font('lobster', 'Lobster', 'Lobster', 'script'),
  font('indie-flower', 'Indie Flower', 'Indie Flower', 'script'),
  font('caveat', 'Caveat', 'Caveat', 'script'),
  font('cookie', 'Cookie', 'Cookie', 'script'),
  font('alex-brush', 'Alex Brush', 'Alex Brush', 'script'),

  // Monospace
  font('jetbrains-mono', 'JetBrains Mono', 'JetBrains Mono', 'mono'),
  font('source-code-pro', 'Source Code Pro', 'Source Code Pro', 'mono'),
  font('fira-code', 'Fira Code', 'Fira Code', 'mono'),
  font('ibm-plex-mono', 'IBM Plex Mono', 'IBM Plex Mono', 'mono'),
  font('roboto-mono', 'Roboto Mono', 'Roboto Mono', 'mono'),
  font('inconsolata', 'Inconsolata', 'Inconsolata', 'mono'),
  font('space-mono', 'Space Mono', 'Space Mono', 'mono'),
  font('ubuntu-mono', 'Ubuntu Mono', 'Ubuntu Mono', 'mono'),
  font('red-hat-mono', 'Red Hat Mono', 'Red Hat Mono', 'mono'),
  font('anonymous-pro', 'Anonymous Pro', 'Anonymous Pro', 'mono'),
  font('dm-mono', 'DM Mono', 'DM Mono', 'mono'),
  font('victor-mono', 'Victor Mono', 'Victor Mono', 'mono'),

  // Devanagari (OFL — open source only)
  font(
    'noto-sans-devanagari',
    'Noto Sans Devanagari',
    'Noto Sans Devanagari',
    'devanagari',
  ),
  font('cambay', 'Cambay', 'Cambay', 'devanagari'),
  font(
    'lohit-devanagari',
    'Lohit Devanagari',
    'Lohit Devanagari',
    'devanagari',
    { bundled: true },
  ),
] as const;

export function paperFontPackageName(font: PaperFontDefinition): string {
  return font.pkg ?? font.id;
}
