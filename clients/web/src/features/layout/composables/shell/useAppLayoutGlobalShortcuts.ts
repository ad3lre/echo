import { onScopeDispose, type Ref } from 'vue';
import type { useServerStore } from '@/features/layout/server';
import { findActionForKeyboardEvent } from '@/features/settings/keybindPreferences';

/**
 * App-shell global keyboard shortcuts: voice mute/deafen, quick switcher / search
 * focus, mark-channel-read, and rail server selection (1–5).
 *
 * Owns its own `window` keydown listener for the lifetime of the calling scope
 * (registered on call, removed on scope dispose), so the host component no longer
 * threads this through its shared mount / teardown hooks. Behaviour is unchanged
 * from the inline handler this replaces.
 */
export function useAppLayoutGlobalShortcuts(deps: {
  dmCallWithUserId: Readonly<Ref<string | null | undefined>>;
  dmCallDeafened: Readonly<Ref<boolean>>;
  channelPanelVcMutedEffective: Readonly<Ref<boolean>>;
  channelPanelVcDeafenedEffective: Readonly<Ref<boolean>>;
  serverStore: Pick<ReturnType<typeof useServerStore>, 'visibleServers'>;
  toggleDmCallMuted: () => void;
  applyDmCallDeafened: (next: boolean) => void;
  onGuildChannelVcMuted: (next: boolean) => void;
  onGuildChannelVcDeafened: (next: boolean) => void;
  markActiveChannelAsRead: () => void | Promise<void>;
  openServerSurface: (serverId: string, channelId?: string) => void;
}) {
  const {
    dmCallWithUserId,
    dmCallDeafened,
    channelPanelVcMutedEffective,
    channelPanelVcDeafenedEffective,
    serverStore,
    toggleDmCallMuted,
    applyDmCallDeafened,
    onGuildChannelVcMuted,
    onGuildChannelVcDeafened,
    markActiveChannelAsRead,
    openServerSurface,
  } = deps;

  function isEditableEventTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.closest('[contenteditable="true"]')) return true;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
  }

  function onGlobalShortcutKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || e.isComposing) return;
    const action = findActionForKeyboardEvent(e);
    if (!action) return;
    if (isEditableEventTarget(e.target) && !action.startsWith('navigation.'))
      return;
    switch (action) {
      case 'voice.toggleMute':
        e.preventDefault();
        if (dmCallWithUserId.value) {
          toggleDmCallMuted();
        } else {
          onGuildChannelVcMuted(!channelPanelVcMutedEffective.value);
        }
        break;
      case 'voice.toggleDeafen':
        e.preventDefault();
        if (dmCallWithUserId.value) {
          applyDmCallDeafened(!dmCallDeafened.value);
        } else {
          onGuildChannelVcDeafened(!channelPanelVcDeafenedEffective.value);
        }
        break;
      case 'navigation.quickSwitcher':
      case 'navigation.openSearch':
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent('echo:focus-search', { detail: { selectAll: true } }),
        );
        break;
      case 'navigation.markChannelRead':
        e.preventDefault();
        void markActiveChannelAsRead();
        break;
      case 'navigation.selectRailServer1':
      case 'navigation.selectRailServer2':
      case 'navigation.selectRailServer3':
      case 'navigation.selectRailServer4':
      case 'navigation.selectRailServer5': {
        e.preventDefault();
        const slot =
          Number(action.slice('navigation.selectRailServer'.length)) - 1;
        const row = serverStore.visibleServers[slot];
        if (row?.id) openServerSurface(row.id);
        break;
      }
      default:
        break;
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onGlobalShortcutKeydown);
    onScopeDispose(() => {
      window.removeEventListener('keydown', onGlobalShortcutKeydown);
    });
  }

  return { onGlobalShortcutKeydown };
}
