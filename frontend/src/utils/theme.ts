/**
 * Theme — types, persistence, and DOM contract.
 *
 * Key invariant (Rule B):
 *   Only CANONICAL theme strings ('dark' | 'light') reach
 *   document.documentElement.dataset.theme.  All other input
 *   (stale localStorage, future ids like Amoled/Sunny, garbage)
 *   is mapped to a canonical value by resolveCanonicalTheme()
 *   BEFORE touching the DOM.
 */

/** User-facing theme preference — may include future ids without CSS yet. */
export type EchoThemeId = 'Dark' | 'Light' | 'Amoled' | 'Sunny';

/** Values that have a matching [data-theme="…"] block in themes.scss. */
export type CanonicalThemeId = 'dark' | 'light';
/** Runtime modifier on top of canonical dark theme. */
export type EchoDarkVariantId = 'default' | 'amoled';
/** Runtime modifier on top of canonical light theme. */
export type EchoLightVariantId = 'default' | 'sunny';

const CANONICAL_SET: ReadonlySet<string> = new Set<CanonicalThemeId>([
  'dark',
  'light',
]);

const STORAGE_KEY_THEME = 'echo_theme_v1';
const STORAGE_KEY_SYNC_SYSTEM = 'echo_theme_sync_system_v1';
const STORAGE_KEY_VIBRANT_ACCENTS = 'echo_vibrant_accents_v1';
const STORAGE_KEY_INTERFACE_DENSITY = 'echo_interface_density_v1';
const STORAGE_KEY_ACTION_RAIL_PLACEMENT = 'echo_action_rail_placement_v1';

/** Settings → Appearance → Action rail (desktop). Compact shell always uses the left rail. */
export type EchoActionRailPlacementId = 'left' | 'top';

/** Settings → Appearance → Interface Density (persisted). */
export type EchoInterfaceDensityId = 'Compact' | 'Comfortable' | 'Spacious';

/**
 * Map ANY theme input to a canonical id safe for the DOM.
 * Amoled/unknown → 'dark'; Sunny → 'light' (closest light variant).
 */
export function resolveCanonicalTheme(input: EchoThemeId): CanonicalThemeId {
  const lower = input.toLowerCase();
  if (CANONICAL_SET.has(lower)) return lower as CanonicalThemeId;
  if (input === 'Sunny') return 'light';
  return 'dark';
}

/** Derive optional dark variant from user-facing theme id. */
export function resolveDarkVariant(input: EchoThemeId): EchoDarkVariantId {
  return input === 'Amoled' ? 'amoled' : 'default';
}

/**
 * Dark variant for the DOM after resolving canonical light/dark.
 * OS sync only swaps `Dark` vs `Light`; the user's saved swatch (`Amoled` vs `Dark`)
 * must still apply when the effective appearance is dark — otherwise Amoled never
 * activates for anyone with sync enabled.
 */
export function resolveEffectiveDarkVariant(
  canonicalTheme: CanonicalThemeId,
  baseThemeId: EchoThemeId,
): EchoDarkVariantId {
  if (canonicalTheme !== 'dark') return 'default';
  return resolveDarkVariant(baseThemeId);
}

/** Derive optional light variant from user-facing theme id. */
export function resolveLightVariant(input: EchoThemeId): EchoLightVariantId {
  return input === 'Sunny' ? 'sunny' : 'default';
}

/**
 * Light variant for the DOM after resolving canonical light/dark.
 * OS sync only swaps `Dark` vs `Light`; the user's saved swatch (`Sunny` vs `Light`)
 * must still apply when the effective appearance is light — otherwise Sunny never
 * activates for anyone with sync enabled.
 */
export function resolveEffectiveLightVariant(
  canonicalTheme: CanonicalThemeId,
  baseThemeId: EchoThemeId,
): EchoLightVariantId {
  if (canonicalTheme !== 'light') return 'default';
  return resolveLightVariant(baseThemeId);
}

export function normalizeThemeId(input: unknown): EchoThemeId {
  const v = typeof input === 'string' ? input.trim() : '';
  if (v === 'Light' || v === 'Amoled' || v === 'Sunny') return v;
  return 'Dark';
}

export function loadPersistedThemeId(): EchoThemeId {
  if (typeof localStorage === 'undefined') return 'Dark';
  try {
    return normalizeThemeId(localStorage.getItem(STORAGE_KEY_THEME));
  } catch {
    return 'Dark';
  }
}

export function persistThemeId(theme: EchoThemeId): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_THEME, theme);
  } catch {
    // ignore storage quota / privacy mode
  }
}

export function loadPersistedSyncWithSystem(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SYNC_SYSTEM);
    /* Default off: OS sync overrides manual Light/Dark until user discovers the toggle. */
    if (raw === null) return false;
    return raw === '1';
  } catch {
    return false;
  }
}

