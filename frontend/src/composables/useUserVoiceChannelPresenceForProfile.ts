import { computed, type MaybeRefOrGetter, toValue } from 'vue';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { useServerStore } from '@/stores/server';
import {
  findUserVoicePresences,
  type UserVoiceChannelPresence,
} from '@/utils/userVoiceChannelPresence';

/**
 * Live guild voice presence for profile surfaces (popout, expanded, DM profile).
 */
export function useUserVoiceChannelPresenceForProfile(
  userId: MaybeRefOrGetter<string | undefined | null>,
) {
  const workspace = useEchoWorkspace();
  const serverStore = useServerStore();

  return computed<UserVoiceChannelPresence[]>(() => {
    const id = toValue(userId);
    const trimmed = typeof id === 'string' ? id.trim() : '';
    if (!trimmed) return [];
    const selected = serverStore.selectedServerId?.trim();
    return findUserVoicePresences(trimmed, {
      categoriesByServer: workspace.categoriesByServer.value as Record<
        string,
        {
          channels?: Array<{
            id: string;
            name: string;
            type?: string;
            voiceParticipantIds?: string[];
          }>;
        }[]
      >,
      servers: workspace.servers.value as Array<{
        id: string;
        name: string;
        bannerImageUrl?: string;
      }>,
      users: workspace.users.value as Array<{ id: string; pfp?: string }>,
      preferServerId: selected && selected !== 'echo' ? selected : undefined,
    });
  });
}
