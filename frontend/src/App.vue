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
import { APP_LAYOUT_LOAD_TIMEOUT_MS } from '@/config/appLoadUi';
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

const AppLayout = defineAsyncComponent({
  loader: () => import('@/components/AppLayout.vue'),
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
  <component
    :is="NumberedIconRenameDevModal"
    v-if="NumberedIconRenameDevModal"
  />
</template>
