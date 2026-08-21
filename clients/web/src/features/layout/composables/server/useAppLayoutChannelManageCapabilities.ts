import { computed, type ComputedRef } from 'vue';
import type { ChannelSummary } from '@shared/types';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';

/**
 * Echo guild: whether the current user may create channels (and thus use merged “manage channel” UI).
 */
export function useAppLayoutChannelManageCapabilities(opts: {
  selectedServerEcho: ComputedRef<{ id: string } | undefined>;
  isAuthenticated: () => boolean;
  echoCanCreateChannel: ComputedRef<boolean | undefined>;
}) {
  const canCreateChannels = computed(() => {
    const s = opts.selectedServerEcho.value;
    if (!s?.id || s.id === 'echo') return false;
    if (!isEchoGraphId(s.id) || !opts.isAuthenticated()) return false;
    return !!opts.echoCanCreateChannel.value;
  });

  /**
   * Manage/delete UI is gated by server capability (MANAGE_CHANNELS / Echo equivalent).
   * Do not require channel ids to match `isEchoGraphId`: bridged or legacy rows may still
   * be valid targets while failing the client-side shape check.
   */
  function canManageThisChannel(channel: ChannelSummary): boolean {
    if (!channel?.id?.trim()) return false;
    return canCreateChannels.value;
  }

  return { canCreateChannels, canManageThisChannel };
}
