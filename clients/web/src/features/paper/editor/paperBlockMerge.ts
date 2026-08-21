import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Node } from '@tiptap/pm/model';

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

export type BlockNode = {
  id: string;
  type: string;
  pos: number;
  nodeSize: number;
  toJSON: () => Record<string, unknown>;
};

/**
 * Extract all blocks with their IDs from a ProseMirror document.
 */
export function extractBlocks(doc: ProseMirrorNode): BlockNode[] {
  const blocks: BlockNode[] = [];
  doc.descendants((node, pos) => {
    if (!BLOCK_TYPES.has(node.type.name)) return;
    const id = String(node.attrs.paperBlockId ?? '').trim();
    if (!id) return;
    blocks.push({
      id,
      type: node.type.name,
      pos,
      nodeSize: node.nodeSize,
      toJSON: () => node.toJSON(),
    });
  });
  return blocks;
}

/**
 * Extract blocks from a JSON content object (server doc format).
 */
export function extractBlocksFromJson(
  contentJson: Record<string, unknown>,
): Array<{ id: string; type: string; json: Record<string, unknown> }> {
  const content = contentJson.content as Record<string, unknown>[] | undefined;
  if (!Array.isArray(content)) return [];

  const blocks: Array<{
    id: string;
    type: string;
    json: Record<string, unknown>;
  }> = [];

  function walk(nodes: Record<string, unknown>[]) {
    for (const node of nodes) {
      const type = String(node.type ?? '');
      if (BLOCK_TYPES.has(type)) {
        const attrs = (node.attrs ?? {}) as Record<string, unknown>;
        const id = String(attrs.paperBlockId ?? '').trim();
        if (id) {
          blocks.push({ id, type, json: node });
        }
      }
      const childContent = node.content as
        | Record<string, unknown>[]
        | undefined;
      if (Array.isArray(childContent)) {
        walk(childContent);
      }
    }
  }

  walk(content);
  return blocks;
}

/**
 * Find which blocks differ between local and remote documents.
 */
export function findChangedBlocks(
  localDoc: Record<string, unknown>,
  remoteDoc: Record<string, unknown>,
): Set<string> {
  const localBlocks = new Map(
    extractBlocksFromJson(localDoc).map((b) => [b.id, JSON.stringify(b.json)]),
  );
  const remoteBlocks = new Map(
    extractBlocksFromJson(remoteDoc).map((b) => [b.id, JSON.stringify(b.json)]),
  );

  const changed = new Set<string>();

  // Check for changed or added blocks
  for (const [id, remoteJson] of remoteBlocks) {
    const localJson = localBlocks.get(id);
    if (localJson !== remoteJson) {
      changed.add(id);
    }
  }

  // Check for deleted blocks
  for (const id of localBlocks.keys()) {
    if (!remoteBlocks.has(id)) {
      changed.add(id);
    }
  }

  return changed;
}

/**
 * Check if any of the given block IDs are currently held/locked by the user.
 */
export function hasHeldBlocks(
  changedBlockIds: Set<string>,
  heldBlockId: string | null,
): boolean {
  if (!heldBlockId) return false;
  return changedBlockIds.has(heldBlockId);
}

/**
 * Options for selective block merge.
 */
export type BlockMergeResult =
  | { type: 'full'; remoteJson: Record<string, unknown> }
  | {
      type: 'partial';
      remoteJson: Record<string, unknown>;
      heldBlockIds: string[];
    }
  | { type: 'blocked'; heldBlockIds: string[] };

/**
 * Determine how to merge a remote document with local changes.
 *
 * - If user is not editing any changed blocks: allow full update
 * - If user is editing some changed blocks: allow partial update (skip those blocks)
 * - If structural changes (deletes/adds affect held blocks): block update
 */
export function computeBlockMerge(
  localJson: Record<string, unknown>,
  remoteJson: Record<string, unknown>,
  heldBlockId: string | null,
): BlockMergeResult {
  const changedBlocks = findChangedBlocks(localJson, remoteJson);

  if (changedBlocks.size === 0) {
    // No actual changes
    return { type: 'full', remoteJson };
  }

  const heldChanged = heldBlockId && changedBlocks.has(heldBlockId);

  if (!heldChanged) {
    // Safe to apply full update
    return { type: 'full', remoteJson };
  }

  // User is holding a changed block - need partial merge
  // For now, report as blocked (we'll implement true partial merge later)
  return {
    type: 'blocked',
    heldBlockIds: heldBlockId ? [heldBlockId] : [],
  };
}
