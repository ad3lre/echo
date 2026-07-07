import {
  applyBrowserChromeThemeColor,
  applyDarkVariantToDocument,
  applyInterfaceDensityToDocument,
  applyLightVariantToDocument,
  applyThemeToDocument,
  applyVibrantAccentsToDocument,
  loadPersistedInterfaceDensity,
  loadPersistedSyncWithSystem,
  loadPersistedThemeId,
  loadPersistedVibrantAccents,
  resolveCanonicalTheme,
  resolveEffectiveDarkVariant,
  resolveEffectiveLightVariant,
  resolveSystemThemeId,
} from '@/utils/theme';
import {
  loadAccessibilityPreferences,
  applyAccessibilityPreferences,
  reconcileSolidGlassPreferenceForWeakCompositors,
} from '@/features/settings/accessibilityPreferences';

/**
 * Phase A boot: hydrate the persisted theme, dark/light variants, vibrant
 * accents, interface density, and accessibility preferences before first
 * paint. Called from `main.ts` ahead of `bootstrap()`.
 */
export function hydrateBootThemeAndPreferences(): void {
  const persistedThemeId = loadPersistedThemeId();
  const bootResolvedTheme = loadPersistedSyncWithSystem()
    ? resolveSystemThemeId()
    : persistedThemeId;
  const bootCanonicalTheme = resolveCanonicalTheme(bootResolvedTheme);
  applyThemeToDocument(bootCanonicalTheme);
  const bootDarkVariant = resolveEffectiveDarkVariant(
    bootCanonicalTheme,
    persistedThemeId,
  );
  const bootLightVariant = resolveEffectiveLightVariant(
    bootCanonicalTheme,
    persistedThemeId,
  );
  applyDarkVariantToDocument(bootCanonicalTheme, bootDarkVariant);
  applyLightVariantToDocument(bootCanonicalTheme, bootLightVariant);
  applyBrowserChromeThemeColor(
    bootCanonicalTheme,
    bootDarkVariant,
    bootLightVariant,
  );
  applyVibrantAccentsToDocument(loadPersistedVibrantAccents());
  applyInterfaceDensityToDocument(loadPersistedInterfaceDensity());
  const bootA11yPrefs = loadAccessibilityPreferences();
  applyAccessibilityPreferences(bootA11yPrefs);
  void reconcileSolidGlassPreferenceForWeakCompositors();
  if (bootA11yPrefs.dyslexiaFriendlyFont) {
    void import('@fontsource/atkinson-hyperlegible/latin-400.css');
    void import('@fontsource/atkinson-hyperlegible/latin-400-italic.css');
    void import('@fontsource/atkinson-hyperlegible/latin-700.css');
    void import('@fontsource/atkinson-hyperlegible/latin-700-italic.css');
  }
}
