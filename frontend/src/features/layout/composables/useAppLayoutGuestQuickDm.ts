import type { Ref } from 'vue';

const ESCROW_KEY = 'echo_guest_quick_dm_pending_v1';

function readEscrow(): { targetUserId: string; text: string } | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ESCROW_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { targetUserId?: string; text?: string };
    if (typeof o.targetUserId !== 'string' || !o.targetUserId.trim())
      return null;
    const text = typeof o.text === 'string' ? o.text.trim() : '';
    if (!text) return null;
    return { targetUserId: o.targetUserId.trim(), text };
  } catch {
    return null;
  }
}

function clearEscrow(): void {
  try {
    sessionStorage.removeItem(ESCROW_KEY);
  } catch {
    /* ignore */
  }
}

export function useAppLayoutGuestQuickDm(deps: {
  isGuest: { readonly value: boolean };
  isMemberPopoutOpen: Ref<boolean>;
  isSettingsModalOpen: Ref<boolean>;
  settingsModalInitialSection: Ref<string | null>;
  settingsModalActiveSection: Ref<string | null>;
  selectDMTab: () => void;
  selectDmUser: (userId: string) => Promise<string | null>;
  sendMessage: (channelId: string, content: string) => void;
  hydrateAfterGuestAccountUpgrade: () => Promise<void>;
  isGuestAfterUpgrade: () => boolean;
}) {
  async function deliverQuickDmToUser(userId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    deps.isMemberPopoutOpen.value = false;
    deps.selectDMTab();
    const channelId = await deps.selectDmUser(userId);
    if (!channelId) return;
    deps.sendMessage(channelId, trimmed);
  }

  async function handleMemberPopoutQuickDm(userId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (deps.isGuest.value) {
      try {
        sessionStorage.setItem(
          ESCROW_KEY,
          JSON.stringify({ targetUserId: userId, text: trimmed }),
        );
      } catch {
        /* ignore quota / private mode */
      }
      deps.isMemberPopoutOpen.value = false;
      deps.settingsModalInitialSection.value = 'Account';
      deps.settingsModalActiveSection.value = 'Account';
      deps.isSettingsModalOpen.value = true;
      return;
    }
    await deliverQuickDmToUser(userId, text);
  }

  async function onGuestAccountUpgraded() {
    await deps.hydrateAfterGuestAccountUpgrade();
    if (deps.isGuestAfterUpgrade()) return;
    const escrow = readEscrow();
    if (!escrow) return;
    clearEscrow();
    await deliverQuickDmToUser(escrow.targetUserId, escrow.text);
  }

  return { handleMemberPopoutQuickDm, onGuestAccountUpgraded };
}
