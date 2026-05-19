<script setup lang="ts">
import {
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  provide,
  ref,
} from 'vue';
import { getEchoPlatform } from '@/platform/createEchoPlatform';
import { PLATFORM_KEY } from '@/platform/keys';
import { ENABLE_NUMBERED_ICON_RENAME_TOOL } from '@/dev/echoDevTools';
import AppLayoutLoadError from '@/components/AppLayoutLoadError.vue';
import AppLayoutSplash from '@/components/AppLayoutSplash.vue';
import EchoHoverHintsHost from '@/components/EchoHoverHintsHost.vue';
import DeployCountdownOverlay from '@/components/DeployCountdownOverlay.vue';
import { APP_LAYOUT_LOAD_TIMEOUT_MS } from '@/config/appLoadUi';
import {
  normalizePathname,
  parseLegalDocPath,
  stripBasePath,
} from '@/features/layout/urlNavigation';
import type { LegalDocTabId } from '@/features/settings/legalDocs';

/**
 * Auth shell views are URL-gated (`/founder`, `/reset-password`, `/forgot-password`) and
 * only ever render for the tiny fraction of sessions that land on one of those paths.
 * Keeping them as static imports baked `FounderDashboardView` (89 KB source) and friends
 * into the entry chunk, slowing every mobile cold start. Loading them lazily keeps the
 * first-paint JS budget on the AppLayout critical path. `@/api/founderClient` is imported
 * only from `FounderDashboardView.vue`, so it ships in that same async chunk, not the entry bundle.
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
const LegalDocStandaloneView = defineAsyncComponent({
  loader: () => import('@/views/LegalDocStandaloneView.vue'),
  loadingComponent: AppLayoutSplash,
  errorComponent: AppLayoutLoadError,
  delay: 200,
  timeout: APP_LAYOUT_LOAD_TIMEOUT_MS,
});
const FounderDashboardView = defineAsyncComponent({
  loader: () => import('@/views/FounderDashboardView.vue'),
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

const ThemeLab = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/features/dev/ThemeLab.vue'))
  : null;

const echoPlatform = getEchoPlatform();
provide(PLATFORM_KEY, echoPlatform);

const AppLayout = defineAsyncComponent({
  loader: () => import('@/components/AppLayout.vue'),
  loadingComponent: AppLayoutSplash,
  errorComponent: AppLayoutLoadError,
  delay: 200,
  timeout: APP_LAYOUT_LOAD_TIMEOUT_MS,
});

const authShell = ref<null | 'reset' | 'forgot' | 'founder'>(null);
const legalDocId = ref<LegalDocTabId | null>(null);

function authShellFromLocation(): null | 'reset' | 'forgot' | 'founder' {
  if (typeof window === 'undefined') return null;
  const base = import.meta.env.BASE_URL || '/';
  const p = normalizePathname(stripBasePath(window.location.pathname, base));
  if (/\/founder$/i.test(p)) return 'founder';
  if (/\/reset-password$/i.test(p)) return 'reset';
  if (/\/forgot-password$/i.test(p)) return 'forgot';
  return null;
}

function legalDocFromLocation(): LegalDocTabId | null {
  if (typeof window === 'undefined') return null;
  const base = import.meta.env.BASE_URL || '/';
  return parseLegalDocPath(window.location.pathname, base);
}

function syncShellRoute() {
  authShell.value = authShellFromLocation();
  legalDocId.value = authShell.value ? null : legalDocFromLocation();
}

onMounted(() => {
  syncShellRoute();
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
  <DeployCountdownOverlay />
  <EchoHoverHintsHost />
  <ResetPasswordView v-if="authShell === 'reset'" @done="onAuthShellDone" />
  <FounderDashboardView v-else-if="authShell === 'founder'" />
  <ForgotPasswordView
    v-else-if="authShell === 'forgot'"
    @done="onAuthShellDone"
  />
  <LegalDocStandaloneView v-else-if="legalDocId" :doc-id="legalDocId" />
  <AppLayout v-else />
  <component
    :is="NumberedIconRenameDevModal"
    v-if="NumberedIconRenameDevModal"
  />
  <component :is="ThemeLab" v-if="ThemeLab" />
</template>
