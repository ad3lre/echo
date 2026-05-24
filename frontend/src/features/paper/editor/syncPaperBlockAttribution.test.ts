import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { PaperBlockIdExtension } from '@/features/paper/editor/paperBlockIdExtension';
import { syncPaperBlockAttributionFromJson } from '@/features/paper/editor/syncPaperBlockAttribution';

function testEditor(content?: Record<string, unknown>) {
  return new Editor({
    extensions: [Document, Paragraph, Text, PaperBlockIdExtension],
    content: content ?? {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { paperBlockId: 'block-1' },
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    },
  });
}

describe('syncPaperBlockAttributionFromJson', () => {
  it('preserves authorId from server JSON in the editor schema', () => {
    const editor = testEditor();
    syncPaperBlockAttributionFromJson(editor, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            paperBlockId: 'block-1',
            authorId: 'user-abc',
            lastEditedAt: '2026-05-24T12:00:00.000Z',
          },
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    });

    let authorId: string | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name !== 'paragraph') return;
      authorId = String(node.attrs.authorId ?? '');
    });
    expect(authorId).toBe('user-abc');
    editor.destroy();
  });

  it('keeps authorId when loading JSON via setContent', () => {
    const editor = testEditor();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            paperBlockId: 'block-2',
            authorId: 'user-xyz',
            lastEditedAt: '2026-05-24T12:00:00.000Z',
          },
          content: [{ type: 'text', text: 'Loaded' }],
        },
      ],
    });

    let authorId: string | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name !== 'paragraph') return;
      authorId = String(node.attrs.authorId ?? '');
    });
    expect(authorId).toBe('user-xyz');
    editor.destroy();
  });
});
