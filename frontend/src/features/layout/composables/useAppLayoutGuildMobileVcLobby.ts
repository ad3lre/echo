import { watch, type ComputedRef, type Ref } from 'vue';

export function useAppLayoutGuildMobileVcLobby(deps: {
  hasGuildChannelChrome: ComputedRef<boolean>;
  isCompactShell: Ref<boolean>;
  compactGuildTriPaneChannelPanelOpen: Ref<boolean>;
  compactPagerPane: Ref<number>;
  guildMobileVcLobby: Ref<{
    channelId: string;
    channelName: string;
  } | null>;
  activeChannelId: Ref<string>;
  currentVoiceChannelId: Ref<string | null | undefined>;
}): {
  openGuildMobileVcLobby: (payload: {
    channelId: string;
    channelName: string;
  }) => void;
  closeGuildMobileVcLobby: () => void;
} {
  watch(deps.hasGuildChannelChrome, (on) => {
    if (!on) {
      deps.compactGuildTriPaneChannelPanelOpen.value = false;
      deps.guildMobileVcLobby.value = null;
    }
  });

  function openGuildMobileVcLobby(payload: {
    channelId: string;
    channelName: string;
  }) {
    deps.guildMobileVcLobby.value = payload;
    if (deps.isCompactShell.value && deps.hasGuildChannelChrome.value) {
      deps.compactPagerPane.value = 1;
    }
  }

  function closeGuildMobileVcLobby() {
    deps.guildMobileVcLobby.value = null;
  }

  watch(deps.activeChannelId, (next, prev) => {
    if (!deps.isCompactShell.value || !deps.hasGuildChannelChrome.value) return;
    if (next === prev) return;
    deps.compactPagerPane.value = 1;
  });

  watch(deps.currentVoiceChannelId, (vc) => {
    const lobby = deps.guildMobileVcLobby.value;
    if (!lobby || !vc?.trim()) return;
    if (vc.trim() === lobby.channelId.trim()) {
      deps.guildMobileVcLobby.value = null;
    }
  });

  return { openGuildMobileVcLobby, closeGuildMobileVcLobby };
}
