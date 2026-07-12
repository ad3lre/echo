import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { isWebKitDesktop } from '@/platform/browserCompatibility';
import {
  applyAccessibilityPreferences,
  loadAccessibilityPreferences,
} from '@/features/settings/accessibilityPreferences';
import { logDesktopBootDiag } from '@/platform/desktopBootDiagnostics';
import { THEMES_SELECTION_COMING_SOON } from '@/features/settings/data';
import {
  applyBrowserChromeThemeColor,
  applyDarkVariantToDocument,
  applyInterfaceDensityToDocument,
  applyLightVariantToDocument,
  applyThemeToDocument,
  applyVibrantAccentsToDocument,
  loadPersistedActionRailPlacement,
  loadPersistedInterfaceDensity,
  loadPersistedSyncWithSystem,
  loadPersistedThemeId,
  loadPersistedVibrantAccents,
  persistActionRailPlacement,
  persistInterfaceDensity,
  persistSyncWithSystem,
  persistThemeId,
  persistVibrantAccents,
  resolveCanonicalTheme,
  resolveEffectiveDarkVariant,
  resolveEffectiveLightVariant,
  resolveSystemThemeId,
  type CanonicalThemeId,
  type EchoActionRailPlacementId,
  type EchoDarkVariantId,
  type EchoInterfaceDensityId,
  type EchoLightVariantId,
  type EchoThemeId,
} from '@/utils/theme';

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<EchoThemeId>(loadPersistedThemeId());
  const syncWithSystem = ref<boolean>(loadPersistedSyncWithSystem());
  const vibrantAccents = ref<boolean>(loadPersistedVibrantAccents());
  const interfaceDensity = ref<EchoInterfaceDensityId>(
    loadPersistedInterfaceDensity(),
  );
  const actionRailPlacement = ref<EchoActionRailPlacementId>(
    loadPersistedActionRailPlacement(),
  );
  const systemPrefersDark = ref<boolean>(
    typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  const baseTheme = computed<EchoThemeId>(() => theme.value);
  const systemTheme = computed<EchoThemeId>(() => {
    void systemPrefersDark.value;
    return resolveSystemThemeId();
  });
  /** OS sync is disabled while theme selection is gated (see THEMES_SELECTION_COMING_SOON). */
  const resolvedTheme = computed<EchoThemeId>(() => {
    const shouldSyncWithSystem =
      !THEMES_SELECTION_COMING_SOON && syncWithSystem.value;
    return shouldSyncWithSystem ? systemTheme.value : baseTheme.value;
  });
  const canonicalTheme = computed<CanonicalThemeId>(() =>
    resolveCanonicalTheme(resolvedTheme.value),
  );
  const darkVariant = computed<EchoDarkVariantId>(() =>
    resolveEffectiveDarkVariant(canonicalTheme.value, baseTheme.value),
  );
  const lightVariant = computed<EchoLightVariantId>(() =>
    resolveEffectiveLightVariant(canonicalTheme.value, baseTheme.value),
  );
  const effectiveThemeState = computed(() => ({
    canonicalTheme: canonicalTheme.value,
    darkVariant: darkVariant.value,
    lightVariant: lightVariant.value,
    syncWithSystem: syncWithSystem.value,
    vibrantAccents: vibrantAccents.value,
  }));

  let applyRafId: number | null = null;
  let themeRepaintRafId: number | null = null;
  let lastApplied: {
    theme: CanonicalThemeId;
    darkVariant: EchoDarkVariantId;
    lightVariant: EchoLightVariantId;
    vibrantAccents: boolean;
    interfaceDensity: EchoInterfaceDensityId;
  } | null = null;
  function apply(): void {
    const next = {
      theme: canonicalTheme.value,
      darkVariant: darkVariant.value,
      lightVariant: lightVariant.value,
      vibrantAccents: vibrantAccents.value,
      interfaceDensity: interfaceDensity.value,
    };
    if (
      lastApplied &&
      lastApplied.theme === next.theme &&
      lastApplied.darkVariant === next.darkVariant &&
      lastApplied.lightVariant === next.lightVariant &&
      lastApplied.vibrantAccents === next.vibrantAccents &&
      lastApplied.interfaceDensity === next.interfaceDensity
    ) {
      return;
    }
    if (isWebKitDesktop()) {
      const prefs = loadAccessibilityPreferences();
      applyAccessibilityPreferences(prefs);
      logDesktopBootDiag('theme.store:apply:webkit-solid-glass', {
        solidGlass: prefs.solidGlassSurfaces,
        canonicalTheme: next.theme,
        darkVariant: next.darkVariant,
        lightVariant: next.lightVariant,
      });
    }
    logDesktopBootDiag('theme.store:apply:before-dom', {
      canonicalTheme: next.theme,
      darkVariant: next.darkVariant,
      lightVariant: next.lightVariant,
      vibrantAccents: next.vibrantAccents,
      interfaceDensity: next.interfaceDensity,
    });
    applyThemeToDocument(next.theme);
    applyDarkVariantToDocument(next.theme, next.darkVariant);
    applyLightVariantToDocument(next.theme, next.lightVariant);
    applyBrowserChromeThemeColor(
      next.theme,
      next.darkVariant,
      next.lightVariant,
    );
    applyVibrantAccentsToDocument(next.vibrantAccents);
    applyInterfaceDensityToDocument(next.interfaceDensity);
    lastApplied = next;
    const root =
      typeof document === 'undefined' ? null : document.documentElement;
    logDesktopBootDiag('theme.store:apply:after-dom', {
      htmlTheme: root?.dataset.theme ?? null,
      echoSolidGlass: root?.dataset.echoSolidGlass ?? null,
    });
    nudgeWebKitRepaintAfterThemeApply();
  }

  /** WKWebView can leave backdrop-filter layers blank after CSS variable churn. */
  function nudgeWebKitRepaintAfterThemeApply(): void {
    if (!isWebKitDesktop() || typeof document === 'undefined') return;
    if (themeRepaintRafId != null) cancelAnimationFrame(themeRepaintRafId);
    const root = document.documentElement;
    root.dataset.echoThemeRepaint = '1';
    void root.offsetHeight;
    themeRepaintRafId = requestAnimationFrame(() => {
      themeRepaintRafId = null;
      delete root.dataset.echoThemeRepaint;
    });
  }

  function scheduleApply(): void {
    if (typeof requestAnimationFrame === 'function') {
      if (applyRafId != null) return;
      applyRafId = requestAnimationFrame(() => {
        applyRafId = null;
        apply();
      });
      return;
    }
    apply();
  }

  function hydrateFromStorage(): void {
    const nextTheme = loadPersistedThemeId();
    const nextSync = loadPersistedSyncWithSystem();
    const nextVibrant = loadPersistedVibrantAccents();
    const nextDensity = loadPersistedInterfaceDensity();
    if (theme.value !== nextTheme) theme.value = nextTheme;
    if (syncWithSystem.value !== nextSync) syncWithSystem.value = nextSync;
    if (vibrantAccents.value !== nextVibrant)
      vibrantAccents.value = nextVibrant;
    if (interfaceDensity.value !== nextDensity)
      interfaceDensity.value = nextDensity;
    const nextPlacement = loadPersistedActionRailPlacement();
    if (actionRailPlacement.value !== nextPlacement)
      actionRailPlacement.value = nextPlacement;
    scheduleApply();
  }

  function setTheme(next: EchoThemeId): void {
    theme.value = next;
    persistThemeId(next);
    /* Explicit swatch choice must win over OS sync (otherwise Light does nothing on dark OS). */
    if (syncWithSystem.value) {
      syncWithSystem.value = false;
      persistSyncWithSystem(false);
    }
    scheduleApply();
  }

  function setSyncWithSystem(next: boolean): void {
    syncWithSystem.value = next;
    persistSyncWithSystem(next);
    scheduleApply();
  }

  function setVibrantAccents(next: boolean): void {
    vibrantAccents.value = next;
    persistVibrantAccents(next);
  }

  function setInterfaceDensity(next: EchoInterfaceDensityId): void {
    interfaceDensity.value = next;
    persistInterfaceDensity(next);
  }

  function setActionRailPlacement(next: EchoActionRailPlacementId): void {
    if (actionRailPlacement.value === next) return;
    actionRailPlacement.value = next;
    persistActionRailPlacement(next);
  }

  // --- OS prefers-color-scheme listener ---
  let mediaQuery: MediaQueryList | null = null;
  let mediaHandler: (() => void) | null = null;

  function startSystemListener(): void {
    stopSystemListener();
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    )
      return;
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemPrefersDark.value = mediaQuery.matches;
    mediaHandler = () => {
      if (!mediaQuery) return;
      systemPrefersDark.value = mediaQuery.matches;
    };
    mediaQuery.addEventListener('change', mediaHandler);
  }

  function stopSystemListener(): void {
    if (mediaQuery && mediaHandler) {
      mediaQuery.removeEventListener('change', mediaHandler);
    }
    mediaQuery = null;
    mediaHandler = null;
  }

  watch(
    syncWithSystem,
    (on) => {
      if (THEMES_SELECTION_COMING_SOON) {
        stopSystemListener();
        return;
      }
      if (on) startSystemListener();
      else stopSystemListener();
    },
    { immediate: true },
  );

  watch(
    [
      canonicalTheme,
      darkVariant,
      lightVariant,
      vibrantAccents,
      interfaceDensity,
    ],
    () => {
      scheduleApply();
    },
  );

  // Initialize early so first reactive mount sees correct DOM attribute.
  scheduleApply();

  return {
    theme,
    syncWithSystem,
    vibrantAccents,
    interfaceDensity,
    actionRailPlacement,
    systemTheme,
    resolvedTheme,
    canonicalTheme,
    darkVariant,
    lightVariant,
    effectiveThemeState,
    hydrateFromStorage,
    setTheme,
    setSyncWithSystem,
    setVibrantAccents,
    setInterfaceDensity,
    setActionRailPlacement,
    /** Stop OS listener — call from app teardown if needed. */
    stopSystemListener,
  };
});
