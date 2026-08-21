import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const paperBlockHighlightKey = new PluginKey('paperBlockHighlight');

type HighlightMeta = {
  flashBlockId?: string;
  until?: number;
  selectedBlockIds?: string[];
};

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

export function setPaperAuthorSegmentHighlight(
  editor: Editor,
  paperBlockIds: readonly string[],
) {
  const ids = paperBlockIds.map((id) => id.trim()).filter(Boolean);
  const tr = editor.state.tr.setMeta(paperBlockHighlightKey, {
    selectedBlockIds: ids,
  } satisfies HighlightMeta);
  editor.view.dispatch(tr);
}

export function clearPaperAuthorSegmentHighlight(editor: Editor) {
  const tr = editor.state.tr.setMeta(paperBlockHighlightKey, {
    selectedBlockIds: [],
  } satisfies HighlightMeta);
  editor.view.dispatch(tr);
}

export const PaperBlockHighlight = Extension.create({
  name: 'paperBlockHighlight',

  addProseMirrorPlugins() {
    let flashId = '';
    let until = 0;
    let selectedIds = new Set<string>();

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
            if (meta?.selectedBlockIds !== undefined) {
              selectedIds = new Set(meta.selectedBlockIds);
            }
            if (meta?.flashBlockId) {
              flashId = meta.flashBlockId;
              until = meta.until ?? Date.now() + 1600;
            }
            const decos: Decoration[] = [];
            const flashActive = flashId && Date.now() <= until;
            if (!flashActive) {
              flashId = '';
            }
            newState.doc.descendants((node, pos) => {
              const blockId = String(node.attrs.paperBlockId ?? '').trim();
              if (!blockId) return;
              if (selectedIds.has(blockId)) {
                decos.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: 'paper-block-author-selected',
                  }),
                );
                return;
              }
              if (flashActive && blockId === flashId) {
                decos.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: 'paper-block-flash',
                  }),
                );
              }
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
