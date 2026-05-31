import { ensurePdfEnvironmentPolyfills } from '@/features/pdf/ensurePdfEnvironment';

ensurePdfEnvironmentPolyfills();

import { API_BASE } from '@/config';
import { createApp, type Plugin } from 'vue';
import App from './App.vue';
import { createPinia } from 'pinia';
import { i18n, initEchoI18n } from '@/i18n';
import {
  applyEchoLocaleFromPreferences,
  loadTimeLanguagePreferences,
} from '@/features/settings/timeLanguagePreferences';
import { echoT } from '@/i18n';
import { useAuthSessionStore } from '@/stores/authSession';
import { useBugHunterStore } from '@/stores/bugHunter';
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
import { getEchoPlatform } from '@/platform/createEchoPlatform';
import type { WorkspaceStateApi } from '@/composables/useEchoWorkspace';
import {
  readJwtSub,
  readWorkspaceSessionCache,
} from '@/utils/workspaceSessionCache';
import { scrollbarOnScroll } from '@/directives/scrollbarOnScroll';
import { spoilerReveal } from '@/directives/spoilerReveal';
/* Critical path: one Inter weight; 600/700 load after first paint. */
import '@fontsource/inter/latin-400.css';

import './assets/tailwind.css';
import './assets/themes.scss';
import './assets/density.scss';
import './assets/accessibility.scss';
import './assets/main.scss';
import './assets/document-canvas.scss';
import { registerEchoServiceWorker } from '@/registerServiceWorker';
import { initDesktopDeepLinks } from '@/platform/desktopDeepLink';
import { isDesktop } from '@/platform/desktopBridge';
import {
  clearAllPendingDesktopOAuthHandoffState,
  readPendingDesktopOAuthHandoffCode,
  readPendingDesktopOAuthHandoffNonce,
} from '@/platform/desktopOAuthHandoff';
import { enqueueStartupTask } from '@/utils/startupScheduler';
import { applyGpuTierToDocument, detectGpuTier } from '@/utils/gpuTier';
import { installDevConsoleLogRecorder } from '@/dev/consoleLogRecorder';
import { installGlobalAudioPlaybackUnlock } from '@/audio/audioPlaybackUnlock';
import {
  preloadEchoSounds,
  primeEchoAudioPlayback,
} from '@/composables/useEchoSounds';
import {
  clearSkipAutoGuestOnce,
  setSkipAutoGuestOnce,
} from '@/utils/autoGuestOAuthReturn';
import { authDesktopRedeemHandoff, authFetchMe } from '@/api/authClient';
import { registerAuthSessionApiBridge } from '@/api/authSessionBridge';
import { withTransientFetchRetries } from '@/utils/retryTransientFetch';
import {
  loadAccessibilityPreferences,
  applyAccessibilityPreferences,
} from '@/features/settings/accessibilityPreferences';
import { ensureEchoBrandFavicon } from '@/utils/ensureEchoBrandFavicon';
import {
  runIosBootCheck,
  hasStoredSessionToRestore,
  notifyAppAuthenticated,
  startSessionHeartbeat,
} from '@/services/auth/iosBootOrchestrator';
import { bootstrapNativeBearerSessionFromKeychain } from '@/api/authClient';
import {
  markIosNativeShell,
  detectIosSimulator,
} from '@/platform/iosNativeFeedback';

ensureEchoBrandFavicon();
markIosNativeShell();
/* Resolve the iOS Simulator flag ASAP so audio priming can be skipped there
 * (the Simulator's CoreAudio times out starting an audio unit and aborts WebKit's
 * GPU process). Fire-and-forget: resolves in ~ms, long before the first tap that
 * would prime audio. No-op / false on real devices and non-iOS builds. */
void detectIosSimulator();
registerEchoServiceWorker();
applyGpuTierToDocument(detectGpuTier());
installDevConsoleLogRecorder();
installGlobalAudioPlaybackUnlock(() => {
  primeEchoAudioPlayback();
  preloadEchoSounds();
});

// Phase A: hydrate theme + dark variant before first paint.
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
if (bootA11yPrefs.dyslexiaFriendlyFont) {
  void import('@fontsource/atkinson-hyperlegible/latin-400.css');
  void import('@fontsource/atkinson-hyperlegible/latin-700.css');
}

