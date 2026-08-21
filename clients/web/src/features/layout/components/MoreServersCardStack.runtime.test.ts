// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import type { MoreServersMockServer } from '@/features/layout/composables/more-servers/useMoreServers';
import type { MoreServerWidgetFolder } from '@/features/layout/composables/more-servers/useMoreServerFolders';
import MoreServersCardStack from '@/features/layout/components/MoreServersCardStack.vue';

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

function folder(): MoreServerWidgetFolder {
  return { id: 'f1', name: 'Widget Folder', serverIds: ['s1'] };
}

function handlers() {
  return {
    isDropTargetActive: vi.fn(() => false),
    onPanelBackgroundClick: vi.fn(),
    onFolderDragOverCard: vi.fn(),
    onFolderOrderDragOver: vi.fn(),
    onDrop: vi.fn(),
    onPanelDragOverCapture: vi.fn(),
    openFolderContextMenu: vi.fn(),
    onFolderDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    isFolderCollapsedInCard: vi.fn(() => false),
    toggleFolderCollapsedInCard: vi.fn(),
    folderPeekServers: vi.fn((servers: MoreServersMockServer[]) =>
      servers.slice(0, 4),
    ),
    onUngroupedDragOver: vi.fn(),
    onCardServerDragStart: vi.fn(),
    openServerContextMenu: vi.fn(),
    serverBannerStyle: vi.fn(() => ({})),
    serverInviteLabel: vi.fn(() => ''),
    isPinned: vi.fn(() => false),
    openServer: vi.fn(),
    togglePin: vi.fn(),
    toggleMenu: vi.fn(),
    setCardMenuTriggerRef: vi.fn(),
  };
}

describe('MoreServersCardStack runtime', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  type CardProps = InstanceType<typeof MoreServersCardStack>['$props'];
  function mount(props: CardProps) {
    const Host = defineComponent({
      setup: () => () => h(MoreServersCardStack, props),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
  }

  it('wires card server actions through function props', async () => {
    const s = server();
    const h = handlers();
    mount({
      cardStack: [
        {
          type: 'server',
          key: 'u-s1',
          server: s,
          topSpacer: false,
          ungroupedIndex: 0,
        },
      ],
      folders: [],
      foldersWithServers: [],
      foldersWithServersMap: new Map(),
      normalizedOtherServersSearch: '',
      otherServersSearchQuery: '',
      filteredUngroupedServers: [s],
      draggingFolderId: null,
      draggingServerId: null,
      openMenuId: null,
      ...h,
    });
    await nextTick();

    container!.querySelector<HTMLButtonElement>('.open-btn')?.click();
    expect(h.openServer).toHaveBeenCalledWith('s1');

    container!
      .querySelector<HTMLButtonElement>('button[title="Pin to server list"]')
      ?.click();
    expect(h.togglePin).toHaveBeenCalledWith(s);

    container!
      .querySelector<HTMLButtonElement>('button[title="More options"]')
      ?.click();
    expect(h.toggleMenu).toHaveBeenCalledWith('s1');
  });

  it('wires folder header actions through function props', async () => {
    const s = server();
    const f = folder();
    const h = handlers();
    mount({
      cardStack: [
        {
          type: 'folderLabel',
          key: 'h-f1',
          folder: f,
          folderOrderIndex: 0,
        },
      ],
      folders: [f],
      foldersWithServers: [{ folder: f, servers: [s] }],
      foldersWithServersMap: new Map([['f1', { folder: f, servers: [s] }]]),
      normalizedOtherServersSearch: '',
      otherServersSearchQuery: '',
      filteredUngroupedServers: [],
      draggingFolderId: null,
      draggingServerId: null,
      openMenuId: null,
      ...h,
    });
    await nextTick();

    container!
      .querySelector<HTMLButtonElement>(
        'button[title="Hide servers in folder"]',
      )
      ?.click();
    expect(h.toggleFolderCollapsedInCard).toHaveBeenCalledWith('f1');

    container!
      .querySelector<HTMLButtonElement>('button[title="Folder options"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(h.openFolderContextMenu).toHaveBeenCalledWith(
      'f1',
      expect.any(MouseEvent),
    );

    const folderDropTarget = container!.querySelector<HTMLElement>(
      '.widget-folder-card',
    );
    const dragOverEvent = new Event('dragover', {
      bubbles: true,
      cancelable: true,
    }) as DragEvent;
    folderDropTarget?.dispatchEvent(dragOverEvent);
    expect(h.onFolderDragOverCard).toHaveBeenCalledWith('f1', 0, dragOverEvent);
    expect(h.onFolderOrderDragOver).toHaveBeenCalledWith(0, dragOverEvent);

    const dropEvent = new Event('drop', {
      bubbles: true,
      cancelable: true,
    }) as DragEvent;
    folderDropTarget?.dispatchEvent(dropEvent);
    expect(h.onDrop).toHaveBeenCalledWith(dropEvent);
  });
});
