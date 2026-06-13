import { describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { useAppLayoutWelcomeBack } from './useAppLayoutWelcomeBack';

vi.mock('@/config/echoGuestAccountsEnabled', () => ({
  ECHO_GUEST_ACCOUNTS_ENABLED: true,
}));

describe('useAppLayoutWelcomeBack', () => {
  function mount(
    over: Partial<Parameters<typeof useAppLayoutWelcomeBack>[0]> = {},
  ) {
    return useAppLayoutWelcomeBack({
      activeRailTab: ref('explore'),
      isMockDataMode: computed(() => false),
      isAuthenticated: computed(() => false),
      sessionEndedMessage: ref(null),
      explorePublicDirectoryEmpty: computed(() => false),
      isGuestUser: computed(() => false),
      workspaceLoading: computed(() => false),
      ...over,
    });
  }

  it('skips the explore auth gate for logged-out visitors when guest accounts are enabled', () => {
    const api = mount();
    expect(api.welcomeBackExploreGate.value).toBe(false);
    expect(api.showWelcomeBackSlimBanner.value).toBe(false);
  });

  it('still shows the explore gate for signed-in members with an empty public directory', () => {
    const api = mount({
      isAuthenticated: computed(() => true),
      explorePublicDirectoryEmpty: computed(() => true),
    });
    expect(api.welcomeBackExploreGate.value).toBe(true);
  });
});
