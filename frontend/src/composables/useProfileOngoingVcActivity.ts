import {
  computed,
  inject,
  unref,
  type ComputedRef,
  type MaybeRefOrGetter,
  toValue,
} from 'vue';
import { LAYOUT_LEFT_CHROME_KEY } from '@/features/layout/layoutInjectionKeys';
import {
  primaryVcActivityPresenceKind,
  vcActivityJoinLabel,
  vcActivityPresenceKindToPhase,
} from '@/features/voice/vcActivityJoin';
import type {
  VcActivityPresenceKind,
  VcActivityUiPhase,
} from '@/features/voice/vcActivityTypes';
import type { UserVoiceChannelPresence } from '@/utils/userVoiceChannelPresence';

export type ProfileOngoingVcActivity = {
  kind: VcActivityPresenceKind;
  phase: VcActivityUiPhase;
  label: string;
  voice: UserVoiceChannelPresence;
};

/**
 * Ongoing VC activity for a profile user (game / watch-together), when we can see
 * LiveKit presence or a recent channel snapshot from the same voice channel.
 */
export function useProfileOngoingVcActivity(
  userId: MaybeRefOrGetter<string | undefined | null>,
  voiceActivities: ComputedRef<UserVoiceChannelPresence[]>,
): ComputedRef<ProfileOngoingVcActivity | null> {
  const layoutLeft = inject(LAYOUT_LEFT_CHROME_KEY, null);

  return computed(() => {
    const rawId = toValue(userId);
    const uid = typeof rawId === 'string' ? rawId.trim() : '';
    const primaryVoice = voiceActivities.value[0] ?? null;
    if (!uid || !primaryVoice) return null;

    const getUserPresence = unref(layoutLeft?.getVcActivityPresence);
    const getChannelPresence = unref(layoutLeft?.getVcChannelActivityPresence);
    const fromUser = getUserPresence?.(uid) ?? [];
    const fromChannel = getChannelPresence?.(primaryVoice.channelId) ?? [];
    const kind =
      primaryVcActivityPresenceKind(fromUser) ??
      primaryVcActivityPresenceKind(fromChannel);
    if (!kind || kind === 'activities') return null;

    const phase = vcActivityPresenceKindToPhase(kind);
    if (!phase || phase === 'closed' || phase === 'pick') return null;

    return {
      kind,
      phase,
      label: vcActivityJoinLabel(kind),
      voice: primaryVoice,
    };
  });
}
