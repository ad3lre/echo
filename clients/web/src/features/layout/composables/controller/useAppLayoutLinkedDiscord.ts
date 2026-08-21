import { ref, watch } from 'vue';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import { fetchMeDiscord } from '@/api/meClient';

/**
 * Tracks the linked Discord account for the current (non-guest) session.
 * Refreshes on auth change; clears for guests / signed-out.
 */
export function useAppLayoutLinkedDiscord(deps: {
  authSession: ReturnType<typeof useAuthSessionStore>;
}) {
  const { authSession } = deps;

  const linkedDiscordUserId = ref<string | null>(null);
  const linkedDiscordState = ref<Awaited<
    ReturnType<typeof fetchMeDiscord>
  > | null>(null);

  async function refreshLinkedDiscordUserId(): Promise<void> {
    const u = authSession.backendUser;
    if (!authSession.isAuthenticated || !u || u.isGuest) {
      linkedDiscordUserId.value = null;
      linkedDiscordState.value = null;
      return;
    }
    try {
      const s = await fetchMeDiscord();
      linkedDiscordState.value = s;
      if (s.linked) {
        const id = s.profile.discordUserId?.trim();
        linkedDiscordUserId.value = id || null;
      } else {
        linkedDiscordUserId.value = null;
      }
    } catch {
      linkedDiscordUserId.value = null;
      linkedDiscordState.value = null;
    }
  }

  watch(
    () =>
      [authSession.isAuthenticated, authSession.authStateGeneration] as const,
    () => {
      void refreshLinkedDiscordUserId();
    },
    { immediate: true },
  );

  return { linkedDiscordUserId, linkedDiscordState };
}
