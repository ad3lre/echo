import { ensurePdfEnvironmentPolyfills } from '@/features/pdf/ensurePdfEnvironment';

ensurePdfEnvironmentPolyfills();

import { createApp, type Plugin } from 'vue';
import App from './App.vue';
import { createPinia } from 'pinia';
import { i18n, initEchoI18n } from '@/i18n';
import {
  applyEchoLocaleFromPreferences,
  loadTimeLanguagePreferences,
} from '@/features/settings/timeLanguagePreferences';
import { echoT } from '@/i18n';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { useInstancePolicyStore } from '@/features/layout/instancePolicy';
import { useBugHunterStore } from '@/features/layout/bugHunter';
import { hydrateBootThemeAndPreferences } from '@/features/layout/boot/bootThemeHydration';
import { getEchoPlatform } from '@/platform/createEchoPlatform';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/useEchoWorkspace';
import type { EchoWorkspaceState } from '@/api/echoClient';
import {
  prefetchInboundUrlChannelFirstPage,
  prefetchWorkspaceBootstrapTextChannelsNonBlocking,
} from '@/features/layout/echoWorkspace/echoWorkspaceChannelPrefetch';
import {
  readJwtSub,
  readWorkspaceSessionCache,
} from '@/features/layout/echoWorkspace/workspaceSessionCache';
import { scrollbarOnScroll } from '@/directives/scrollbarOnScroll';
import { spoilerReveal } from '@/directives/spoilerReveal';
/* Critical path: one Inter weight; 600/700 load after first paint. */
import '@fontsource/inter/latin-400.css';

import './assets/tailwind.css';
import './assets/themes.scss';
import './assets/density.scss';
import './assets/accessibility.scss';
import './assets/main.scss';
/* Load KaTeX's structural vlist rules before any message can be typeset. */
import 'katex/dist/katex.min.css';
import './assets/document-canvas.scss';
import { registerEchoServiceWorker } from '@/registerServiceWorker';
import { reloadEchoApp } from '@/platform/reloadEchoApp';
import { enqueueStartupTask } from '@/features/layout/boot/startupScheduler';
import {
  applyGpuTierToDocument,
  detectGpuTier,
} from '@/features/layout/boot/gpuTier';
import { installDevConsoleLogRecorder } from '@/dev/consoleLogRecorder';
import { installGlobalAudioPlaybackUnlock } from '@/audio/audioPlaybackUnlock';
import {
  preloadEchoSounds,
  primeEchoAudioPlayback,
} from '@/features/layout/useEchoSounds';
import {
  clearSkipAutoGuestOnce,
  setSkipAutoGuestOnce,
} from '@/features/layout/boot/autoGuestOAuthReturn';
import { registerAuthSessionApiBridge } from '@/api/authSessionBridge';
import { ensureEchoBrandFavicon } from '@/features/layout/boot/ensureEchoBrandFavicon';
import { prefetchAppLayoutChunk } from '@/features/layout/boot/appLayoutChunkPrefetch';
import { reportClientEnvironmentOnce } from '@/observability/reportClientEnvironment';
import { initPerfHarness } from '@/observability/perfHarness';

initPerfHarness();

ensureEchoBrandFavicon();
registerEchoServiceWorker();
/** Overlap AppLayout chunk fetch/parse with bootstrap work before `App.vue` mounts. */
void prefetchAppLayoutChunk();
applyGpuTierToDocument(detectGpuTier());
installDevConsoleLogRecorder();
installGlobalAudioPlaybackUnlock(() => {
  primeEchoAudioPlayback();
  preloadEchoSounds();
});

// Phase A: hydrate theme + dark variant before first paint.
hydrateBootThemeAndPreferences();

function loadDeferredInterWeights() {
  void import('@fontsource/inter/latin-400-italic.css');
  void import('@fontsource/inter/latin-600.css');
  void import('@fontsource/inter/latin-600-italic.css');
  void import('@fontsource/inter/latin-700.css');
  void import('@fontsource/inter/latin-700-italic.css');
}

