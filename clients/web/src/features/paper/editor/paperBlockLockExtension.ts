import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import {
  paperBlockIdAtPos,
  paperBlockIdsInRange,
} from '@/features/paper/editor/paperBlockAtPos';

export type PaperBlockLockOptions = {
  userId: string;
  isCollabActive: () => boolean;
  isBlockLockedByOther: (blockId: string) => boolean;
  onActiveBlockChange: (
    blockId: string | null,
    prevBlockId: string | null,
  ) => void;
};

export const PaperBlockLockExtension = Extension.create<PaperBlockLockOptions>({
  name: 'paperBlockLock',

  addOptions() {
    return {
      userId: '',
      isCollabActive: () => false,
      isBlockLockedByOther: () => false,
      onActiveBlockChange: () => {},
    };
  },

  addProseMirrorPlugins() {
    const opts = this.options;
    const key = new PluginKey('paperBlockLock');
    let lastBlockId: string | null = null;

    return [
      new Plugin({
        key,
        filterTransaction: (tr, state) => {
          if (!tr.docChanged || !opts.isCollabActive()) return true;
          const from = tr.mapping.map(0, -1);
          const to = tr.doc.content.size;
          const ids = paperBlockIdsInRange(tr.doc, from, to);
          for (const id of ids) {
            if (opts.isBlockLockedByOther(id)) return false;
          }
          if (tr.steps.length > 0) {
            const oldIds = new Set<string>();
            tr.steps.forEach((step) => {
              step.getMap().forEach((oldStart, oldEnd) => {
                state.doc.nodesBetween(oldStart, oldEnd, (node) => {
                  const id = String(node.attrs.paperBlockId ?? '').trim();
                  if (id) oldIds.add(id);
                });
              });
            });
            for (const id of oldIds) {
              if (opts.isBlockLockedByOther(id)) return false;
            }
          }
          return true;
        },
        view() {
          return {
            update(view) {
              if (!opts.isCollabActive()) {
                if (lastBlockId !== null) {
                  opts.onActiveBlockChange(null, lastBlockId);
                  lastBlockId = null;
                }
                return;
              }
              const { from } = view.state.selection;
              const blockId = paperBlockIdAtPos(view.state.doc, from);
              if (blockId === lastBlockId) return;
              const prev = lastBlockId;
              lastBlockId = blockId;
              opts.onActiveBlockChange(blockId, prev);
            },
            destroy() {
              if (lastBlockId !== null) {
                opts.onActiveBlockChange(null, lastBlockId);
                lastBlockId = null;
              }
            },
          };
        },
        props: {
          attributes(state) {
            const attrs: Record<string, string> = {};
            if (!opts.isCollabActive()) return attrs;
            const { from } = state.selection;
            const blockId = paperBlockIdAtPos(state.doc, from);
            if (blockId && opts.isBlockLockedByOther(blockId)) {
              attrs.class = 'paper-block-locked-remote';
            }
            return attrs;
          },
        },
      }),
    ];
  },
});
