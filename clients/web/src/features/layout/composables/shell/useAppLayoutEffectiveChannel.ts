import type { Ref } from 'vue';
import { computed } from 'vue';
import type { ChannelSummary } from '@shared/types';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import { isDmThreadId } from '@/features/layout/mainSurface';

export function useAppLayoutEffectiveChannel(opts: {
  activeChannelId: Ref<string>;
  findChannelContextById: (
    channelId: string | null | undefined,
  ) => { channel: ChannelSummary; category: ChannelCategory } | null;
  selectedDMUserId: Ref<string | null>;
  echoDmPeerByChannelId: Ref<ReadonlyMap<string, string>>;
  users: Ref<Array<{ id: string; name: string }>>;
  echoDmThreadIds: Ref<ReadonlySet<string>>;
  groupDMs: Ref<
    Record<
      string,
      { id: string; name: string; memberIds: string[]; pfp?: string }
    >
  >;
}) {
  const effectiveActiveChannel = computed<ChannelSummary | null>(() => {
    const guild =
      opts.findChannelContextById(opts.activeChannelId.value)?.channel ?? null;
    if (guild) return guild;
    const cid = opts.activeChannelId.value;
    if (isDmThreadId(cid) || opts.echoDmThreadIds.value.has(cid)) {
      const group = opts.groupDMs.value[cid];
      if (group) {
        const label = group.name.trim() || 'Group';
        return {
          id: cid,
          name: label,
          type: 'text' as const,
        };
      }
      const partnerId =
        opts.echoDmPeerByChannelId.value.get(cid) ??
        opts.selectedDMUserId.value;
      const user = partnerId
        ? opts.users.value.find((u) => u.id === partnerId)
        : null;
      return {
        id: cid,
        name: user?.name ?? 'Direct Message',
        type: 'text' as const,
      };
    }
    return null;
  });

  const activeChannelContext = computed(() =>
    opts.findChannelContextById(opts.activeChannelId.value),
  );

  const isViewingVoiceChannel = computed(() => {
    const t = opts.findChannelContextById(opts.activeChannelId.value)?.channel
      ?.type;
    return t === 'voice' || t === 'stage';
  });

  return {
    effectiveActiveChannel,
    activeChannelContext,
    isViewingVoiceChannel,
  };
}
