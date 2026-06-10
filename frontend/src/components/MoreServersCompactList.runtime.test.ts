// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import type { MoreServersMockServer } from '@/composables/useMoreServers';
import type { MoreServerWidgetFolder } from '@/composables/useMoreServerFolders';
import MoreServersCompactList from '@/components/MoreServersCompactList.vue';

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
    onUngroupedDragOver: vi.fn(),
    onFolderDragOverCompact: vi.fn(),
    onFolderOrderDragOver: vi.fn(),
    onDrop: vi.fn(),
    onPanelDragOverCapture: vi.fn(),
    isPinned: vi.fn(() => false),
    openServer: vi.fn(),
    openServerContextMenu: vi.fn(),
    onCompactServerPointerEnter: vi.fn(),
    onCompactServerPointerLeave: vi.fn(),
    onCompactServerPointerDown: vi.fn(),
    onCompactServerDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    isFolderExpandedInCompact: vi.fn(() => false),
    toggleFolderExpandedInCompact: vi.fn(),
    onFolderDragStart: vi.fn(),
    openFolderContextMenu: vi.fn(),
    compactFolderDropRing: vi.fn(() => ''),
    folderPeekServers: vi.fn((servers: MoreServersMockServer[]) =>
      servers.slice(0, 4),
    ),
  };
}

describe('MoreServersCompactList runtime', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  type CompactProps = InstanceType<typeof MoreServersCompactList>['$props'];
  function mount(props: CompactProps) {
    const Host = defineComponent({
      setup: () => () => h(MoreServersCompactList, props),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
  }

  it('wires compact server actions through function props', async () => {
    const s = server();
    const h = handlers();
    mount({
      compactRows: [{ kind: 'server', server: s, ungroupedIndex: 0 }],
      folders: [],
      draggingFolderId: null,
      draggingServerId: null,
      ...h,
    });
    await nextTick();

    const button =
      container!.querySelector<HTMLButtonElement>('.compact-circle');
    button?.click();
    expect(h.openServer).toHaveBeenCalledWith('s1');

    button?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    expect(h.onCompactServerPointerEnter).toHaveBeenCalledWith(
      s,
      expect.any(PointerEvent),
    );
  });

  it('wires collapsed compact folder actions through function props', async () => {
    const s = server();
    const f = folder();
    const h = handlers();
    mount({
      compactRows: [
        { kind: 'folder', folder: f, servers: [s], folderOrderIndex: 0 },
      ],
      folders: [f],
      draggingFolderId: null,
      draggingServerId: null,
      ...h,
    });
    await nextTick();

    const folderButton = container!.querySelector<HTMLButtonElement>(
      '.widget-folder-compact-trigger',
    );
    folderButton?.click();
    expect(h.toggleFolderExpandedInCompact).toHaveBeenCalledWith('f1');

    folderButton?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true }),
    );
    expect(h.openFolderContextMenu).toHaveBeenCalledWith(
      'f1',
      expect.any(MouseEvent),
    );

    const dragOverEvent = new Event('dragover', {
      bubbles: true,
      cancelable: true,
    }) as DragEvent;
    folderButton?.dispatchEvent(dragOverEvent);
    expect(h.onFolderDragOverCompact).toHaveBeenCalledWith(
      'f1',
      0,
      dragOverEvent,
    );
    expect(h.onFolderOrderDragOver).toHaveBeenCalledWith(0, dragOverEvent);

    const dropEvent = new Event('drop', {
      bubbles: true,
      cancelable: true,
    }) as DragEvent;
    folderButton?.dispatchEvent(dropEvent);
    expect(h.onDrop).toHaveBeenCalledWith(dropEvent);
  });
});
