import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

const ANCHOR_BLOCK_TYPES = new Set([
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

export type PaperSelectionAnchor = {
  anchorBlockId: string;
  anchorFrom: number | null;
  anchorTo: number | null;
  anchorQuote: string;
};

type AnchorBlock = {
  paperBlockId: string;
  start: number;
  end: number;
};

function blockTextBounds(
  doc: ProseMirrorNode,
  blockStart: number,
  blockEnd: number,
): { from: number; to: number } {
  let from = blockEnd;
  let to = blockStart;
  doc.nodesBetween(blockStart, blockEnd, (node, pos) => {
    if (!node.isText || !node.text?.length) return;
    from = Math.min(from, pos);
    to = Math.max(to, pos + node.text.length);
  });
  if (from >= to) {
    return {
      from: blockStart + 1,
      to: Math.max(blockStart + 1, blockEnd - 1),
    };
  }
  return { from, to };
}

function findAnchorBlockAtPos(
  doc: ProseMirrorNode,
  pos: number,
): AnchorBlock | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (!ANCHOR_BLOCK_TYPES.has(node.type.name)) continue;
    const paperBlockId = String(node.attrs.paperBlockId ?? '').trim();
    if (!paperBlockId) continue;
    return {
      paperBlockId,
      start: $pos.start(depth),
      end: $pos.end(depth),
    };
  }
  return null;
}

/** Map the current selection to a paper comment anchor (block-local positions). */
export function getPaperSelectionAnchor(
  editor: Editor,
): PaperSelectionAnchor | null {
  const { from, to } = editor.state.selection;
  const block =
    findAnchorBlockAtPos(editor.state.doc, from) ??
    findAnchorBlockAtPos(editor.state.doc, to);
  if (!block) return null;

  const textBounds = blockTextBounds(editor.state.doc, block.start, block.end);
  const hasRange = from < to;
  const selFrom = hasRange ? Math.max(from, textBounds.from) : textBounds.from;
  const selTo = hasRange
    ? Math.min(to, textBounds.to)
    : Math.min(textBounds.to, textBounds.from + 200);
  const anchorFrom = hasRange ? Math.max(0, selFrom - textBounds.from) : null;
  const anchorTo = hasRange ? Math.max(0, selTo - textBounds.from) : null;
  const quoteFrom = hasRange ? selFrom : textBounds.from;
  const quoteTo = hasRange ? selTo : selTo;

  return {
    anchorBlockId: block.paperBlockId,
    anchorFrom,
    anchorTo,
    anchorQuote: editor.state.doc.textBetween(quoteFrom, quoteTo, ' ').trim(),
  };
}
