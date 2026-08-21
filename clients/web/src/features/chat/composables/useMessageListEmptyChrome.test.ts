// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, ref, type App } from 'vue';
import {
  MESSAGE_LIST_ACTION_BAR_GUTTER_PX,
  useMessageListEmptyChrome,
} from './useMessageListEmptyChrome';

describe('useMessageListEmptyChrome', () => {
  let app: App<Element> | null = null;

  afterEach(() => {
    app?.unmount();
    app = null;
    document.body.innerHTML = '';
  });

  function mountChrome(args: {
    isEmpty?: boolean;
    showLoadingSkeleton?: boolean;
    noServersYet?: boolean;
    guildShellSettling?: boolean;
    dmHistoryIntro?: unknown | null;
    serverId?: string;
    canShowDiscordChannelImport?: boolean;
    isDiscordImportedServer?: boolean;
    discordChannelId?: string;
    channelType?: 'text' | 'voice';
    compactTop?: boolean;
    hasChannel?: boolean;
    headerOverlayInsetPx?: number;
    coarsePointer?: boolean;
  }) {
    const isEmpty = ref(args.isEmpty ?? true);
    const showLoadingSkeleton = ref(args.showLoadingSkeleton ?? false);
    const coarsePointer = ref(args.coarsePointer ?? false);
    let api!: ReturnType<typeof useMessageListEmptyChrome>;
    const Host = defineComponent({
      setup() {
        api = useMessageListEmptyChrome({
          isEmpty,
          showLoadingSkeleton,
          noServersYet: () => !!args.noServersYet,
          guildShellSettling: () => !!args.guildShellSettling,
          dmHistoryIntro: () => args.dmHistoryIntro ?? null,
          serverId: () => args.serverId,
          canShowDiscordChannelImport: () => !!args.canShowDiscordChannelImport,
          isDiscordImportedServer: () => !!args.isDiscordImportedServer,
          discordChannelId: () => args.discordChannelId,
          channelType: () => args.channelType,
          compactTop: () => !!args.compactTop,
          hasChannel: () => !!args.hasChannel,
          headerOverlayInsetPx: () => args.headerOverlayInsetPx,
          coarsePointer,
        });
        return () => h('div');
      },
    });
    app = createApp(Host);
    app.mount(document.createElement('div'));
    return { api, isEmpty, showLoadingSkeleton };
  }

  it('shows the empty-channel hint for a loaded empty guild channel', () => {
    const { api } = mountChrome({ hasChannel: true });
    expect(api.showEmptyChannelHint.value).toBe(true);
    expect(api.showsBlockingEmptyChrome.value).toBe(true);
    expect(api.showNoServersYet.value).toBe(false);
    expect(api.showDiscordImportWidget.value).toBe(false);
    expect(api.showDmHistoryIntro.value).toBe(false);
  });

  it('shows no-servers chrome instead of the empty-channel hint', () => {
    const { api } = mountChrome({ noServersYet: true, hasChannel: true });
    expect(api.showNoServersYet.value).toBe(true);
    expect(api.showEmptyChannelHint.value).toBe(false);
    expect(api.showsBlockingEmptyChrome.value).toBe(true);
  });

  it('shows Discord import instead of the empty-channel hint', () => {
    const { api } = mountChrome({
      serverId: 's1',
      canShowDiscordChannelImport: true,
      isDiscordImportedServer: true,
      discordChannelId: 'd1',
      channelType: 'text',
    });
    expect(api.showDiscordImportWidget.value).toBe(true);
    expect(api.showEmptyChannelHint.value).toBe(false);
    expect(api.discordMessageImportEligible.value).toBe(true);
  });

  it('keeps DM intro in the list branch (not blocking empty chrome)', () => {
    const { api } = mountChrome({
      dmHistoryIntro: { title: 'Ada', subtitle: 'DM' },
    });
    expect(api.showDmHistoryIntro.value).toBe(true);
    expect(api.showEmptyChannelHint.value).toBe(false);
    expect(api.showsBlockingEmptyChrome.value).toBe(false);
  });

  it('hides empty chrome while the loading skeleton is up', () => {
    const { api } = mountChrome({
      showLoadingSkeleton: true,
      noServersYet: true,
    });
    expect(api.showNoServersYet.value).toBe(false);
    expect(api.showEmptyChannelHint.value).toBe(false);
    expect(api.showsBlockingEmptyChrome.value).toBe(false);
  });

  it('adds the action-bar gutter once messages exist', () => {
    const { api, isEmpty } = mountChrome({ hasChannel: true });
    expect(api.scrollContainerPaddingTopPx.value).toBe(48);
    isEmpty.value = false;
    expect(api.scrollContainerPaddingTopPx.value).toBe(
      48 + MESSAGE_LIST_ACTION_BAR_GUTTER_PX,
    );
  });

  it('uses header overlay inset when provided', () => {
    const { api } = mountChrome({
      hasChannel: true,
      headerOverlayInsetPx: 72,
    });
    expect(api.scrollContainerPaddingTopPx.value).toBe(72);
  });
});
