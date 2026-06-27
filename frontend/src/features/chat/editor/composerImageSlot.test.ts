/* @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from 'vitest';
import { Editor, type Extensions } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import {
  buildComposerDocFromPlain,
  ImageSlotNode,
  insertImageSlotInEditor,
  resolveComposerImageSlotTarget,
  serializeComposerDoc,
  updateImageSlotInEditor,
} from '@/features/chat/editor/composerModel';

function makeEditor() {
  return new Editor({
    extensions: [Document, Paragraph, Text, ImageSlotNode] satisfies Extensions,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  });
}

describe('composer imageSlot node', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('renders data-slot-id on DOM for click-to-upload', () => {
    editor = makeEditor();
    insertImageSlotInEditor(editor, 16, 9);
    const slot = editor.getJSON().content?.find((n) => n.type === 'imageSlot');
    expect(slot?.attrs?.slotId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    const html = editor.getHTML();
    expect(html).toContain(`data-slot-id="${slot?.attrs?.slotId}"`);
    expect(html).toContain('data-rich-block="image"');
  });

  it('patches imageUrl in place by slotId', () => {
    editor = makeEditor();
    insertImageSlotInEditor(editor, 16, 9);
    const slotId = String(
      editor.getJSON().content?.find((n) => n.type === 'imageSlot')?.attrs
        ?.slotId ?? '',
    );
    const ok = updateImageSlotInEditor(editor, slotId, {
      imageUrl: 'https://cdn.example.com/a.png',
      storageKey: 'sk-1',
      width: 800,
      height: 450,
    });
    expect(ok).toBe(true);
    const patched = editor
      .getJSON()
      .content?.find((n) => n.type === 'imageSlot');
    expect(patched?.attrs?.imageUrl).toBe('https://cdn.example.com/a.png');
    expect(editor.getHTML()).toContain('data-image-filled="true"');
  });

  it('keeps slotId stable across plain-text rebuild so upload patch still works', () => {
    editor = makeEditor();
    insertImageSlotInEditor(editor, 16, 9);
    const beforeId = String(
      editor.getJSON().content?.find((n) => n.type === 'imageSlot')?.attrs
        ?.slotId ?? '',
    );
    const priorDoc = editor.getJSON();
    const { content } = serializeComposerDoc(editor.state.doc);
    const rebuilt = buildComposerDocFromPlain(content, [], undefined, priorDoc);
    editor.commands.setContent(rebuilt, { emitUpdate: false });
    const afterId = String(
      editor.getJSON().content?.find((n) => n.type === 'imageSlot')?.attrs
        ?.slotId ?? '',
    );
    expect(afterId).toBe(beforeId);
    expect(
      updateImageSlotInEditor(editor, beforeId, {
        imageUrl: 'https://cdn.example.com/b.png',
      }),
    ).toBe(true);
  });

  it('resolves slot target from editor doc for pointer handling', () => {
    editor = makeEditor();
    insertImageSlotInEditor(editor, 4, 3);
    const slotId = String(
      editor.getJSON().content?.find((n) => n.type === 'imageSlot')?.attrs
        ?.slotId ?? '',
    );
    const el = editor.view.dom.querySelector(
      '[data-rich-block="image"]',
    ) as HTMLElement | null;
    expect(el).toBeTruthy();
    const target = resolveComposerImageSlotTarget(editor, {
      target: el,
      button: 0,
    } as MouseEvent);
    expect(target).toEqual(
      expect.objectContaining({
        slotId,
      }),
    );
  });
});
