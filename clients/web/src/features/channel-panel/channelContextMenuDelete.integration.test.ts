// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { ChannelWithParticipants } from '@/features/channel-panel/useChannelPanelVoiceState';
import ChannelPanelContextMenu from '@/features/channel-panel/components/ChannelPanelContextMenu.vue';
import AppLayoutDialogHost from '@/features/layout/components/AppLayoutDialogHost.vue';
import {
  dispatchAppDialogResponse,
  ECHO_APP_DIALOG_REQUEST_EVENT,
  requestAppConfirmFromContextMenu,
} from '@/features/layout/failures/appDialogs';

describe('channelContextMenuDelete integration', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  const channel = {
    id: 'ch-1',
    name: 'general',
    type: 'text',
  } as ChannelWithParticipants;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
    vi.restoreAllMocks();
  });

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

  function mountDeleteHarness(options: {
    kind: 'channel' | 'category';
    deleteChannelHandler?: (payload: { channelId: string }) => Promise<void>;
    deleteCategoryHandler?: (payload: { categoryId: string }) => Promise<void>;
    channelCount?: number;
    withDialogHost?: boolean;
  }) {
    const menuOpen = ref(true);
    const menuRef = ref<HTMLElement | null>(null);
    const closeMenu = vi.fn(() => {
      menuOpen.value = false;
    });

    const deleteChannelHandler =
      options.deleteChannelHandler ?? vi.fn(async () => {});
    const deleteCategoryHandler =
      options.deleteCategoryHandler ?? vi.fn(async () => {});

    async function onChannelMenuDelete() {
      const id = channel.id;
      const label = channel.name;
      const ok = await requestAppConfirmFromContextMenu(closeMenu, {
        title: `Delete channel “${label}”?`,
        confirmLabel: 'Delete channel',
        danger: true,
      });
      if (!ok) return;
      await deleteChannelHandler({ channelId: id });
    }

    async function onCategoryMenuDelete() {
      const categoryId = 'cat-1';
      const categoryName = 'Text channels';
      const n = options.channelCount ?? 2;
      const ok = await requestAppConfirmFromContextMenu(closeMenu, {
        title: `Delete category “${categoryName}”?`,
        message: `Delete this category and all ${n} channels inside it? This cannot be undone.`,
        confirmLabel: 'Delete category',
        danger: true,
      });
      if (!ok) return;
      await deleteCategoryHandler({ categoryId });
    }

    const docMouseDown = () => {
      menuOpen.value = false;
    };
    document.addEventListener('mousedown', docMouseDown);

    const Host = defineComponent({
      setup() {
        return () =>
          h('div', [
            options.withDialogHost ? h(AppLayoutDialogHost) : null,
            h(
              ChannelPanelContextMenu,
              options.kind === 'channel'
                ? {
                    menuOpen: menuOpen.value,
                    menuRef,
                    menuPosition: { left: 12, top: 24 },
                    panelContext: { type: 'channel', channel },
                    selectedServerId: 'server-1',
                    devModeIdsEnabled: false,
                    rowCanManageChannel: () => true,
                    canCreateChannels: true,
                    vcContextIsSelf: false,
                    vcContextShowVoiceMod: false,
                    showVcMentionInChat: false,
                    vcMenuCanMute: false,
                    vcMenuCanDeafen: false,
                    vcMenuCanDisconnect: false,
                    onChannelMenuDelete,
                  }
                : {
                    menuOpen: menuOpen.value,
                    menuRef,
                    menuPosition: { left: 12, top: 24 },
                    panelContext: {
                      type: 'category',
                      categoryId: 'cat-1',
                      categoryName: 'Text channels',
                    },
                    selectedServerId: 'server-1',
                    devModeIdsEnabled: false,
                    rowCanManageChannel: () => false,
                    canCreateChannels: true,
                    vcContextIsSelf: false,
                    vcContextShowVoiceMod: false,
                    showVcMentionInChat: false,
                    vcMenuCanMute: false,
                    vcMenuCanDeafen: false,
                    vcMenuCanDisconnect: false,
                    onCategoryMenuDelete,
                  },
            ),
          ]);
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);

    return {
      menuOpen,
      closeMenu,
      deleteChannelHandler,
      deleteCategoryHandler,
      cleanup: () => document.removeEventListener('mousedown', docMouseDown),
    };
  }

  async function respondToConfirmDialog(ok: boolean) {
    await new Promise<void>((resolve) => {
      const listener = (e: Event) => {
        const ce = e as CustomEvent<{ id: string; kind: string }>;
        if (ce.detail?.kind !== 'confirm') return;
        window.removeEventListener(ECHO_APP_DIALOG_REQUEST_EVENT, listener);
        queueMicrotask(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              dispatchAppDialogResponse({
                id: ce.detail.id,
                kind: 'confirm',
                ok,
              });
              resolve();
            });
          });
        });
      };
      window.addEventListener(ECHO_APP_DIALOG_REQUEST_EVENT, listener);
    });
  }

  it('confirms channel delete before closing menu and calling deleteChannelHandler', async () => {
    const deleteChannelHandler = vi.fn(async () => {});
    const harness = mountDeleteHarness({
      kind: 'channel',
      deleteChannelHandler,
    });

    try {
      await nextTick();
      const deletePromise = clickMenuButton('Delete channel');
      await respondToConfirmDialog(true);
      await deletePromise;

      expect(harness.closeMenu).toHaveBeenCalledTimes(1);
      expect(deleteChannelHandler).toHaveBeenCalledTimes(1);
      expect(deleteChannelHandler).toHaveBeenCalledWith({ channelId: 'ch-1' });
    } finally {
      harness.cleanup();
    }
  });

  it('confirms category delete before closing menu and calling deleteCategoryHandler', async () => {
    const deleteCategoryHandler = vi.fn(async () => {});
    const harness = mountDeleteHarness({
      kind: 'category',
      deleteCategoryHandler,
      channelCount: 3,
    });

    try {
      await nextTick();
      const deletePromise = clickMenuButton('Delete category');
      await respondToConfirmDialog(true);
      await deletePromise;

      expect(harness.closeMenu).toHaveBeenCalledTimes(1);
      expect(deleteCategoryHandler).toHaveBeenCalledTimes(1);
      expect(deleteCategoryHandler).toHaveBeenCalledWith({
        categoryId: 'cat-1',
      });
    } finally {
      harness.cleanup();
    }
  });

  it('does not call delete handler when confirm is cancelled', async () => {
    const deleteChannelHandler = vi.fn(async () => {});
    const harness = mountDeleteHarness({
      kind: 'channel',
      deleteChannelHandler,
    });

    try {
      await nextTick();
      const deletePromise = clickMenuButton('Delete channel');
      await respondToConfirmDialog(false);
      await deletePromise;

      expect(harness.closeMenu).toHaveBeenCalledTimes(1);
      expect(deleteChannelHandler).not.toHaveBeenCalled();
    } finally {
      harness.cleanup();
    }
  });

  it('does not close menu before confirm dialog is answered', async () => {
    const deleteChannelHandler = vi.fn(async () => {});
    const harness = mountDeleteHarness({
      kind: 'channel',
      deleteChannelHandler,
    });

    try {
      await nextTick();

      let dialogId: string | null = null;
      const dialogRequested = new Promise<void>((resolve) => {
        const listener = (e: Event) => {
          const ce = e as CustomEvent<{ id: string; kind: string }>;
          if (ce.detail?.kind !== 'confirm') return;
          window.removeEventListener(ECHO_APP_DIALOG_REQUEST_EVENT, listener);
          dialogId = ce.detail.id;
          expect(harness.closeMenu).not.toHaveBeenCalled();
          resolve();
        };
        window.addEventListener(ECHO_APP_DIALOG_REQUEST_EVENT, listener);
      });

      void clickMenuButton('Delete channel');
      await dialogRequested;
      expect(harness.closeMenu).not.toHaveBeenCalled();

      dispatchAppDialogResponse({
        id: dialogId!,
        kind: 'confirm',
        ok: true,
      });
      await vi.waitFor(() => {
        expect(harness.closeMenu).toHaveBeenCalledTimes(1);
        expect(deleteChannelHandler).toHaveBeenCalledTimes(1);
      });
    } finally {
      harness.cleanup();
    }
  });

  it('clicks through AppLayoutDialogHost confirm button end-to-end', async () => {
    const deleteChannelHandler = vi.fn(async () => {});
    const harness = mountDeleteHarness({
      kind: 'channel',
      deleteChannelHandler,
      withDialogHost: true,
    });

    try {
      await nextTick();
      void clickMenuButton('Delete channel');
      await vi.waitFor(() => {
        expect(
          document.body.textContent?.includes('Delete channel “general”?'),
        ).toBe(true);
      });
      expect(harness.closeMenu).not.toHaveBeenCalled();

      const confirmButton = Array.from(
        document.body.querySelectorAll('button'),
      ).find(
        (btn) =>
          btn.textContent?.trim() === 'Delete channel' &&
          !btn.textContent?.includes('Delete channel “'),
      );
      expect(confirmButton).toBeTruthy();
      confirmButton!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );

      await vi.waitFor(() => {
        expect(deleteChannelHandler).toHaveBeenCalledTimes(1);
        expect(harness.closeMenu).toHaveBeenCalledTimes(1);
      });
      expect(deleteChannelHandler).toHaveBeenCalledWith({ channelId: 'ch-1' });
    } finally {
      harness.cleanup();
    }
  });
});
