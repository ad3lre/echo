import { computed, type ComputedRef, type Ref } from 'vue';
import type { EchoChannelType } from '@shared/types';

/** Hover action-bar gutter above the first real row. */
export const MESSAGE_LIST_ACTION_BAR_GUTTER_PX = 14;

export type UseMessageListEmptyChromeOptions = {
  isEmpty: Ref<boolean> | ComputedRef<boolean>;
  showLoadingSkeleton: Ref<boolean> | ComputedRef<boolean>;
  noServersYet: () => boolean;
  guildShellSettling: () => boolean;
  dmHistoryIntro: () => unknown | null | undefined;
  serverId: () => string | undefined;
  canShowDiscordChannelImport: () => boolean;
  isDiscordImportedServer: () => boolean;
  discordChannelId: () => string | undefined;
  channelType: () => EchoChannelType | undefined;
  compactTop: () => boolean;
  hasChannel: () => boolean;
  headerOverlayInsetPx: () => number | undefined;
  coarsePointer: Ref<boolean> | ComputedRef<boolean>;
};

/**
 * Empty-channel chrome flags + scroll-container padding.
 * Does not own scroll writes, overlay timing, or virtualizer options.
 */
export function useMessageListEmptyChrome(
  options: UseMessageListEmptyChromeOptions,
) {
  const showNoServersYet = computed(
    () =>
      !!options.noServersYet() &&
      options.isEmpty.value &&
      !options.showLoadingSkeleton.value,
  );

  const discordMessageImportEligible = computed(
    () =>
      !!options.serverId() &&
      !!options.canShowDiscordChannelImport() &&
      !!options.isDiscordImportedServer() &&
      !!options.discordChannelId() &&
      options.channelType() === 'text',
  );

  const showEmptyChannelHint = computed(
    () =>
      options.isEmpty.value &&
      !options.showLoadingSkeleton.value &&
      !options.guildShellSettling() &&
      !showNoServersYet.value &&
      !discordMessageImportEligible.value &&
      !options.dmHistoryIntro(),
  );

  const showDiscordImportWidget = computed(
    () =>
      options.isEmpty.value &&
      !options.showLoadingSkeleton.value &&
      !options.guildShellSettling() &&
      !showNoServersYet.value &&
      discordMessageImportEligible.value,
  );

  const showDmHistoryIntro = computed(
    () =>
      options.isEmpty.value &&
      !!options.dmHistoryIntro() &&
      !options.showLoadingSkeleton.value &&
      !options.guildShellSettling() &&
      !showNoServersYet.value &&
      !showDiscordImportWidget.value,
  );

  const showsBlockingEmptyChrome = computed(
    () =>
      showNoServersYet.value ||
      showEmptyChannelHint.value ||
      showDiscordImportWidget.value,
  );

  const scrollContainerPaddingTopPx = computed(() =>
    resolveScrollContainerPaddingTopPx(options, showDmHistoryIntro.value),
  );

  const scrollContainerPaddingBottomClass = computed(() => {
    if (!options.isEmpty.value || options.showLoadingSkeleton.value) return '';
    if (options.compactTop()) return 'pb-3';
    if (options.hasChannel()) return 'pb-12';
    return 'pb-4';
  });

  return {
    showNoServersYet,
    discordMessageImportEligible,
    showEmptyChannelHint,
    showDiscordImportWidget,
    showDmHistoryIntro,
    showsBlockingEmptyChrome,
    scrollContainerPaddingTopPx,
    scrollContainerPaddingBottomClass,
  };
}

function resolveScrollContainerPaddingTopPx(
  options: UseMessageListEmptyChromeOptions,
  showDmHistoryIntro: boolean,
): number {
  const gutter = !options.isEmpty.value ? MESSAGE_LIST_ACTION_BAR_GUTTER_PX : 0;
  const overlay = options.headerOverlayInsetPx();
  if (typeof overlay === 'number' && Number.isFinite(overlay) && overlay > 0) {
    return overlay + gutter;
  }
  let base = options.compactTop() ? 12 : options.hasChannel() ? 48 : 16;
  if (showDmHistoryIntro && options.coarsePointer.value) {
    base = Math.max(base, 52);
  }
  return base + gutter;
}
