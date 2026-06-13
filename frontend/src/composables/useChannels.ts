import { ref, computed, type Ref } from 'vue';
import type { ChannelPermissionKey, ChannelSummary } from '@shared/types';

export interface ChannelCategory {
  /** Stable category id (Echo API / mock). */
  id: string;
  name: string;
  channels: ChannelSummary[];
  /** Inherited by channels with “sync with category” (mock). */
  channelPermissionDefaults?: Partial<Record<ChannelPermissionKey, boolean>>;
  /** Category-wide message auto-delete TTL (seconds); null = off. */
  autoDeleteAfterSeconds?: number | null;
  /** Omit category chrome (compact channels not under a category). */
  hideCategoryHeader?: boolean;
  /** Pinned system channels (role picker, etc.) — rendered above regular channels. */
  systemSection?: boolean;
}

export function useChannels(categories: Ref<ChannelCategory[]>) {
  const activeChannelId = ref('general');

  const activeChannel = computed(() => {
    for (const category of categories.value) {
      const found = category.channels.find(
        (c) => c.id === activeChannelId.value,
      );
      if (found) return found;
    }
    return null;
  });

  return {
    activeChannelId,
    activeChannel,
  };
}
