// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import type { MoreServerWidgetFolder } from '@/features/layout/composables/more-servers/useMoreServerFolders';
import MoreServerFolderAssignMenuItems from '@/features/layout/components/MoreServerFolderAssignMenuItems.vue';

function folder(id: string, name: string): MoreServerWidgetFolder {
  return { id, name, serverIds: [] };
}

describe('MoreServerFolderAssignMenuItems runtime', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  type Props = InstanceType<typeof MoreServerFolderAssignMenuItems>['$props'];
  function mount(props: Props) {
    const Host = defineComponent({
      setup: () => () => h(MoreServerFolderAssignMenuItems, props),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
  }

  function findButton(label: string): HTMLButtonElement | null {
    return (
      [...document.body.querySelectorAll('button')].find((b) =>
        (b.textContent ?? '').includes(label),
      ) ?? null
    );
  }

  it('emits assign after expanding the folder submenu', async () => {
    const onAssign = vi.fn();
    mount({
      folders: [folder('f1', 'Gaming'), folder('f2', 'Work')],
      currentFolderId: null,
      showRemove: false,
      onAssign,
      onRemove: vi.fn(),
      'onNew-folder': vi.fn(),
    });
    await nextTick();

    findButton('Move to folder')?.click();
    await nextTick();

    findButton('Gaming')?.click();
    expect(onAssign).toHaveBeenCalledWith('f1');
  });

  it('shows search once there are enough folders and filters results', async () => {
    mount({
      folders: [
        folder('f1', 'Gaming'),
        folder('f2', 'Work'),
        folder('f3', 'Music'),
        folder('f4', 'Art'),
      ],
      currentFolderId: null,
      showRemove: false,
      onAssign: vi.fn(),
      onRemove: vi.fn(),
      'onNew-folder': vi.fn(),
    });
    await nextTick();

    findButton('Move to folder')?.click();
    await nextTick();

    const search = document.body.querySelector<HTMLInputElement>(
      '#more-server-folder-submenu-search',
    );
    expect(search).toBeTruthy();

    search!.value = 'work';
    search!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    expect(findButton('Work')).toBeTruthy();
    expect(findButton('Gaming')).toBeNull();
  });

  it('hides the current folder from assignable targets', async () => {
    const onAssign = vi.fn();
    mount({
      folders: [folder('f1', 'Gaming'), folder('f2', 'Work')],
      currentFolderId: 'f1',
      showRemove: true,
      onAssign,
      onRemove: vi.fn(),
      'onNew-folder': vi.fn(),
    });
    await nextTick();

    findButton('Move to folder')?.click();
    await nextTick();

    expect(findButton('Gaming')).toBeNull();
    expect(findButton('Work')).toBeTruthy();
  });
});
