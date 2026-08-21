import { watch, type Ref } from 'vue';
import {
  isAppNavPath,
  parseAppPathname,
} from '@/features/layout/urlNavigation';

export type CloseSettingsModalsOnShellChangeDeps = {
  activeRailTab: Ref<unknown>;
  selectedServerId: { readonly selectedServerId?: string | null };
  activeChannelId: Ref<string>;
  isSettingsModalOpen: Ref<boolean>;
  settingsModalInitialSection: Ref<unknown>;
  isServerSettingsModalOpen: Ref<boolean>;
  serverSettingsModalInitialSection: Ref<unknown>;
};

/** Close user/server settings when rail, guild, or channel changes. */
export function watchCloseSettingsModalsOnShellChange(
  deps: CloseSettingsModalsOnShellChangeDeps,
) {
  watch(
    () =>
      [
        deps.activeRailTab.value,
        deps.selectedServerId.selectedServerId,
        deps.activeChannelId.value,
      ] as const,
    (next, prev) => {
      if (!prev) return;
      const [rail, serverId, channelId] = next;
      const [prevRail, prevServerId, prevChannelId] = prev;
      if (
        rail === prevRail &&
        serverId === prevServerId &&
        channelId === prevChannelId
      ) {
        return;
      }
      if (rail !== prevRail) {
        deps.isSettingsModalOpen.value = false;
        deps.settingsModalInitialSection.value = null;
      }
      if (
        rail !== prevRail ||
        serverId !== prevServerId ||
        channelId !== prevChannelId
      ) {
        deps.isServerSettingsModalOpen.value = false;
        deps.serverSettingsModalInitialSection.value = null;
      }
    },
  );
}

export type PreserveActiveChannelOnHydrateRaceDeps = {
  isDmUiContext: { readonly value: boolean };
  isInDMMode: { readonly value: boolean };
  isKnownDmChannelId: (channelId: string) => boolean;
};

/**
 * Keep DM / deep-link guild channel ids across hydrate races instead of
 * rewriting them to a guild fallback.
 */
export function createPreserveActiveChannelOnHydrateRace(
  deps: PreserveActiveChannelOnHydrateRaceDeps,
): (channelId: string) => boolean {
  return (channelId) => {
    if (deps.isDmUiContext.value || deps.isInDMMode.value) return true;
    if (deps.isKnownDmChannelId(channelId)) return true;
    if (typeof window === 'undefined') return false;
    const base = import.meta.env.BASE_URL;
    if (!isAppNavPath(window.location.pathname, base)) return false;
    const parsed = parseAppPathname(window.location.pathname, base);
    return parsed.kind === 'guild' && parsed.channelId === channelId;
  };
}
