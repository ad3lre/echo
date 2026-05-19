import type { Ref } from 'vue';

/** Sets `activeChannelId` only (no server switch). Used where full `useAppLayoutMessageActions` nav is not wired yet. */
export function createNavigateToChannelActiveOnly(
  activeChannelId: Ref<string>,
) {
  return (channelId: string) => {
    activeChannelId.value = channelId;
  };
}
