import { computed } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import type { RailTab } from '@/features/layout/mainSurface';
import { ECHO_GUEST_ACCOUNTS_ENABLED } from '@/config/echoGuestAccountsEnabled';

export function useAppLayoutWelcomeBack(deps: {
  activeRailTab: Ref<RailTab>;
  isMockDataMode: ComputedRef<boolean>;
  isAuthenticated: ComputedRef<boolean>;
  sessionEndedMessage: Ref<string | null | undefined>;
  /** True when GET /directory/servers (after public-row filter) has no entries. */
  explorePublicDirectoryEmpty: ComputedRef<boolean>;
  isGuestUser: ComputedRef<boolean>;
  /** Skip empty-directory gate for full members only while workspace is still loading. */
  workspaceLoading: ComputedRef<boolean>;
  /** When true, the invite landing view takes over instead of the generic gate. */
  inviteLandingActive?: ComputedRef<boolean>;
}) {
  /** Logged-out welcome surface (Explore hero + slim banner on other rails). */
  const loggedOutWelcomeSurfaceVisible = computed(
    () =>
      !ECHO_GUEST_ACCOUNTS_ENABLED &&
      !deps.isMockDataMode.value &&
      !deps.isAuthenticated.value &&
      !deps.sessionEndedMessage.value,
  );

  const showWelcomeBackSlimBanner = computed(
    () =>
      loggedOutWelcomeSurfaceVisible.value &&
      deps.activeRailTab.value !== 'explore' &&
      !deps.inviteLandingActive?.value,
  );

  const welcomeBackExploreGate = computed(() => {
    if (deps.inviteLandingActive?.value) return false;
    if (deps.activeRailTab.value !== 'explore') return false;
    if (deps.isMockDataMode.value) return false;
    if (deps.sessionEndedMessage.value) return false;
    if (!deps.isAuthenticated.value) {
      // Auto-guest mint runs during initial load — land on public Explore instead
      // of a sign-in wall when guest accounts are enabled.
      if (ECHO_GUEST_ACCOUNTS_ENABLED) return false;
      return true;
    }
    if (!deps.explorePublicDirectoryEmpty.value) return false;
    const fullMember = !deps.isGuestUser.value;
    if (fullMember && deps.workspaceLoading.value) return false;
    return true;
  });

  return {
    showWelcomeBackSlimBanner,
    welcomeBackExploreGate,
  };
}
