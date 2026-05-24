import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

function newBlockId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `pb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'image',
  'table',
  'horizontalRule',
]);

export const PaperBlockIdExtension = Extension.create({
  name: 'paperBlockId',

  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_TYPES],
        attributes: {
          paperBlockId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-paper-block-id'),
            renderHTML: (attributes) => {
              const id = attributes.paperBlockId;
              if (!id) return {};
              return { 'data-paper-block-id': id };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('paperBlockId'),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          let tr = newState.tr;
          let changed = false;
          newState.doc.descendants((node, pos) => {
            if (!BLOCK_TYPES.has(node.type.name)) return;
            const id = node.attrs.paperBlockId;
            if (typeof id === 'string' && id.trim()) return;
            tr = tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              paperBlockId: newBlockId(),
            });
            changed = true;
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});
