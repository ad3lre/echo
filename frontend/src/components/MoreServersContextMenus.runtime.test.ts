// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import type { MoreServersMockServer } from '@/composables/useMoreServers';
import type { MoreServerWidgetFolder } from '@/composables/useMoreServerFolders';
import MoreServersContextMenus from '@/components/MoreServersContextMenus.vue';

function server(): MoreServersMockServer {
  return {
    id: 's1',
    name: 'Alpha Server',
    icon: '',
    members: '',
    online: '',
    description: '',
    tags: [],
    verified: false,
  };
}

/** Stable spy bag for the menu's function-props. */
function handlers() {
  return {
    openServerInfo: vi.fn(),
    inviteServer: vi.fn(),
    togglePin: vi.fn(),
    assignServerToFolder: vi.fn(),
    newFolderWithServer: vi.fn(),
    onLeaveServer: vi.fn(),
    contextMenuToggleFolderLayout: vi.fn(),
    contextMenuEditFolder: vi.fn(),
    openCreateFolderModal: vi.fn(),
    contextMenuDeleteFolder: vi.fn(),
    assignServerToFolderFromMenu: vi.fn(),
    newFolderFromContextMenu: vi.fn(),
  };
}

describe('MoreServersContextMenus runtime', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  type MenuProps = InstanceType<typeof MoreServersContextMenus>['$props'];
  function mount(props: Record<string, unknown>) {
    const Host = defineComponent({
      setup: () => () =>
        h(MoreServersContextMenus, props as unknown as MenuProps),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
  }

  function findMenuButton(label: string): HTMLButtonElement | null {
    const card = document.body.querySelector('[data-more-servers-card-menu]');
    if (!card) return null;
    return (
      [...card.querySelectorAll('button')].find((b) =>
        (b.textContent ?? '').includes(label),
      ) ?? null
    );
  }

  it('renders the open card menu and wires its actions', async () => {
    const h = handlers();
    const folders: MoreServerWidgetFolder[] = [
      { id: 'f1', name: 'Gaming', serverIds: [] },
    ];
    mount({
      openMenuId: 's1',
      openMenuServer: server(),
      cardMenuPosition: { left: 10, top: 10 },
      cardMenuStyle: { left: '10px', top: '10px' },
      contextMenu: null,
      contextMenuStyle: {},
      folders,
      contextMenuFolderName: 'Folder',
      contextMenuFolderExpandedLabel: '',
      isPinned: () => false,
      folderForServer: () => null,
      ...h,
    });
    await nextTick();

    // Card menu is teleported to <body>.
    expect(
      document.body.querySelector('[data-more-servers-card-menu]'),
    ).toBeTruthy();

    findMenuButton('View server info')?.click();
    expect(h.openServerInfo).toHaveBeenCalledWith('s1');

    findMenuButton('Leave server')?.click();
    expect(h.onLeaveServer).toHaveBeenCalledWith('s1');

    findMenuButton('Pin to rail')?.click();
    expect(h.togglePin).toHaveBeenCalledTimes(1);

    expect(findMenuButton('Move to folder')).toBeTruthy();
    expect(findMenuButton('Move to “')).toBeNull();
  });

  it('renders nothing when no menu is open', async () => {
    mount({
      openMenuId: null,
      openMenuServer: null,
      cardMenuPosition: null,
      cardMenuStyle: {},
      contextMenu: null,
      contextMenuStyle: {},
      folders: [],
      contextMenuFolderName: 'Folder',
      contextMenuFolderExpandedLabel: '',
      isPinned: () => false,
      folderForServer: () => null,
      ...handlers(),
    });
    await nextTick();
    expect(
      document.body.querySelector('[data-more-servers-card-menu]'),
    ).toBeNull();
    expect(
      document.body.querySelector('[data-more-servers-folder-menu]'),
    ).toBeNull();
  });
});
