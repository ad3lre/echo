import { onUnmounted, ref, watch, type Ref } from 'vue';
import {
  readServerLayoutPrefsStore,
  writeServerLayoutPrefsStore,
  type ServerLayoutPrefs,
} from './serverLayoutPrefsStorage';

/**
 * Per-server panel layout prefs (collapse flags, pinned sidebar, bubble mode),
 * persisted to localStorage (debounced) and restored on server switch. Writes
 * are suppressed while restoring so a switch doesn't clobber the prefs of the
 * server being left.
 */
export function useAppLayoutServerLayoutPrefs(deps: {
  channelPanelCollapsed: Ref<boolean>;
  channelPanelBubbleMode: Ref<boolean>;
  memberPanelCollapsed: Ref<boolean>;
  voiceSideChatCollapsed: Ref<boolean>;
  compactGuildTriPaneChannelPanelOpen: Ref<boolean>;
  isMoreServersPinned: Ref<boolean>;
  markMemberPanelExpandedByUser: () => void;
  markMemberPanelCollapsedByUser: () => void;
  selectedServerId: Ref<string | null | undefined>;
}) {
  const {
    channelPanelCollapsed,
    channelPanelBubbleMode,
    memberPanelCollapsed,
    voiceSideChatCollapsed,
    compactGuildTriPaneChannelPanelOpen,
    isMoreServersPinned,
    markMemberPanelExpandedByUser,
    markMemberPanelCollapsedByUser,
    selectedServerId,
  } = deps;

  const serverLayoutPrefsById = ref<Record<string, ServerLayoutPrefs>>(
    readServerLayoutPrefsStore(),
  );
  let serverLayoutPrefsPersistTimer: ReturnType<typeof setTimeout> | null =
    null;
  /**
   * True while `applyServerLayoutPrefsFor` is writing reactive refs from storage.
   * Prevents the layout-change watcher from immediately writing those values back,
   * which would corrupt the prefs for the server we just left.
   */
  let applyingServerLayoutPrefs = false;

  /** Strips whitespace and rejects the synthetic 'echo' DM rail server id. */
  function normalizedPrefsServerId(
    raw: string | null | undefined,
  ): string | null {
    const sid = raw?.trim() ?? '';
    if (!sid || sid === 'echo') return null;
    return sid;
  }

  /** Debounces writes to localStorage — layout changes fire rapidly during drag resize. */
  function persistServerLayoutPrefsSoon() {
    if (serverLayoutPrefsPersistTimer != null) {
      clearTimeout(serverLayoutPrefsPersistTimer);
    }
    serverLayoutPrefsPersistTimer = setTimeout(() => {
      serverLayoutPrefsPersistTimer = null;
      writeServerLayoutPrefsStore(serverLayoutPrefsById.value);
    }, 120);
  }

  onUnmounted(() => {
    if (serverLayoutPrefsPersistTimer != null) {
      clearTimeout(serverLayoutPrefsPersistTimer);
      serverLayoutPrefsPersistTimer = null;
      writeServerLayoutPrefsStore(serverLayoutPrefsById.value);
    }
  });

  /** Snapshots current panel state into the in-memory prefs map for the given server. */
  function writeServerLayoutPrefsFor(serverId: string | null | undefined) {
    const sid = normalizedPrefsServerId(serverId);
    if (!sid || applyingServerLayoutPrefs) return;
    serverLayoutPrefsById.value = {
      ...serverLayoutPrefsById.value,
      [sid]: {
        channelPanelCollapsed: channelPanelCollapsed.value,
        channelPanelBubbleMode: channelPanelBubbleMode.value,
        memberPanelCollapsed: memberPanelCollapsed.value,
        voiceSideChatCollapsed: voiceSideChatCollapsed.value,
        compactGuildTriPaneChannelPanelOpen:
          compactGuildTriPaneChannelPanelOpen.value,
        isMoreServersPinned: isMoreServersPinned.value,
      },
    };
    persistServerLayoutPrefsSoon();
  }

  /**
   * Restores panel state for the given server from the in-memory prefs map.
   * Falls back to expanded defaults on first visit (no stored prefs).
   */
  function applyServerLayoutPrefsFor(serverId: string | null | undefined) {
    const sid = normalizedPrefsServerId(serverId);
    if (!sid) return;
    const prefs = serverLayoutPrefsById.value[sid];
    applyingServerLayoutPrefs = true;
    try {
      if (prefs) {
        channelPanelCollapsed.value = prefs.channelPanelCollapsed;
        channelPanelBubbleMode.value = prefs.channelPanelBubbleMode ?? false;
        memberPanelCollapsed.value = prefs.memberPanelCollapsed;
        if (prefs.memberPanelCollapsed) {
          markMemberPanelCollapsedByUser();
        }
        voiceSideChatCollapsed.value = prefs.voiceSideChatCollapsed;
        compactGuildTriPaneChannelPanelOpen.value =
          prefs.compactGuildTriPaneChannelPanelOpen;
        isMoreServersPinned.value = prefs.isMoreServersPinned;
        return;
      }
      // First visit for this server: start from expanded defaults.
      channelPanelCollapsed.value = false;
      channelPanelBubbleMode.value = false;
      memberPanelCollapsed.value = false;
      voiceSideChatCollapsed.value = false;
      compactGuildTriPaneChannelPanelOpen.value = false;
      isMoreServersPinned.value = false;
    } finally {
      applyingServerLayoutPrefs = false;
    }
  }

  watch(
    [
      channelPanelCollapsed,
      memberPanelCollapsed,
      voiceSideChatCollapsed,
      compactGuildTriPaneChannelPanelOpen,
      isMoreServersPinned,
    ],
    () => {
      writeServerLayoutPrefsFor(selectedServerId.value);
    },
  );

  watch(
    selectedServerId,
    (next, prev) => {
      writeServerLayoutPrefsFor(prev);
      applyServerLayoutPrefsFor(next);
    },
    { immediate: true },
  );
}