function loadDeferredInterWeights() {
  void import('@fontsource/inter/latin-600.css');
  void import('@fontsource/inter/latin-700.css');
}

async function bootstrap() {
  const iosBootDecision = await runIosBootCheck();

  if (isDesktop()) {
    /** Attach before mount so cold-start launches from `echo://…` do not miss `getCurrent()`. */
    void initDesktopDeepLinks();
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<string>('desktop_log_path'))
      .then((path) => {
        console.warn(`[echo-desktop] log file: ${path}`);
      })
      .catch(() => {
        /* ignore */
      });
    if (
      import.meta.env.DEV &&
      import.meta.env.VITE_ECHO_DESKTOP_DIAGNOSTICS === '1'
    ) {
      void fetch(`${API_BASE}/api/v1/health`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
      })
        .then(async (res) => {
          let bodyPreview = '';
          try {
            bodyPreview = (await res.text()).slice(0, 240);
          } catch {
            /* ignore */
          }
          console.warn('[echo-desktop] api health probe', {
            url: `${API_BASE}/api/v1/health`,
            status: res.status,
            ok: res.ok,
            bodyPreview,
          });
        })
        .catch((error: unknown) => {
          console.error('[echo-desktop] api health probe failed', {
            url: `${API_BASE}/api/v1/health`,
            error:
              error instanceof Error
                ? { name: error.name, message: error.message }
                : String(error),
          });
        });
      void fetch(`${API_BASE}/api/v1/auth/me`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'include',
        cache: 'no-store',
      })
        .then(async (res) => {
          let bodyPreview = '';
          try {
            bodyPreview = (await res.text()).slice(0, 240);
          } catch {
            /* ignore */
          }
          console.warn('[echo-desktop] auth/me include probe', {
            url: `${API_BASE}/api/v1/auth/me`,
            status: res.status,
            ok: res.ok,
            bodyPreview,
          });
        })
        .catch((error: unknown) => {
          console.error('[echo-desktop] auth/me include probe failed', {
            url: `${API_BASE}/api/v1/auth/me`,
            error:
              error instanceof Error
                ? { name: error.name, message: error.message }
                : String(error),
          });
        });
      void fetch(`${API_BASE}/api/v1/auth/me`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
      })
        .then(async (res) => {
          let bodyPreview = '';
          try {
            bodyPreview = (await res.text()).slice(0, 240);
          } catch {
            /* ignore */
          }
          console.warn('[echo-desktop] auth/me omit probe', {
            url: `${API_BASE}/api/v1/auth/me`,
            status: res.status,
            ok: res.ok,
            bodyPreview,
          });
        })
        .catch((error: unknown) => {
          console.error('[echo-desktop] auth/me omit probe failed', {
            url: `${API_BASE}/api/v1/auth/me`,
            error:
              error instanceof Error
                ? { name: error.name, message: error.message }
                : String(error),
          });
        });
    }
  }

  await initEchoI18n(loadTimeLanguagePreferences().locale);

  const app = createApp(App);
  app.use(i18n as Plugin);
  app.directive('scrollbar-on-scroll', scrollbarOnScroll);
  app.directive('spoiler-reveal', spoilerReveal);
  const pinia = createPinia();

  app.use(pinia);

  registerAuthSessionApiBridge({
    invalidateSessionForReauth(message: string) {
      useAuthSessionStore().invalidateSessionForReauth(message);
    },
    clearLocalTokens() {
      useAuthSessionStore().clearLocalTokens();
    },
  });

  const authSessionStore = useAuthSessionStore();
  /* Synchronous: rehydrates `backendUser` from the local identity cache (if any)
   * so Vue can mount straight into the app shell instead of flashing the auth
   * gate while `/auth/me` is in flight. The session is validated below, after
   * `app.mount()`, so first paint is never blocked on a network round-trip. */
  authSessionStore.hydrateFromStorage();

  if (hasStoredSessionToRestore() || authSessionStore.isSessionUnverified) {
    const bearerUser = await bootstrapNativeBearerSessionFromKeychain();
    if (bearerUser) {
      authSessionStore.applyRestoredProfile(bearerUser, {
        allowUnauthenticated: true,
      });
    }
  }

  /**
   * Warm paint before mount: if a returning user already holds a session token
   * plus a cached workspace snapshot, apply it now so the very first frame paints
   * the servers rail / channels / members instead of the boot spinner → explore
   * flash. `startInitialLoad()` (kicked off after mount) keeps this paint and
   * reconciles authoritatively with `/workspace` in the background.
   */
  try {
    const preToken = authSessionStore.accessToken?.trim() || '';
    const preSub = preToken ? readJwtSub(preToken) : null;
    if (preSub) {
      const preCache = readWorkspaceSessionCache(preSub);
      if (preCache) {
        (
          getEchoPlatform().workspace as WorkspaceStateApi
        ).preHydrateFromSessionCache(preCache);
      }
    }
  } catch {
    /* best-effort warm paint; startInitialLoad still hydrates authoritatively */
  }

  await applyEchoLocaleFromPreferences(
    authSessionStore.backendUser?.locale ?? null,
  );
  useBugHunterStore();

  /**
   * OAuth return params must be applied before `app.mount`: Settings (and other
   * surfaces) read `echo_discord_oauth_error` / `echo_google_oauth_error` in
   * `onMounted`. If we wrote those after mount, connect-Discord (link) failures
   * were missed and looked “silent”.
   */
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    let shouldStrip = false;
    if (params.get('emailVerified') === '1') {
      params.delete('emailVerified');
      shouldStrip = true;
      authSessionStore.setEmailVerificationFlash(
        echoT('bootstrap.emailVerifiedFlash'),
      );
    }
    if (isDesktop()) {
      console.warn('[echo-desktop] bootstrap desktop handoff check', {
        href: window.location.href,
        hasQueryHandoff: Boolean(params.get('echo_handoff')?.trim()),
        hasStoredHandoff: Boolean(readPendingDesktopOAuthHandoffCode()),
        hasPendingNonce: Boolean(readPendingDesktopOAuthHandoffNonce()),
      });
      const echoHandoff =
        params.get('echo_handoff')?.trim() ||
        readPendingDesktopOAuthHandoffCode();
      if (echoHandoff) {
        const handoffLen = echoHandoff.length;
        const handoffHex64 = /^[0-9a-f]{64}$/i.test(echoHandoff);
        console.warn('[echo-desktop] bootstrap handoff token shape', {
          handoffLen,
          handoffHex64,
        });
      }
      if (params.get('echo_handoff')?.trim()) {
        params.delete('echo_handoff');
        shouldStrip = true;
      }
      if (echoHandoff) {
        const pendingNonce = readPendingDesktopOAuthHandoffNonce();
        if (!pendingNonce) {
          console.error('[echo-desktop] bootstrap missing pending nonce', {
            hasHandoff: true,
          });
          clearAllPendingDesktopOAuthHandoffState();
          try {
            sessionStorage.setItem(
              'echo_discord_oauth_error',
              'desktop_handoff_failed',
            );
          } catch {
            /* ignore */
          }
        } else {
          setSkipAutoGuestOnce();
          try {
            console.warn('[echo-desktop] bootstrap redeem start', {
              hasHandoff: true,
            });
            const payload = await authDesktopRedeemHandoff(
              echoHandoff,
              pendingNonce,
            );
            authSessionStore.setSession(payload);
            clearAllPendingDesktopOAuthHandoffState();
            clearSkipAutoGuestOnce();
            /**
             * Warm credentialed cross-origin requests before `app.mount()` so
             * `startInitialLoad` / Echo layout hydrates do not race the first
             * cookie application (WebView2 often surfaces that as `Failed to fetch`).
             */
            try {
              await withTransientFetchRetries(() => authFetchMe());
            } catch (primeError: unknown) {
              console.warn(
                '[echo-desktop] bootstrap post-redeem session prime failed',
                {
                  err:
                    primeError instanceof Error
                      ? { name: primeError.name, message: primeError.message }
                      : String(primeError),
                },
              );
            }
            console.warn('[echo-desktop] bootstrap redeem success', {
              userId: payload.user.id,
            });
          } catch (error) {
            console.error('[echo-desktop] bootstrap redeem failed', {
              hasHandoff: true,
              error,
            });
            clearAllPendingDesktopOAuthHandoffState();
            const recovered = await authSessionStore.restoreSessionFromApi();
            if (!recovered) {
              try {
                sessionStorage.setItem(
                  'echo_discord_oauth_error',
                  'desktop_handoff_failed',
                );
              } catch {
                /* ignore */
              }
            } else {
              console.warn(
                '[echo-desktop] bootstrap recover via /auth/me succeeded after redeem failure',
              );
              clearSkipAutoGuestOnce();
            }
          }
        }
      }
    }
    const discordErr = params.get('discord_error')?.trim();
    if (discordErr) {
      try {
        sessionStorage.setItem('echo_discord_oauth_error', discordErr);
      } catch {
        /* ignore */
      }
      params.delete('discord_error');
      shouldStrip = true;
    }
    const discordLinkedParam = params.get('discord_linked');
    if (discordLinkedParam !== null) {
      params.delete('discord_linked');
      shouldStrip = true;
      /**
       * Link flow success (`discord_linked=1`) does not rotate the browser session the way
       * Discord login does, but `/auth/me` must be refetched so the client sees Discord link
       * state and `guestPendingEmail` after onboarding OAuth — otherwise add-server import /
       * guest onboarding looks “stuck” after redirect.
       */
      if (discordLinkedParam === '1') {
        const user = await authSessionStore.restoreSessionFromApi();
        if (!user) {
          try {
            sessionStorage.setItem(
              'echo_discord_oauth_error',
              'session_restore_failed',
            );
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (params.get('discord_verify_email_sent') === '1') {
      params.delete('discord_verify_email_sent');
      shouldStrip = true;
      authSessionStore.setEmailVerificationFlash(
        echoT('bootstrap.emailVerifiedFlash'),
      );
    }
    const googleErr = params.get('google_error')?.trim();
    if (googleErr) {
      try {
        sessionStorage.setItem('echo_google_oauth_error', googleErr);
      } catch {
        /* ignore */
      }
      params.delete('google_error');
      shouldStrip = true;
    }
    const googleLinkedParam = params.get('google_linked');
    if (googleLinkedParam !== null) {
      params.delete('google_linked');
      shouldStrip = true;
      if (googleLinkedParam === '1') {
        const user = await authSessionStore.restoreSessionFromApi();
        if (!user) {
          try {
            sessionStorage.setItem(
              'echo_google_oauth_error',
              'session_restore_failed',
            );
          } catch {
            /* ignore */
          }
        } else {
          try {
            sessionStorage.setItem('echo_google_oauth_linked', '1');
          } catch {
            /* ignore */
          }
        }
      }
    }
    const youtubeErr = params.get('youtube_error')?.trim();
    if (youtubeErr) {
      try {
        sessionStorage.setItem('echo_youtube_oauth_error', youtubeErr);
      } catch {
        /* ignore */
      }
      params.delete('youtube_error');
      shouldStrip = true;
    }
    const youtubeLinkedParam = params.get('youtube_linked');
    if (youtubeLinkedParam !== null) {
      params.delete('youtube_linked');
      shouldStrip = true;
    }
    if (params.get('discord_login') === '1') {
      if (params.get('discord_guest_signup') === '1') {
        params.delete('discord_guest_signup');
        try {
          sessionStorage.setItem('echo_discord_guest_signup', '1');
        } catch {
          /* ignore */
        }
      }
      params.delete('discord_login');
      shouldStrip = true;
      setSkipAutoGuestOnce();
      const user = await authSessionStore.restoreSessionFromApi();
      if (user) {
        clearSkipAutoGuestOnce();
      } else {
        try {
          sessionStorage.setItem(
            'echo_discord_oauth_error',
            'session_restore_failed',
          );
        } catch {
          /* ignore */
        }
      }
    }
    if (params.get('google_login') === '1') {
      params.delete('google_login');
      shouldStrip = true;
      setSkipAutoGuestOnce();
      const user = await authSessionStore.restoreSessionFromApi();
      if (user) {
        clearSkipAutoGuestOnce();
      } else {
        try {
          sessionStorage.setItem(
            'echo_google_oauth_error',
            'session_restore_failed',
          );
        } catch {
          /* ignore */
        }
      }
    }
    if (shouldStrip) {
      const qs = params.toString();
      const nextPath = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
      window.history.replaceState(
        null,
        '',
        nextPath || window.location.pathname,
      );
    }
  }

  const appEl = document.getElementById('app');
  if (appEl) appEl.setAttribute('data-echo-mounted', '');

  app.mount('#app');

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => loadDeferredInterWeights());
  } else {
    loadDeferredInterWeights();
  }

  const workspace = getEchoPlatform().workspace as WorkspaceStateApi;
  void workspace.startInitialLoad();

  /**
   * Background session validation.
   *
   * On cold start `hydrateFromStorage()` may have populated `backendUser` from the
   * local identity cache so the app shell could paint instantly. We now reconcile
   * with the server in a fire-and-forget task:
   *
   *   - Success → `restoreSessionFromApi` refreshes the user / planLimits and
   *     clears `isSessionUnverified`. UI updates reactively if any field changed.
   *   - 401 / 403 → `restoreSessionFromApi`'s benign-401 branch calls
   *     `clearLocalTokens`, which wipes the identity cache and `backendUser`, so
   *     the auth gate appears via the same reactive path users see after logout.
   *
   * Two cases trigger this:
   *   1. Native iOS boot orchestrator detected a Keychain-stored session
   *      (`hasStoredSessionToRestore()`).
   *   2. We hydrated from cache and now hold an unverified identity that needs
   *      a server check.
   */
  const needsServerValidation =
    hasStoredSessionToRestore() || authSessionStore.isSessionUnverified;
  if (needsServerValidation) {
    void (async () => {
      const restored = await authSessionStore.restoreSessionFromApi();
      if (restored) {
        await notifyAppAuthenticated();
        startSessionHeartbeat();
      }
    })();
  } else if (iosBootDecision && authSessionStore.isAuthenticated) {
    void notifyAppAuthenticated();
    startSessionHeartbeat();
  }

  enqueueStartupTask('gif-library-preload', 'idle', () => {
    void import('@/composables/useGifSearch').then((m) =>
      m.warmGifCategoryLibrary(),
    );
  });

  /** Warm icon catalog shortly after first paint. */
  enqueueStartupTask('icon-catalog-preload', 'high', () => {
    void import('@/assets/iconCatalog').then((m) =>
      m.ensureIconCatalogLoaded(),
    );
  });

  enqueueStartupTask('time-language-prewarm', 'high', () => {
    void import('@/features/settings/timeLanguagePreferences').then((m) =>
      m.loadTimeLanguagePreferences(),
    );
  });

  /** Defer audio decode until first interaction (or 5s fallback). */
  enqueueStartupTask('echo-sounds-preload', 'idle', () => {
    preloadEchoSounds();
  });
}

