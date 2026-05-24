const STORAGE_KEYS = {
  text: 'echo.paper.recentTextColors',
  highlight: 'echo.paper.recentHighlightColors',
  pageLight: 'echo.paper.recentPageLightColors',
  pageDark: 'echo.paper.recentPageDarkColors',
} as const;

export const PAPER_RECENT_COLOR_LIMIT = 10;

export type PaperColorKind = keyof typeof STORAGE_KEYS;

function normalizeHex(hex: string): string | null {
  const raw = hex.trim().replace('#', '');
  const norm =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(norm)) return null;
  return `#${norm.toLowerCase()}`;
}

function loadRecent(kind: PaperColorKind): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[kind]);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === 'string')
      .map((v) => normalizeHex(v))
      .filter((v): v is string => !!v)
      .slice(0, PAPER_RECENT_COLOR_LIMIT);
  } catch {
    return [];
  }
}

function saveRecent(kind: PaperColorKind, colors: string[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEYS[kind],
      JSON.stringify(colors.slice(0, PAPER_RECENT_COLOR_LIMIT)),
    );
  } catch {
    /* quota / private mode */
  }
}

/** Push a color to the front of the recent list (deduped). */
export function pushPaperRecentColor(
  kind: PaperColorKind,
  hex: string,
): string[] {
  const norm = normalizeHex(hex);
  if (!norm) return loadRecent(kind);
  const next = [norm, ...loadRecent(kind).filter((c) => c !== norm)].slice(
    0,
    PAPER_RECENT_COLOR_LIMIT,
  );
  saveRecent(kind, next);
  return next;
}

export function readPaperRecentColors(kind: PaperColorKind): string[] {
  return loadRecent(kind);
}
