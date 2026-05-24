import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const paperBlockHighlightKey = new PluginKey('paperBlockHighlight');

type HighlightMeta = { flashBlockId: string; until: number };

export function flashPaperBlockHighlight(
  editor: Editor,
  paperBlockId: string,
  durationMs = 1600,
) {
  const id = paperBlockId.trim();
  if (!id) return;
  const tr = editor.state.tr.setMeta(paperBlockHighlightKey, {
    flashBlockId: id,
    until: Date.now() + durationMs,
  } satisfies HighlightMeta);
  editor.view.dispatch(tr);
}

export const PaperBlockHighlight = Extension.create({
  name: 'paperBlockHighlight',

  addProseMirrorPlugins() {
    let flashId = '';
    let until = 0;

    return [
      new Plugin({
        key: paperBlockHighlightKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, _oldSet, _oldState, newState) {
            const meta = tr.getMeta(paperBlockHighlightKey) as
              | HighlightMeta
              | undefined;
            if (meta?.flashBlockId) {
              flashId = meta.flashBlockId;
              until = meta.until;
            }
            if (!flashId || Date.now() > until) {
              flashId = '';
              return DecorationSet.empty;
            }
            const decos: Decoration[] = [];
            newState.doc.descendants((node, pos) => {
              if (String(node.attrs.paperBlockId ?? '').trim() !== flashId) {
                return;
              }
              decos.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: 'paper-block-flash',
                }),
              );
            });
            return DecorationSet.create(newState.doc, decos);
          },
        },
        props: {
          decorations(state) {
            return paperBlockHighlightKey.getState(state) as DecorationSet;
          },
        },
      }),
    ];
  },
});
