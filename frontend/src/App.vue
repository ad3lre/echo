<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  provide,
  ref,
} from 'vue';
import { getEchoPlatform } from '@/platform/createEchoPlatform';
import { PLATFORM_KEY } from '@/platform/keys';
import { useAuthSessionStore } from '@/stores/authSession';
import { useAppBootGate } from '@/features/layout/composables/useAppBootGate';
import { ENABLE_NUMBERED_ICON_RENAME_TOOL } from '@/dev/echoDevTools';
import AppLayoutLoadError from '@/components/AppLayoutLoadError.vue';
import AppLayoutSplash from '@/components/AppLayoutSplash.vue';
import EchoHoverHintsHost from '@/components/EchoHoverHintsHost.vue';
import {
  APP_BOOT_GATE_FAST_REVEAL_MS,
  APP_BOOT_GATE_TIMEOUT_MS,
  APP_LAYOUT_LOAD_TIMEOUT_MS,
} from '@/config/appLoadUi';
import { useAppBootStallWatcher } from '@/observability/appBootStallWatcher';
import { prefetchAppLayoutChunk } from '@/services/appLayoutChunkPrefetch';
import {
  normalizePathname,
  parseLegalDocPath,
  stripBasePath,
} from '@/features/layout/urlNavigation';
import type { LegalDocTabId } from '@/features/settings/legalDocs';

/**
 * Auth shell views are URL-gated (`/reset-password`, `/forgot-password`) and
 * only ever render for the tiny fraction of sessions that land on one of those paths.
 * Keeping them as static imports would bake large auth views into the entry chunk,
 * slowing every mobile cold start. Loading them lazily keeps the first-paint JS
 * budget on the AppLayout critical path.
 */
const ResetPasswordView = defineAsyncComponent({
  loader: () => import('@/views/ResetPasswordView.vue'),
  loadingComponent: AppLayoutSplash,
  errorComponent: AppLayoutLoadError,
  delay: 200,
  timeout: APP_LAYOUT_LOAD_TIMEOUT_MS,
});
const ForgotPasswordView = defineAsyncComponent({
  loader: () => import('@/views/ForgotPasswordView.vue'),
  loadingComponent: AppLayoutSplash,
  errorComponent: AppLayoutLoadError,
  delay: 200,
  timeout: APP_LAYOUT_LOAD_TIMEOUT_MS,
});
const VerifyEmailView = defineAsyncComponent({
  loader: () => import('@/views/VerifyEmailView.vue'),
  loadingComponent: AppLayoutSplash,
  errorComponent: AppLayoutLoadError,
  delay: 200,
  timeout: APP_LAYOUT_LOAD_TIMEOUT_MS,
});
const LegalDocStandaloneView = defineAsyncComponent({
  loader: () => import('@/views/LegalDocStandaloneView.vue'),
  loadingComponent: AppLayoutSplash,
  errorComponent: AppLayoutLoadError,
  delay: 200,
  timeout: APP_LAYOUT_LOAD_TIMEOUT_MS,
});

/** Lazy-loaded only when enabled; avoids parsing/network for the modal when `false`. */
const NumberedIconRenameDevModal =
  import.meta.env.DEV && ENABLE_NUMBERED_ICON_RENAME_TOOL
    ? defineAsyncComponent(
        () => import('@/components/IconNumberedRenameDevModal.vue'),
      )
    : null;

const echoPlatform = getEchoPlatform();
provide(PLATFORM_KEY, echoPlatform);

/**
 * Boot gate: hold a full-screen splash for a no-session cold start until the
 * workspace's initial load settles, so the app reveals only when servers/channels
 * are ready. Returning users (a session token is present at boot) or warm-painted
 * users render the shell immediately — empty surfaces show live skeletons via the
 * workspace `loading` flags instead of a blank splash. `startInitialLoad` is kicked
 * off just before mount (see `main.ts`) so those flags are already set on the first
 * frame.
 */
const authSessionStore = useAuthSessionStore();
/** Cookie sessions keep `accessToken` null; trust identity cache + unverified flag. */
const hasSessionAtBoot =
  authSessionStore.isAuthenticated || authSessionStore.isSessionUnverified;

const workspace = echoPlatform.workspace;
const { showBootGate } = useAppBootGate({
  hasSession: hasSessionAtBoot,
  warmPainted: workspace.fromApi.value,
  initialLoadSettled: workspace.initialLoadSettled,
  timeoutMs: APP_BOOT_GATE_TIMEOUT_MS,
  fastRevealMs: APP_BOOT_GATE_FAST_REVEAL_MS,
});

const appLayoutResolved = ref(false);

