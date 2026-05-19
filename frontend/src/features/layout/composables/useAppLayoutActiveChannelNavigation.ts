import type { Ref } from 'vue';
import type { ChannelSummary } from '@shared/types';
import { isDmThreadId } from '@/features/layout/mainSurface';
import { logShellNav } from '@/features/layout/shellNavDebugLog';

type ChannelContext = {
  channel?: ChannelSummary;
  category: { channelPermissionDefaults?: unknown };
} | null;

/**
 * Guild channel list selection: set `activeChannelId`, optionally close DM panel when picking a guild channel.
 */
export function useAppLayoutActiveChannelNavigation(opts: {
  activeChannelId: Ref<string>;
  isDMPanelOpen: Ref<boolean>;
  echoDmThreadIds: Ref<Set<string>>;
  findChannelContextById: (
    channelId: string | null | undefined,
  ) => ChannelContext;
}) {
  function handleActiveChannelChangeNavigation(channelId: string) {
    logShellNav('handleActiveChannelChangeNavigation', 'channel_list_select', {
      to: channelId,
      from: opts.activeChannelId.value,
    });
    opts.activeChannelId.value = channelId;
    if (isDmThreadId(channelId) || opts.echoDmThreadIds.value.has(channelId)) {
      return;
    }
    const ctx = opts.findChannelContextById(channelId);
    if (
      ctx?.channel &&
      (ctx.channel.type === 'text' || ctx.channel.type === 'voice')
    ) {
      logShellNav(
        'handleActiveChannelChangeNavigation',
        'close_dm_panel_guild_channel',
        { channelId },
      );
      opts.isDMPanelOpen.value = false;
    }
  }

  return { handleActiveChannelChangeNavigation };
}
