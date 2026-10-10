import { describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { useAppLayoutWelcomeBack } from './useAppLayoutWelcomeBack';

const guestEnabled = vi.hoisted(() => ({ value: false }));

vi.mock('@/config/echoGuestAccountsRuntime', () => ({
  isGuestAccountsEnabled: () => guestEnabled.value,
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

  it('shows the explore auth gate for logged-out visitors when guest accounts are disabled', () => {
    guestEnabled.value = false;
    const api = mount();
    expect(api.welcomeBackExploreGate.value).toBe(true);
    expect(api.showWelcomeBackSlimBanner.value).toBe(false);
  });

  it('shows the slim welcome banner on non-explore rails when logged out and guests are off', () => {
    guestEnabled.value = false;
    const api = mount({ activeRailTab: ref('dm') });
    expect(api.welcomeBackExploreGate.value).toBe(false);
    expect(api.showWelcomeBackSlimBanner.value).toBe(true);
  });

  it('skips the explore auth gate for logged-out visitors when guest accounts are enabled', () => {
    guestEnabled.value = true;
    const api = mount();
    expect(api.welcomeBackExploreGate.value).toBe(false);
    expect(api.showWelcomeBackSlimBanner.value).toBe(false);
  });

  it('still shows the explore gate for signed-in members with an empty public directory', () => {
    guestEnabled.value = false;
    const api = mount({
      isAuthenticated: computed(() => true),
      explorePublicDirectoryEmpty: computed(() => true),
    });
    expect(api.welcomeBackExploreGate.value).toBe(true);
  });

  it('skips the explore gate for guest accounts on an empty public directory', () => {
    guestEnabled.value = true;
    const api = mount({
      isAuthenticated: computed(() => true),
      explorePublicDirectoryEmpty: computed(() => true),
      isGuestUser: computed(() => true),
    });
    expect(api.welcomeBackExploreGate.value).toBe(false);
  });
});