export function persistSyncWithSystem(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_SYNC_SYSTEM, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

/** Default off — higher-chroma accents when enabled (Settings → Vibrant Accents). */
export function loadPersistedVibrantAccents(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VIBRANT_ACCENTS);
    if (raw === null) return false;
    return raw === '1';
  } catch {
    return false;
  }
}

export function persistVibrantAccents(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_VIBRANT_ACCENTS, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

const DENSITY_SET: ReadonlySet<string> = new Set<EchoInterfaceDensityId>([
  'Compact',
  'Comfortable',
  'Spacious',
]);

export function normalizeInterfaceDensityId(
  input: unknown,
): EchoInterfaceDensityId {
  const v = typeof input === 'string' ? input.trim() : '';
  if (DENSITY_SET.has(v)) return v as EchoInterfaceDensityId;
  return 'Comfortable';
}

export function loadPersistedInterfaceDensity(): EchoInterfaceDensityId {
  if (typeof localStorage === 'undefined') return 'Comfortable';
  try {
    return normalizeInterfaceDensityId(
      localStorage.getItem(STORAGE_KEY_INTERFACE_DENSITY),
    );
  } catch {
    return 'Comfortable';
  }
}

export function persistInterfaceDensity(density: EchoInterfaceDensityId): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_INTERFACE_DENSITY, density);
  } catch {
    // ignore
  }
}

export function normalizeActionRailPlacement(
  input: unknown,
): EchoActionRailPlacementId {
  const v = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (v === 'top') return 'top';
  return 'left';
}

export function loadPersistedActionRailPlacement(): EchoActionRailPlacementId {
  if (typeof localStorage === 'undefined') return 'left';
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTION_RAIL_PLACEMENT);
    return normalizeActionRailPlacement(raw);
  } catch {
    return 'left';
  }
}

export function persistActionRailPlacement(
  placement: EchoActionRailPlacementId,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_ACTION_RAIL_PLACEMENT, placement);
  } catch {
    // ignore
  }
}

/**
 * Sets `data-echo-density` on `<html>` for density.scss overrides.
 * Comfortable → attribute removed (baseline matches historical UI).
 */
export function applyInterfaceDensityToDocument(
  density: EchoInterfaceDensityId,
): void {
  if (typeof document === 'undefined') return;
  const d = normalizeInterfaceDensityId(density);
  if (d === 'Comfortable') {
    delete document.documentElement.dataset.echoDensity;
    return;
  }
  document.documentElement.dataset.echoDensity =
    d === 'Compact' ? 'compact' : 'spacious';
}

/**
 * Sets `data-echo-vibrant-accents` on `<html>` for themes.scss overrides.
 * When enabled: attribute value is `"on"` (matches `html[data-echo-vibrant-accents='on']`).
 * When disabled: attribute is removed (not `"false"`).
 */
export function applyVibrantAccentsToDocument(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  if (enabled) {
    document.documentElement.dataset.echoVibrantAccents = 'on';
  } else {
    delete document.documentElement.dataset.echoVibrantAccents;
  }
}

/** Sets dark variant modifier on `<html>` when canonical theme is dark. */
export function applyDarkVariantToDocument(
  canonicalTheme: CanonicalThemeId,
  variant: EchoDarkVariantId,
): void {
  if (typeof document === 'undefined') return;
  if (canonicalTheme === 'dark' && variant === 'amoled') {
    document.documentElement.dataset.echoDarkVariant = 'amoled';
  } else {
    delete document.documentElement.dataset.echoDarkVariant;
  }
}

/** Sets light variant modifier on `<html>` when canonical theme is light. */
export function applyLightVariantToDocument(
  canonicalTheme: CanonicalThemeId,
  variant: EchoLightVariantId,
): void {
  if (typeof document === 'undefined') return;
  if (canonicalTheme === 'light' && variant === 'sunny') {
    document.documentElement.dataset.echoLightVariant = 'sunny';
  } else {
    delete document.documentElement.dataset.echoLightVariant;
  }
}

export function resolveSystemThemeId(): EchoThemeId {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return 'Dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'Light'
    : 'Dark';
}

/** Write canonical theme to DOM. Only canonical values allowed. */
export function applyThemeToDocument(theme: CanonicalThemeId): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

/**
 * Browser / installed PWA chrome: `theme-color` drives the tab/status bar on
 * mobile and some desktop PWA window frames. Static `manifest.webmanifest` and
 * `index.html` defaults are overridden here whenever the active theme changes.
 *
 * Hex values match `themes.scss` `--bg` (dark default, light, Sunny, AMOLED).
 */
export function applyBrowserChromeThemeColor(
  canonicalTheme: CanonicalThemeId,
  darkVariant: EchoDarkVariantId,
  lightVariant: EchoLightVariantId = 'default',
): void {
  if (typeof document === 'undefined') return;
  const hex =
    canonicalTheme === 'light'
      ? lightVariant === 'sunny'
        ? '#faf3e6'
        : '#e6ebf4'
      : darkVariant === 'amoled'
        ? '#000000'
        : '#0d0812';
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', hex);
}
