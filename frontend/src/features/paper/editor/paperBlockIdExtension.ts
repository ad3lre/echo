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
  'paperShape',
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
          authorId: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute('data-paper-author-id'),
            renderHTML: (attributes) => {
              const id = attributes.authorId;
              if (!id) return {};
              return { 'data-paper-author-id': id };
            },
          },
          lastEditedAt: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute('data-paper-last-edited-at'),
            renderHTML: (attributes) => {
              const at = attributes.lastEditedAt;
              if (!at) return {};
              return { 'data-paper-last-edited-at': at };
            },
          },
          coAuthorIds: {
            default: null,
            parseHTML: (element) => {
              const raw = element.getAttribute('data-paper-co-author-ids');
              if (!raw) return null;
              try {
                const parsed = JSON.parse(raw) as unknown;
                if (!Array.isArray(parsed)) return null;
                return parsed
                  .map((id) => (typeof id === 'string' ? id.trim() : ''))
                  .filter(Boolean)
                  .slice(0, 2);
              } catch {
                return raw
                  .split(',')
                  .map((id) => id.trim())
                  .filter(Boolean)
                  .slice(0, 2);
              }
            },
            renderHTML: (attributes) => {
              const ids = attributes.coAuthorIds;
              if (!Array.isArray(ids) || ids.length < 2) return {};
              return {
                'data-paper-co-author-ids': JSON.stringify(ids.slice(0, 2)),
              };
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