const AppLayout = defineAsyncComponent({
  loader: async () => {
    const mod = await prefetchAppLayoutChunk();
    appLayoutResolved.value = true;
    return mod;
  },
  loadingComponent: AppLayoutSplash,
  errorComponent: AppLayoutLoadError,
  delay: 200,
  timeout: APP_LAYOUT_LOAD_TIMEOUT_MS,
});

const PaperPublicShareView = defineAsyncComponent({
  loader: () => import('@/views/PaperPublicShareView.vue'),
  loadingComponent: AppLayoutSplash,
  errorComponent: AppLayoutLoadError,
  delay: 200,
  timeout: APP_LAYOUT_LOAD_TIMEOUT_MS,
});

const authShell = ref<null | 'reset' | 'forgot' | 'verify-email'>(null);
const legalDocId = ref<LegalDocTabId | null>(null);
const paperPublicToken = ref<string | null>(null);

/** The main app branch (`<AppLayout>`) — i.e. none of the URL-gated standalone views. */
const showAppLayout = computed(
  () => !authShell.value && !legalDocId.value && !paperPublicToken.value,
);

useAppBootStallWatcher({
  showBootGate,
  initialLoadSettled: workspace.initialLoadSettled,
  showAppLayout,
  appLayoutResolved,
  bootGateTimeoutMs: APP_BOOT_GATE_TIMEOUT_MS,
  bootGateFastRevealMs: APP_BOOT_GATE_FAST_REVEAL_MS,
  hasSession: hasSessionAtBoot,
});

function authShellFromLocation(): null | 'reset' | 'forgot' | 'verify-email' {
  if (typeof window === 'undefined') return null;
  const base = import.meta.env.BASE_URL || '/';
  const p = normalizePathname(stripBasePath(window.location.pathname, base));
  if (/\/reset-password$/i.test(p)) return 'reset';
  if (/\/forgot-password$/i.test(p)) return 'forgot';
  if (/\/verify-email$/i.test(p)) return 'verify-email';
  return null;
}

function legalDocFromLocation(): LegalDocTabId | null {
  if (typeof window === 'undefined') return null;
  const base = import.meta.env.BASE_URL || '/';
  return parseLegalDocPath(window.location.pathname, base);
}

function paperPublicTokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const base = import.meta.env.BASE_URL || '/';
  const p = normalizePathname(stripBasePath(window.location.pathname, base));
  if (!p.startsWith('/paper/s/')) return null;
  const token = p.slice('/paper/s/'.length).trim();
  return token || null;
}

function syncShellRoute() {
  authShell.value = authShellFromLocation();
  if (authShell.value) {
    legalDocId.value = null;
    paperPublicToken.value = null;
    return;
  }
  legalDocId.value = legalDocFromLocation();
  paperPublicToken.value = legalDocId.value
    ? null
    : paperPublicTokenFromLocation();
}

// Resolve the shell route synchronously at setup so the boot gate only ever covers
// the real app branch, never the URL-gated auth / legal / paper-share views.
syncShellRoute();

onMounted(() => {
  window.addEventListener('popstate', syncShellRoute);
});

onUnmounted(() => {
  window.removeEventListener('popstate', syncShellRoute);
});

function onAuthShellDone() {
  authShell.value = null;
  const base = import.meta.env.BASE_URL || '/';
  const b = base === '/' ? '' : base.replace(/\/$/, '');
  window.history.replaceState(null, '', b || '/');
}
</script>

<template>
  <EchoHoverHintsHost />
  <ResetPasswordView v-if="authShell === 'reset'" @done="onAuthShellDone" />
  <ForgotPasswordView
    v-else-if="authShell === 'forgot'"
    @done="onAuthShellDone"
  />
  <VerifyEmailView
    v-else-if="authShell === 'verify-email'"
    @done="onAuthShellDone"
  />
  <LegalDocStandaloneView v-else-if="legalDocId" :doc-id="legalDocId" />
  <PaperPublicShareView
    v-else-if="paperPublicToken"
    :token="paperPublicToken"
  />
  <AppLayout v-else />
  <Transition name="echo-boot-gate-fade">
    <div v-if="showAppLayout && showBootGate" class="echo-boot-gate">
      <AppLayoutSplash />
    </div>
  </Transition>
  <component
    :is="NumberedIconRenameDevModal"
    v-if="NumberedIconRenameDevModal"
  />
</template>

<style scoped>
/* Full-screen cover held over the shell during a no-session cold start, removed once
 * the workspace is ready. Sits above all app chrome; the inline boot-error fallback in
 * index.html still wins (it replaces #app). */
.echo-boot-gate {
  position: fixed;
  inset: 0;
  z-index: 100000;
}

/* Fade out when content is ready (matches the 180ms boot-splash fade in
 * public/echo-boot-splash.css). */
.echo-boot-gate-fade-leave-active {
  transition: opacity 180ms ease-out;
}

.echo-boot-gate-fade-leave-to {
  opacity: 0;
}
</style>
