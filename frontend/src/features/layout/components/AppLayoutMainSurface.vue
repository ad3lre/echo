<script setup lang="ts">
import { computed, defineAsyncComponent, inject, unref } from 'vue';
import AppLayoutInfoBanners from '@/features/layout/components/AppLayoutInfoBanners.vue';
import AppLayoutChatSurface from '@/features/layout/components/AppLayoutChatSurface.vue';
import AppLayoutMembersColumn from '@/features/layout/components/AppLayoutMembersColumn.vue';
import { LAYOUT_MAIN_SURFACE_KEY } from '@/features/layout/layoutInjectionKeys';

/** Lazy: large style + copy surface; only mounted on welcome-back / empty-directory paths. */
const WelcomeBackExploreGate = defineAsyncComponent(
  () => import('@/features/layout/components/WelcomeBackExploreGate.vue'),
);
/** Lazy: branded invite landing for unauthenticated users arriving via invite URL. */
const InviteLandingView = defineAsyncComponent(
  () => import('@/features/layout/components/InviteLandingView.vue'),
);
/** Lazy: outage UI; rarely shown vs main chat chrome. */
const ServerDownGate = defineAsyncComponent(
  () => import('@/features/layout/components/ServerDownGate.vue'),
);
const ExploreView = defineAsyncComponent(
  () => import('@/components/ExploreView.vue'),
);

const props = withDefaults(
  defineProps<{
    /**
     * Which terminal surface this shell variant renders behind the gates:
     * `chat` (compact guild split), `explore` (compact explore page, always
     * unified-scroll), or `auto` (branch on `explorePageUnifiedScroll`).
     */
    surface?: 'auto' | 'chat' | 'explore';
    /** Render the members column after the chat surface (desktop / DM / stack shells). */
    membersColumn?: boolean;
  }>(),
  { surface: 'auto', membersColumn: false },
);

const ctx = inject(LAYOUT_MAIN_SURFACE_KEY);
if (!ctx) {
  throw new Error(
    'AppLayoutMainSurface requires the LAYOUT_MAIN_SURFACE_KEY context from AppLayout',
  );
}

const {
  checkServerHealthNow,
  inviteLandingPersistBeforeOAuth,
  mobileShellGoBack,
  openAuthModal,
  openAddServerModal,
  onJoinServerFromShell,
  handleJoinDiscoverableServer,
} = ctx;

const exploreFlavor = computed(() => {
  if (props.surface === 'explore') return true;
  if (props.surface === 'chat') return false;
  return !!unref(ctx.explorePageUnifiedScroll);
});

const showServerDownGate = computed(() => !!unref(ctx.showServerDownGate));
const serverDownGateBind = computed(() => unref(ctx.serverDownGateBind));
const inviteLandingActive = computed(() => !!unref(ctx.inviteLandingActive));
const inviteLandingPreview = computed(() => unref(ctx.inviteLandingPreview));
const inviteLandingLoading = computed(() => !!unref(ctx.inviteLandingLoading));
const inviteLandingError = computed(() => unref(ctx.inviteLandingError));
const isCompactShell = computed(() => !!unref(ctx.isCompactShell));
const welcomeBackExploreGate = computed(
  () => !!unref(ctx.welcomeBackExploreGate),
);
const welcomeBackExploreMemberEmptyDirectory = computed(
  () => !!unref(ctx.welcomeBackExploreMemberEmptyDirectory),
);
const exploreDiscoverableServers = computed(() =>
  unref(ctx.exploreDiscoverableServers),
);
const exploreDirectoryJoinBusy = computed(
  () => !!unref(ctx.exploreDirectoryJoinBusy),
);
</script>

<template>
  <template v-if="exploreFlavor">
    <div class="col-span-full flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div
        class="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <AppLayoutInfoBanners />
        <ServerDownGate
          v-if="showServerDownGate"
          class="col-span-full min-h-full min-w-0 self-stretch"
          v-bind="serverDownGateBind"
          @retry="checkServerHealthNow"
        />
        <InviteLandingView
          v-else-if="inviteLandingActive"
          class="col-span-full min-h-full min-w-0 self-stretch"
          :preview="inviteLandingPreview"
          :loading="inviteLandingLoading"
          :error="inviteLandingError"
          :show-mobile-back="isCompactShell"
          @back="mobileShellGoBack"
          @log-in-echo="openAuthModal({ entry: 'echo' })"
          @create-account="openAuthModal({ tab: 'register' })"
          @sign-in-passkey="openAuthModal({ entry: 'social', passkey: true })"
          @persist-before-oauth="inviteLandingPersistBeforeOAuth"
        />
        <WelcomeBackExploreGate
          v-else-if="welcomeBackExploreGate"
          class="col-span-full min-h-full min-w-0 self-stretch"
          :member-empty-directory="welcomeBackExploreMemberEmptyDirectory"
          @log-in-echo="openAuthModal({ entry: 'echo' })"
          @create-account="openAuthModal({ tab: 'register' })"
          @sign-in-passkey="openAuthModal({ entry: 'social', passkey: true })"
          @create-server="openAddServerModal('create')"
          @join-server="onJoinServerFromShell"
        />
        <ExploreView
          v-else
          class="w-full min-w-0"
          :discoverable-servers="exploreDiscoverableServers"
          :directory-join-busy="exploreDirectoryJoinBusy"
          :show-mobile-back="isCompactShell"
          @back="mobileShellGoBack"
          @create-server="openAddServerModal('create')"
          @join-server="onJoinServerFromShell"
          @join-suggested="handleJoinDiscoverableServer"
        />
      </div>
    </div>
  </template>
  <template v-else>
    <AppLayoutInfoBanners />
    <ServerDownGate
      v-if="showServerDownGate"
      class="col-span-full min-h-full min-w-0 self-stretch"
      v-bind="serverDownGateBind"
      @retry="checkServerHealthNow"
    />
    <InviteLandingView
      v-else-if="inviteLandingActive"
      class="col-span-full min-h-full min-w-0 self-stretch"
      :preview="inviteLandingPreview"
      :loading="inviteLandingLoading"
      :error="inviteLandingError"
      :show-mobile-back="isCompactShell"
      @back="mobileShellGoBack"
      @log-in-echo="openAuthModal({ entry: 'echo' })"
      @create-account="openAuthModal({ tab: 'register' })"
      @sign-in-passkey="openAuthModal({ entry: 'social', passkey: true })"
      @persist-before-oauth="inviteLandingPersistBeforeOAuth"
    />
    <WelcomeBackExploreGate
      v-else-if="welcomeBackExploreGate"
      class="col-span-full min-h-full min-w-0 self-stretch"
      :member-empty-directory="welcomeBackExploreMemberEmptyDirectory"
      @log-in-echo="openAuthModal({ entry: 'echo' })"
      @create-account="openAuthModal({ tab: 'register' })"
      @sign-in-passkey="openAuthModal({ entry: 'social', passkey: true })"
      @create-server="openAddServerModal('create')"
      @join-server="onJoinServerFromShell"
    />
    <AppLayoutChatSurface v-else />
    <AppLayoutMembersColumn v-if="membersColumn" />
  </template>
</template>
