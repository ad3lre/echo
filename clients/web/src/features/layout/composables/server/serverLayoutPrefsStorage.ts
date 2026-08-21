export type ServerLayoutPrefs = {
  channelPanelCollapsed: boolean;
  channelPanelBubbleMode?: boolean;
  memberPanelCollapsed: boolean;
  voiceSideChatCollapsed: boolean;
  compactGuildTriPaneChannelPanelOpen: boolean;
  isMoreServersPinned: boolean;
};

const SERVER_LAYOUT_PREFS_STORAGE_KEY = 'echo-server-layout-prefs-v1';

export function readServerLayoutPrefsStore(): Record<
  string,
  ServerLayoutPrefs
> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SERVER_LAYOUT_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};
    const out: Record<string, ServerLayoutPrefs> = {};
    for (const [serverId, value] of Object.entries(parsed)) {
      if (!serverId.trim()) continue;
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const v = value as Partial<ServerLayoutPrefs>;
      out[serverId] = {
        channelPanelCollapsed: !!v.channelPanelCollapsed,
        memberPanelCollapsed: !!v.memberPanelCollapsed,
        voiceSideChatCollapsed: !!v.voiceSideChatCollapsed,
        compactGuildTriPaneChannelPanelOpen:
          !!v.compactGuildTriPaneChannelPanelOpen,
        isMoreServersPinned: !!v.isMoreServersPinned,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function writeServerLayoutPrefsStore(
  store: Record<string, ServerLayoutPrefs>,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      SERVER_LAYOUT_PREFS_STORAGE_KEY,
      JSON.stringify(store),
    );
  } catch {
    /* ignore quota / private mode */
  }
}
