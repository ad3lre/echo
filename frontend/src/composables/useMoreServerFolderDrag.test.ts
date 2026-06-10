// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MORE_FOLDER_DRAG_MIME,
  MORE_SERVER_DRAG_MIME,
  resolveMoreServerDropTargetFromPointer,
  shouldAbortMoreServerNestedDrag,
} from '@/composables/useMoreServerFolderDrag';

describe('useMoreServerFolderDrag helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('shouldAbortMoreServerNestedDrag blocks drags from nested buttons', () => {
    document.body.innerHTML = `
      <article draggable="true" id="card">
        <button type="button" id="btn">Open</button>
      </article>
    `;
    const card = document.getElementById('card')!;
    const btn = document.getElementById('btn')!;
    const event = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(event, 'target', { value: btn });
    Object.defineProperty(event, 'currentTarget', { value: card });
    expect(shouldAbortMoreServerNestedDrag(event)).toBe(true);
  });

  it('shouldAbortMoreServerNestedDrag allows drags from the draggable item itself', () => {
    document.body.innerHTML = `
      <button type="button" draggable="true" id="icon">Icon</button>
    `;
    const icon = document.getElementById('icon')!;
    const event = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(event, 'target', { value: icon });
    Object.defineProperty(event, 'currentTarget', { value: icon });
    expect(shouldAbortMoreServerNestedDrag(event)).toBe(false);
  });

  it('resolveMoreServerDropTargetFromPointer uses midpoint folder insert index', () => {
    document.body.innerHTML = `
      <div
        data-ms-drop="folder"
        data-ms-drop-folder="f-target"
        data-ms-drop-index="2"
        data-ms-folder-order-index="1"
        id="slot"
        style="position:fixed;left:0;top:100px;width:40px;height:40px"
      ></div>
    `;
    const slot = document.getElementById('slot')!;
    slot.getBoundingClientRect = () =>
      ({
        top: 100,
        bottom: 140,
        left: 0,
        right: 40,
        width: 40,
        height: 40,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;

    const above = new Event('dragover', { bubbles: true }) as DragEvent;
    Object.defineProperty(above, 'clientX', { value: 20 });
    Object.defineProperty(above, 'clientY', { value: 110 });
    Object.defineProperty(above, 'dataTransfer', {
      value: {
        types: [MORE_SERVER_DRAG_MIME],
        getData: (type: string) => (type === MORE_SERVER_DRAG_MIME ? 's1' : ''),
      },
    });
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(slot);

    expect(
      resolveMoreServerDropTargetFromPointer(above, {
        draggingServerId: 's1',
      }),
    ).toEqual({
      kind: 'folder',
      folderId: 'f-target',
      index: 1,
    });

    const below = new Event('dragover', { bubbles: true }) as DragEvent;
    Object.defineProperty(below, 'clientX', { value: 20 });
    Object.defineProperty(below, 'clientY', { value: 130 });
    Object.defineProperty(below, 'dataTransfer', {
      value: {
        types: [MORE_SERVER_DRAG_MIME],
        getData: (type: string) => (type === MORE_SERVER_DRAG_MIME ? 's1' : ''),
      },
    });

    expect(
      resolveMoreServerDropTargetFromPointer(below, {
        draggingServerId: 's1',
      }),
    ).toEqual({
      kind: 'folder',
      folderId: 'f-target',
      index: 2,
    });
  });

  it('resolveMoreServerDropTargetFromPointer maps folder reorder by midpoint', () => {
    document.body.innerHTML = `
      <div
        data-ms-drop="folder"
        data-ms-drop-folder="f-target"
        data-ms-drop-index="0"
        data-ms-folder-order-index="2"
        id="folder-card"
        style="position:fixed;left:0;top:0;width:80px;height:60px"
      ></div>
    `;
    const card = document.getElementById('folder-card')!;
    card.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 60,
        left: 0,
        right: 80,
        width: 80,
        height: 60,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const event = new Event('dragover', { bubbles: true }) as DragEvent;
    Object.defineProperty(event, 'clientX', { value: 40 });
    Object.defineProperty(event, 'clientY', { value: 45 });
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        types: [MORE_FOLDER_DRAG_MIME],
        getData: (type: string) =>
          type === MORE_FOLDER_DRAG_MIME ? 'f-drag' : '',
      },
    });
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(card);

    expect(
      resolveMoreServerDropTargetFromPointer(event, {
        draggingFolderId: 'f-drag',
      }),
    ).toEqual({
      kind: 'folder-order',
      index: 3,
    });
  });
});
