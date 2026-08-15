import {
  isBraveBrowserSyncHint,
  isBraveBrowser,
  isWebKitDesktop,
} from '@/platform/browserCompatibility';

export interface AccessibilityPreferences {
  reducedMotion: boolean;
  highContrast: boolean;
  showMessageSpacing: boolean;
  dyslexiaFriendlyFont: boolean;
  /** Replace blur-based liquid glass with opaque surfaces (readability / weak compositors). */
  solidGlassSurfaces: boolean;
  fontScale: number;
}

const STORAGE_KEY = 'echo-accessibility-preferences-v1';

const DEFAULTS: AccessibilityPreferences = {
  reducedMotion: false,
  highContrast: false,
  showMessageSpacing: true,
  dyslexiaFriendlyFont: false,
  solidGlassSurfaces: false,
  fontScale: 100,
};

let cached: AccessibilityPreferences | null = null;

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function readStored(): Partial<AccessibilityPreferences> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<AccessibilityPreferences>;
  } catch {
    return {};
  }
}

function shouldDefaultSolidGlassSurfaces(): boolean {
  /* WKWebView and Brave often fail to composite backdrop-filter after theme
   * token swaps — opaque glass keeps the shell visible. */
  return isBraveBrowserSyncHint() || isWebKitDesktop();
}

function resolveSolidGlassSurfacesDefault(
  stored: Partial<AccessibilityPreferences>,
): boolean {
  if (shouldDefaultSolidGlassSurfaces()) return true;
  if (isBool(stored.solidGlassSurfaces)) return stored.solidGlassSurfaces;
  return DEFAULTS.solidGlassSurfaces;
}

export function loadAccessibilityPreferences(): AccessibilityPreferences {
  if (cached) return cached;
  const s = readStored();
  const fontScale =
    typeof s.fontScale === 'number' && s.fontScale >= 50 && s.fontScale <= 200
      ? s.fontScale
      : DEFAULTS.fontScale;
  cached = {
    reducedMotion: isBool(s.reducedMotion)
      ? s.reducedMotion
      : DEFAULTS.reducedMotion,
    highContrast: isBool(s.highContrast)
      ? s.highContrast
      : DEFAULTS.highContrast,
    showMessageSpacing: isBool(s.showMessageSpacing)
      ? s.showMessageSpacing
      : DEFAULTS.showMessageSpacing,
    dyslexiaFriendlyFont: isBool(s.dyslexiaFriendlyFont)
      ? s.dyslexiaFriendlyFont
      : DEFAULTS.dyslexiaFriendlyFont,
    solidGlassSurfaces: resolveSolidGlassSurfacesDefault(s),
    fontScale,
  };
  return cached;
}

/**
 * When a weak compositor (Brave, macOS WKWebView) is detected and the user has
 * not chosen solid-glass explicitly, enable it and persist so later loads stay
 * consistent.
 */
export async function reconcileSolidGlassPreferenceForWeakCompositors(): Promise<void> {
  const stored = readStored();
  if (isBool(stored.solidGlassSurfaces) && stored.solidGlassSurfaces) return;

  const needsSolidGlass = isWebKitDesktop() || (await isBraveBrowser());
  if (!needsSolidGlass) return;

  const prefs = loadAccessibilityPreferences();
  if (prefs.solidGlassSurfaces) return;

  cached = null;
  const updated = saveAccessibilityPreferences({ solidGlassSurfaces: true });
  applyAccessibilityPreferences(updated);
}

/** @deprecated Prefer {@link reconcileSolidGlassPreferenceForWeakCompositors}. */
export const reconcileBraveSolidGlassPreference =
  reconcileSolidGlassPreferenceForWeakCompositors;

export function saveAccessibilityPreferences(
  next: Partial<AccessibilityPreferences>,
): AccessibilityPreferences {
  const current = loadAccessibilityPreferences();
  const fontScale =
    typeof next.fontScale === 'number' &&
    next.fontScale >= 50 &&
    next.fontScale <= 200
      ? next.fontScale
      : current.fontScale;
  const merged: AccessibilityPreferences = {
    reducedMotion: isBool(next.reducedMotion)
      ? next.reducedMotion
      : current.reducedMotion,
    highContrast: isBool(next.highContrast)
      ? next.highContrast
      : current.highContrast,
    showMessageSpacing: isBool(next.showMessageSpacing)
      ? next.showMessageSpacing
      : current.showMessageSpacing,
    dyslexiaFriendlyFont: isBool(next.dyslexiaFriendlyFont)
      ? next.dyslexiaFriendlyFont
      : current.dyslexiaFriendlyFont,
    solidGlassSurfaces: isBool(next.solidGlassSurfaces)
      ? next.solidGlassSurfaces
      : current.solidGlassSurfaces,
    fontScale,
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
  }
  cached = merged;
  return merged;
}

/**
 * Reflect accessibility preferences as data-attributes on <html> and a CSS
 * variable for font scale.  Components and CSS rules key off these rather than
 * reading the store directly, keeping the coupling lightweight.
 *
 * Call this once on boot and every time a preference changes.
 */
export function applyAccessibilityPreferences(
  prefs: AccessibilityPreferences,
): void {
  const root = document.documentElement;
  const solidGlassSurfaces =
    prefs.solidGlassSurfaces || shouldDefaultSolidGlassSurfaces();

  // Reduced motion: honour either the user's in-app toggle OR the OS signal.
  const osReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  root.dataset['echoReducedMotion'] =
    prefs.reducedMotion || osReducedMotion ? '1' : '0';

  root.dataset['echoHighContrast'] = prefs.highContrast ? '1' : '0';
  root.dataset['echoDyslexiaFont'] = prefs.dyslexiaFriendlyFont ? '1' : '0';
  root.dataset['echoMessageSpacing'] = prefs.showMessageSpacing ? '1' : '0';
  root.dataset['echoSolidGlass'] = solidGlassSurfaces ? '1' : '0';
  root.style.setProperty('--echo-font-scale', `${prefs.fontScale / 100}`);
}