async function bootstrap() {
  /**
   * i18n initialization: Start with default locale synchronously, then
   * switch to preferred locale asynchronously. This allows the app to mount
   * immediately while translations load in the background.
   */
  const i18nInitPromise = initEchoI18n(loadTimeLanguagePreferences().locale);

  const app = createApp(App);

  // Wait for i18n to be ready before mounting to avoid hydration mismatch
  // but the wait happens after app creation for parallel processing
  await i18nInitPromise;
  app.use(i18n as Plugin);
  app.directive('scrollbar-on-scroll', scrollbarOnScroll);
  app.directive('spoiler-reveal', spoilerReveal);
  const pinia = createPinia();

  app.use(pinia);

  void useInstancePolicyStore().load();

  registerAuthSessionApiBridge({
    invalidateSessionForReauth(message: string) {
      useAuthSessionStore().invalidateSessionForReauth(message);
    },
    clearLocalTokens() {
      useAuthSessionStore().clearLocalTokens();
    },
    getAuthStateGeneration() {
      return useAuthSessionStore().authStateGeneration;
    },
  });

  const authSessionStore = useAuthSessionStore();
  /* Synchronous: rehydrates `backendUser` from the local identity cache (if any)
   * so Vue can mount straight into the app shell instead of flashing the auth
   * gate while `/auth/me` is in flight. The session is validated below, after
   * `app.mount()`, so first paint is never blocked on a network round-trip. */
  authSessionStore.hydrateFromStorage();

  /**
   * Warm paint before mount: if a returning user already holds a session token
   * plus a cached workspace snapshot, apply it now so the very first frame paints
   * the servers rail / channels / members instead of the boot spinner → explore
   * flash. `startInitialLoad()` (kicked off just before mount) keeps this paint and
   * reconciles authoritatively with `/workspace` in the background.
   */
  try {
    const preToken = authSessionStore.accessToken?.trim() || '';
    /* Cold-boot waterfall collapse: prefetch the URL's channel in parallel with
     * /workspace so it is a loadHistory cache hit by the time it is selected. */
    prefetchInboundUrlChannelFirstPage(
      preToken,
      window.location.pathname,
      import.meta.env.BASE_URL || '/',
    );
    const preSub = preToken ? readJwtSub(preToken) : null;
    if (preSub) {
      const preCache = readWorkspaceSessionCache(preSub);
      if (preCache) {
        (
          getEchoPlatform().workspace as WorkspaceStateApi
        ).preHydrateFromSessionCache(preCache);
        if (preToken) {
          prefetchWorkspaceBootstrapTextChannelsNonBlocking(
            preToken,
            preCache as EchoWorkspaceState,
          );
        }
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

  const workspace = getEchoPlatform().workspace as WorkspaceStateApi;
  void workspace.startInitialLoad();

  const appEl = document.getElementById('app');
  app.mount('#app');

  /* Fade the HTML boot splash only after Vue has committed a frame; setting
   * `data-echo-mounted` before mount can reveal a blank canvas. */
  const markBootSplashMounted = () => {
    if (appEl) appEl.setAttribute('data-echo-mounted', '');
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      requestAnimationFrame(markBootSplashMounted);
    });
  } else {
    markBootSplashMounted();
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => loadDeferredInterWeights());
  } else {
    loadDeferredInterWeights();
  }

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
   */
  if (authSessionStore.isSessionUnverified) {
    void (async () => {
      try {
        await authSessionStore.restoreSessionFromApi();
      } catch {
        /* restoreSessionFromApi should not throw; guard against stray rejections */
      }
    })();
  }

  /** Warm icon catalog shortly after first paint. */
  enqueueStartupTask('icon-catalog-preload', 'high', () => {
    void import('@/assets/iconCatalog').then((m) =>
      m.ensureIconCatalogLoaded(),
    );
  });

  enqueueStartupTask('time-language-prewarm', 'high', () => {
    loadTimeLanguagePreferences();
  });

  enqueueStartupTask('client-environment-report', 'high', () => {
    reportClientEnvironmentOnce();
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
  retryButton.addEventListener('click', () => reloadEchoApp());
  inner.append(title, detail, retryButton);
  shell.appendChild(inner);
  mount.appendChild(shell);
}

void bootstrap().catch((error: unknown) => {
  renderBootstrapFatalFallback(error);
});

// Emoji search prebuild loads lazily via ensureEmojiSearchPrebuildLoaded() (picker / : autocomplete)
// so /emoji-search-index.json is not on the initial critical path (Lighthouse LCP).
