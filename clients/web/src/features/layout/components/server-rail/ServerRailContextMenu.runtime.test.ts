// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { Server } from '@shared/types';
import ServerRailContextMenu from './ServerRailContextMenu.vue';

describe('ServerRailContextMenu runtime', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  it('keeps server settings click reliable under mousedown close listeners', async () => {
    const onSettings = vi.fn();
    const menuOpen = ref(true);
    const menuRef = ref<HTMLElement | null>(null);
    const contextServer = ref<Server | null>({
      id: 's1',
      name: 'Guild One',
    } as Server);

    const docMouseDown = () => {
      menuOpen.value = false;
    };
    document.addEventListener('mousedown', docMouseDown);

    try {
      const Host = defineComponent({
        setup() {
          return () =>
            h(ServerRailContextMenu, {
              menuOpen: menuOpen.value,
              menuRef,
              menuPosition: { left: 12, top: 24 },
              contextServer: contextServer.value,
              devModeIdsEnabled: false,
              canLeaveContextServer: true,
              onSettings,
            });
        },
      });

      container = document.createElement('div');
      document.body.appendChild(container);
      app = createApp(Host);
      app.mount(container);
      await nextTick();

      const settingsButton = Array.from(
        document.body.querySelectorAll('button'),
      ).find((btn) => btn.textContent?.includes('Server settings'));
      expect(settingsButton).toBeTruthy();
      expect(settingsButton?.className).toContain('echo-menu-item');
      const leaveButton = Array.from(
        document.body.querySelectorAll('button'),
      ).find((btn) => btn.textContent?.includes('Leave server'));
      expect(leaveButton).toBeTruthy();
      expect(leaveButton?.className).toContain('echo-menu-item--destructive');

      settingsButton!.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      );
      await nextTick();
      settingsButton!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      await nextTick();

      expect(onSettings).toHaveBeenCalledWith('s1');
      expect(menuOpen.value).toBe(true);
    } finally {
      document.removeEventListener('mousedown', docMouseDown);
    }
  });

  it('emits mark-read with server id on Mark as read click', async () => {
    const onMarkRead = vi.fn();
    const menuOpen = ref(true);
    const menuRef = ref<HTMLElement | null>(null);
    const contextServer = ref<Server | null>({
      id: 'guild-99',
      name: 'Test Guild',
    } as Server);

    const Host = defineComponent({
      setup() {
        return () =>
          h(ServerRailContextMenu, {
            menuOpen: menuOpen.value,
            menuRef,
            menuPosition: { left: 0, top: 0 },
            contextServer: contextServer.value,
            devModeIdsEnabled: false,
            canLeaveContextServer: true,
            onMarkRead,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();

    const markReadBtn = Array.from(
      document.body.querySelectorAll('button'),
    ).find((btn) => btn.textContent?.trim() === 'Mark as read');
    expect(markReadBtn).toBeTruthy();
    markReadBtn!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await nextTick();

    expect(onMarkRead).toHaveBeenCalledWith('guild-99');
  });
});
