// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { ChannelWithParticipants } from '@/features/channel-panel/useChannelPanelVoiceState';
import ChannelPanelContextMenu from './ChannelPanelContextMenu.vue';

describe('ChannelPanelContextMenu runtime', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  type Props = InstanceType<typeof ChannelPanelContextMenu>['$props'];

  function baseProps(overrides: Partial<Props> = {}): Props {
    return {
      menuOpen: true,
      panelContext: {
        type: 'channel',
        channel,
      },
      selectedServerId: 'server-1',
      menuPosition: { left: 0, top: 0 },
      devModeIdsEnabled: false,
      rowCanManageChannel: () => true,
      canCreateChannels: true,
      vcContextIsSelf: false,
      vcContextShowVoiceMod: false,
      showVcMentionInChat: false,
      vcMenuCanMute: false,
      vcMenuCanDeafen: false,
      vcMenuCanDisconnect: false,
      ...overrides,
    };
  }

  async function clickMenuButton(label: string) {
    const button = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes(label),
    );
    expect(button).toBeTruthy();
    button!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    await nextTick();
    button!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await nextTick();
  }

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  const channel = {
    id: 'ch-1',
    name: 'general',
    type: 'text',
  } as ChannelWithParticipants;

  it('fires channel delete on click under document mousedown close listeners', async () => {
    const onChannelMenuDelete = vi.fn();
    const menuOpen = ref(true);
    const menuRef = ref<HTMLElement | null>(null);

    const docMouseDown = () => {
      menuOpen.value = false;
    };
    document.addEventListener('mousedown', docMouseDown);

    try {
      const Host = defineComponent({
        setup() {
          return () =>
            h(
              ChannelPanelContextMenu,
              baseProps({
                menuOpen: menuOpen.value,
                menuRef,
                menuPosition: { left: 12, top: 24 },
                'onChannel-menu-delete': onChannelMenuDelete,
              }),
            );
        },
      });

      container = document.createElement('div');
      document.body.appendChild(container);
      app = createApp(Host);
      app.mount(container);
      await nextTick();

      await clickMenuButton('Delete channel');

      expect(onChannelMenuDelete).toHaveBeenCalledTimes(1);
      expect(menuOpen.value).toBe(true);
    } finally {
      document.removeEventListener('mousedown', docMouseDown);
    }
  });

  it('fires category delete on click under document mousedown close listeners', async () => {
    const onCategoryMenuDelete = vi.fn();
    const menuOpen = ref(true);
    const menuRef = ref<HTMLElement | null>(null);

    const docMouseDown = () => {
      menuOpen.value = false;
    };
    document.addEventListener('mousedown', docMouseDown);

    try {
      const Host = defineComponent({
        setup() {
          return () =>
            h(
              ChannelPanelContextMenu,
              baseProps({
                menuOpen: menuOpen.value,
                menuRef,
                panelContext: {
                  type: 'category',
                  categoryId: 'cat-1',
                  categoryName: 'Text channels',
                },
                rowCanManageChannel: () => false,
                'onCategory-menu-delete': onCategoryMenuDelete,
              }),
            );
        },
      });

      container = document.createElement('div');
      document.body.appendChild(container);
      app = createApp(Host);
      app.mount(container);
      await nextTick();

      await clickMenuButton('Delete category');

      expect(onCategoryMenuDelete).toHaveBeenCalledTimes(1);
      expect(menuOpen.value).toBe(true);
    } finally {
      document.removeEventListener('mousedown', docMouseDown);
    }
  });
});
