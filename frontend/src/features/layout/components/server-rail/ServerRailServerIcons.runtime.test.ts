// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { Server } from '@shared/types';
import ServerRailServerIcons from './ServerRailServerIcons.vue';

vi.mock('@/components/PausedGifAvatar.vue', () => ({
  default: {
    name: 'PausedGifAvatar',
    props: ['src', 'alt'],
    template: '<img :src="src" :alt="alt" />',
  },
}));

function mkServer(id: string, name = id): Server {
  return {
    id,
    name,
    imageUrl: '',
  } as Server;
}

describe('ServerRailServerIcons runtime', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  it('renders dedicated horizontal pill slots in top rail mode', async () => {
    const visibleServers = [mkServer('s1'), mkServer('s2')];
    const selectedServerId = ref<string | null>('s2');

    const Host = defineComponent({
      setup() {
        return () =>
          h(ServerRailServerIcons, {
            visibleServers,
            selectedServerId: selectedServerId.value,
            areServersExpanded: true,
            reorderEnabled: false,
            railDragSourceIndex: null,
            railDropLineBefore: null,
            railGhostPosition: null,
            railDragGhostServer: null,
            showExtraServersRailButton: true,
            moreServersCount: 3,
            selectedOverflowServer: mkServer('s3'),
            unreadBadgeEnabled: true,
            horizontal: true,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(
      container.querySelectorAll('.server-folder__slot--h').length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      container.querySelectorAll('.server-folder__pill--h').length,
    ).toBeGreaterThanOrEqual(3);
    expect(container.querySelector('.server-folder__pill--v')).toBeNull();
  });

  it('keeps vertical pill rendering unchanged outside top mode', async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(ServerRailServerIcons, {
            visibleServers: [mkServer('s1')],
            selectedServerId: 's1',
            areServersExpanded: true,
            reorderEnabled: false,
            railDragSourceIndex: null,
            railDropLineBefore: null,
            railGhostPosition: null,
            railDragGhostServer: null,
            showExtraServersRailButton: false,
            moreServersCount: 0,
            selectedOverflowServer: null,
            unreadBadgeEnabled: true,
            horizontal: false,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.querySelector('.server-folder__pill--v')).not.toBeNull();
    expect(container.querySelector('.server-folder__pill--h')).toBeNull();
    expect(container.querySelector('.server-folder__slot--h')).toBeNull();
  });

  it('emits select-server in horizontal mode when selection is allowed', async () => {
    const onSelectServer = vi.fn();
    const allowSelect = ref(true);

    const Host = defineComponent({
      setup() {
        return () =>
          h(ServerRailServerIcons, {
            visibleServers: [mkServer('guild-1')],
            selectedServerId: null,
            areServersExpanded: true,
            reorderEnabled: false,
            railDragSourceIndex: null,
            railDropLineBefore: null,
            railGhostPosition: null,
            railDragGhostServer: null,
            showExtraServersRailButton: false,
            moreServersCount: 0,
            selectedOverflowServer: null,
            unreadBadgeEnabled: true,
            horizontal: true,
            beforeSelectServer: () => allowSelect.value,
            onSelectServer,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();

    const icon = container.querySelector('[data-cy="server-rail-icon"]');
    expect(icon).not.toBeNull();

    icon!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(onSelectServer).toHaveBeenCalledWith('guild-1');

    allowSelect.value = false;
    icon!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(onSelectServer).toHaveBeenCalledTimes(1);
  });
});