function renderBootstrapFatalFallback(error: unknown) {
  console.error('[echo][bootstrap] fatal startup failure', {
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : String(error),
  });
  if (typeof document === 'undefined') return;
  const mount = document.getElementById('app');
  if (!mount) return;
  mount.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'echo-app-splash h-full w-full min-h-0 bg-bg';
  shell.setAttribute('role', 'alert');
  const inner = document.createElement('div');
  inner.className = 'echo-app-load-error__inner';
  const title = document.createElement('p');
  title.className = 'echo-app-load-error__title';
  title.textContent = echoT('bootstrap.fatalTitle');
  const detail = document.createElement('p');
  detail.className = 'echo-app-load-error__detail';
  detail.textContent = echoT('bootstrap.fatalDetail');
  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'echo-app-load-error__retry';
  retryButton.textContent = echoT('common.refreshPage');
  retryButton.addEventListener('click', () => window.location.reload());
  inner.append(title, detail, retryButton);
  shell.appendChild(inner);
  mount.appendChild(shell);
}

void bootstrap().catch((error: unknown) => {
  renderBootstrapFatalFallback(error);
});

// Emoji search prebuild loads lazily via ensureEmojiSearchPrebuildLoaded() (picker / : autocomplete)
// so /emoji-search-index.json is not on the initial critical path (Lighthouse LCP).
