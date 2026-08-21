import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

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

export function paperBlockIdAtPos(
  doc: ProseMirrorNode,
  pos: number,
): string | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (!BLOCK_TYPES.has(node.type.name)) continue;
    const id = String(node.attrs.paperBlockId ?? '').trim();
    if (id) return id;
  }
  return null;
}

export function paperBlockIdsInRange(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): Set<string> {
  const ids = new Set<string>();
  doc.nodesBetween(from, to, (node) => {
    if (!BLOCK_TYPES.has(node.type.name)) return;
    const id = String(node.attrs.paperBlockId ?? '').trim();
    if (id) ids.add(id);
  });
  return ids;
}

export function blockRelativeSelection(
  doc: ProseMirrorNode,
  blockId: string,
  from: number,
  to: number,
): { anchor: number; head: number } | null {
  let blockStart = -1;
  doc.descendants((node, pos) => {
    if (blockStart >= 0) return false;
    if (!BLOCK_TYPES.has(node.type.name)) return;
    if (String(node.attrs.paperBlockId ?? '').trim() === blockId) {
      blockStart = pos;
      return false;
    }
  });
  if (blockStart < 0) return null;
  const blockNode = doc.nodeAt(blockStart);
  if (!blockNode) return null;
  const blockEnd = blockStart + blockNode.nodeSize;
  let textFrom = blockEnd;
  let textTo = blockStart;
  doc.nodesBetween(blockStart, blockEnd, (node, pos) => {
    if (!node.isText || !node.text?.length) return;
    textFrom = Math.min(textFrom, pos);
    textTo = Math.max(textTo, pos + node.text.length);
  });
  if (textFrom >= textTo) {
    textFrom = blockStart + 1;
    textTo = Math.max(blockStart + 1, blockEnd - 1);
  }
  const anchor = Math.max(0, Math.min(from, to) - textFrom);
  const head = Math.max(0, Math.max(from, to) - textFrom);
  return { anchor, head };
}
