import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { PaperRemoteCursor } from '@shared/types/paperCollab';

export type PaperRemoteCursorsOptions = {
  getCursors: () => PaperRemoteCursor[];
  localUserId: string;
  resolveBlockRange: (
    blockId: string,
  ) => { textFrom: number; textTo: number } | null;
};

export const PaperRemoteCursorsExtension =
  Extension.create<PaperRemoteCursorsOptions>({
    name: 'paperRemoteCursors',

    addOptions() {
      return {
        getCursors: () => [],
        localUserId: '',
        resolveBlockRange: () => null,
      };
    },

    addProseMirrorPlugins() {
      const opts = this.options;
      const key = new PluginKey('paperRemoteCursors');

      return [
        new Plugin({
          key,
          state: {
            init() {
              return DecorationSet.empty;
            },
            apply(tr, old) {
              return old.map(tr.mapping, tr.doc);
            },
          },
          props: {
            decorations(state) {
              const cursors = opts
                .getCursors()
                .filter((c) => c.userId !== opts.localUserId);
              if (cursors.length === 0) return DecorationSet.empty;

              const decos: Decoration[] = [];
              for (const c of cursors) {
                const range = opts.resolveBlockRange(c.blockId);
                if (!range) continue;
                const from = range.textFrom + Math.min(c.anchor, c.head);
                const to = range.textFrom + Math.max(c.anchor, c.head);
                const safeFrom = Math.max(
                  range.textFrom,
                  Math.min(from, range.textTo),
                );
                const safeTo = Math.max(
                  range.textFrom,
                  Math.min(to, range.textTo),
                );

                if (safeFrom < safeTo) {
                  decos.push(
                    Decoration.inline(safeFrom, safeTo, {
                      class: 'paper-remote-selection',
                      style: `background-color: ${c.color}33`,
                    }),
                  );
                }
                decos.push(
                  Decoration.widget(safeTo, () => {
                    const el = document.createElement('span');
                    el.className = 'paper-remote-cursor';
                    el.style.borderLeftColor = c.color;
                    el.setAttribute('data-name', c.displayName);
                    return el;
                  }),
                );
              }
              return DecorationSet.create(state.doc, decos);
            },
          },
        }),
      ];
    },
  });
