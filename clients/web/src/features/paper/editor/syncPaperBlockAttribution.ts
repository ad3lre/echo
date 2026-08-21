import type { Editor } from '@tiptap/core';

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

type BlockAttribution = {
  authorId: string;
  lastEditedAt?: string;
  coAuthorIds?: string[];
};

function normalizeCoAuthorIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter(Boolean)
    .slice(0, 2);
  return ids.length >= 2 ? ids : undefined;
}

function coAuthorIdsEqual(a: unknown, b: string[] | undefined): boolean {
  const left = normalizeCoAuthorIds(a);
  if (!left && !b) return true;
  if (!left || !b || left.length !== b.length) return false;
  return left.every((id, i) => id === b[i]);
}

function walkTopLevelBlocks(
  doc: Record<string, unknown>,
): Record<string, unknown>[] {
  const content = doc.content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (node): node is Record<string, unknown> =>
      node !== null && typeof node === 'object' && !Array.isArray(node),
  );
}

function attributionByBlockId(
  docJson: Record<string, unknown>,
): Map<string, BlockAttribution> {
  const map = new Map<string, BlockAttribution>();
  for (const node of walkTopLevelBlocks(docJson)) {
    const type = String(node.type ?? '');
    if (!BLOCK_TYPES.has(type)) continue;
    const attrs =
      node.attrs && typeof node.attrs === 'object' && !Array.isArray(node.attrs)
        ? (node.attrs as Record<string, unknown>)
        : {};
    const paperBlockId = String(attrs.paperBlockId ?? '').trim();
    const authorId = String(attrs.authorId ?? '').trim();
    if (!paperBlockId || !authorId) continue;
    map.set(paperBlockId, {
      authorId,
      lastEditedAt:
        typeof attrs.lastEditedAt === 'string' ? attrs.lastEditedAt : undefined,
      coAuthorIds: normalizeCoAuthorIds(attrs.coAuthorIds),
    });
  }
  return map;
}

/** Merge server-stamped block attribution into the live editor without replacing the document. */
export function syncPaperBlockAttributionFromJson(
  editor: Editor,
  docJson: Record<string, unknown>,
): void {
  const remote = attributionByBlockId(docJson);
  if (remote.size === 0) return;

  let tr = editor.state.tr;
  let changed = false;
  editor.state.doc.descendants((node, pos) => {
    if (!BLOCK_TYPES.has(node.type.name)) return;
    const paperBlockId = String(node.attrs.paperBlockId ?? '').trim();
    if (!paperBlockId) return;
    const attrs = remote.get(paperBlockId);
    if (!attrs) return;
    if (
      node.attrs.authorId === attrs.authorId &&
      node.attrs.lastEditedAt === attrs.lastEditedAt &&
      coAuthorIdsEqual(node.attrs.coAuthorIds, attrs.coAuthorIds)
    ) {
      return;
    }
    const nextAttrs: Record<string, unknown> = {
      ...node.attrs,
      authorId: attrs.authorId,
      lastEditedAt: attrs.lastEditedAt ?? node.attrs.lastEditedAt,
    };
    if (attrs.coAuthorIds && attrs.coAuthorIds.length >= 2) {
      nextAttrs.coAuthorIds = attrs.coAuthorIds;
    } else {
      nextAttrs.coAuthorIds = null;
    }
    tr = tr.setNodeMarkup(pos, undefined, nextAttrs);
    changed = true;
  });
  if (changed) editor.view.dispatch(tr);
}
