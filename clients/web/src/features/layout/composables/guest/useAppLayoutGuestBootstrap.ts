import type { Ref } from 'vue';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import type { useServerStore } from '@/features/layout/server';
import type { RailTab } from '@/features/layout/mainSurface';
import { useAppLayoutGuestSession } from './useAppLayoutGuestSession';
import { useAppLayoutBootstrap } from '../controller/useAppLayoutBootstrap';

export type UseAppLayoutGuestBootstrapDeps = {
  serverStore: ReturnType<typeof useServerStore>;
  workspace: WorkspaceStateApi;
  authSession: ReturnType<typeof useAuthSessionStore>;
  activeRailTab: Ref<RailTab>;
  isAuthModalOpen: Ref<boolean>;
  hydrateEchoFromApi: () => Promise<void>;
  openGuestUpgradeForDmRef: Ref<null | (() => void)>;
  isMoreServersPinned: Ref<boolean>;
  isMoreServersPanelOpen: Ref<boolean>;
  isMemberPopoutOpen: Ref<boolean>;
  isSelfProfilePopoutOpen: Ref<boolean>;
  activeChannelId: Ref<string>;
  getFirstTextChannelId: (
    cats: { name: string; channels: { id: string; type: string }[] }[],
  ) => string;
  echoDmThreadIds: Ref<Set<string>>;
  dmCallWithUserId: Ref<string | null>;
  openAuthModal: (opts?: {
    entry?: 'social' | 'echo';
    passkey?: boolean;
    tab?: 'login' | 'register';
    forgot?: boolean;
  }) => void;
};

/**
 * Guest session modals + bootstrap (failed-guest listener). Call after hydrate
 * is assigned from workspace lifecycle.
 */
export function useAppLayoutGuestBootstrap(
  deps: UseAppLayoutGuestBootstrapDeps,
) {
  const guestSession = useAppLayoutGuestSession({
    serverStore: deps.serverStore,
    workspace: deps.workspace,
    authSession: deps.authSession,
    activeRailTab: deps.activeRailTab,
    isAuthModalOpen: deps.isAuthModalOpen,
    hydrateEchoFromApi: deps.hydrateEchoFromApi,
  });
  deps.openGuestUpgradeForDmRef.value = guestSession.openGuestUpgradeModal;

  useAppLayoutBootstrap({
    serverStore: deps.serverStore,
    workspace: deps.workspace,
    activeRailTab: deps.activeRailTab,
    isMoreServersPinned: deps.isMoreServersPinned,
    isMoreServersPanelOpen: deps.isMoreServersPanelOpen,
    isMemberPopoutOpen: deps.isMemberPopoutOpen,
    isSelfProfilePopoutOpen: deps.isSelfProfilePopoutOpen,
    activeChannelId: deps.activeChannelId,
    getFirstTextChannelId: deps.getFirstTextChannelId,
    echoDmThreadIds: deps.echoDmThreadIds,
    dmCallWithUserId: deps.dmCallWithUserId,
    onEchoMessageFailedGuest: guestSession.onEchoMessageFailedGuest,
    openAuthModal: deps.openAuthModal,
  });

  return {
    guestSession,
    isGuestDisplayNameModalOpen: guestSession.isGuestDisplayNameModalOpen,
    isGuestWelcomePrefsModalOpen: guestSession.isGuestWelcomePrefsModalOpen,
    isGuestUpgradeModalOpen: guestSession.isGuestUpgradeModalOpen,
    isGuestCaptchaModalOpen: guestSession.isGuestCaptchaModalOpen,
    guestCaptchaSiteKey: guestSession.guestCaptchaSiteKey,
    guestFriendsLocked: guestSession.guestFriendsLocked,
    continueAsGuest: guestSession.continueAsGuest,
    onGuestCaptchaVerified: guestSession.onGuestCaptchaVerified,
    openGuestUpgradeModal: guestSession.openGuestUpgradeModal,
    hydrateAfterGuestAccountUpgrade: guestSession.onGuestAccountUpgraded,
    onEchoMessageFailedGuest: guestSession.onEchoMessageFailedGuest,
  };
}
