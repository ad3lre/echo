/**
 * Server-side paper document block attribution (authorId, paperBlockId, lastEditedAt).
 */
import { randomUUID } from 'node:crypto';

const BLOCK_NODE_TYPES = new Set([
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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function blockContentFingerprint(node: Record<string, unknown>): string {
  try {
    return JSON.stringify(node);
  } catch {
    return '';
  }
}

function walkTopLevelBlocks(
  doc: Record<string, unknown>,
): Record<string, unknown>[] {
  const content = doc.content;
  if (!Array.isArray(content)) return [];
  return content.filter(isPlainObject);
}

function stampBlock(
  node: Record<string, unknown>,
  userId: string,
  nowIso: string,
  preserveId: string | undefined,
): Record<string, unknown> {
  const attrs = isPlainObject(node.attrs)
    ? { ...node.attrs }
    : ({} as Record<string, unknown>);
  const paperBlockId =
    typeof preserveId === 'string' && preserveId.trim()
      ? preserveId.trim()
      : typeof attrs.paperBlockId === 'string' &&
          String(attrs.paperBlockId).trim()
        ? String(attrs.paperBlockId).trim()
        : randomUUID();
  return {
    ...node,
    attrs: {
      ...attrs,
      paperBlockId,
      authorId: userId,
      lastEditedAt: nowIso,
    },
  };
}

/**
 * Strip client-supplied attribution attrs before validation; server re-applies on save.
 */
export function stripPaperAttributionFromDoc(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...doc };
  const blocks = walkTopLevelBlocks(out);
  if (blocks.length === 0) return out;
  const nextBlocks = blocks.map((node) => {
    const type = String(node.type ?? '');
    if (!BLOCK_NODE_TYPES.has(type)) return node;
    const attrs = isPlainObject(node.attrs) ? { ...node.attrs } : {};
    delete attrs.authorId;
    delete attrs.lastEditedAt;
    const paperBlockId = attrs.paperBlockId;
    const nextAttrs: Record<string, unknown> = {};
    if (typeof paperBlockId === 'string' && paperBlockId.trim()) {
      nextAttrs.paperBlockId = paperBlockId.trim();
    }
    return Object.keys(nextAttrs).length
      ? { ...node, attrs: nextAttrs }
      : { ...node, ...(Object.keys(attrs).length ? { attrs: {} } : {}) };
  });
  return { ...out, content: nextBlocks };
}

/**
 * Apply server attribution after a successful content diff.
 */
export function applyPaperAttributionStamp(
  previousDoc: Record<string, unknown> | null,
  incomingDoc: Record<string, unknown>,
  userId: string,
): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const prevById = new Map<string, string>();
  if (previousDoc) {
    for (const node of walkTopLevelBlocks(previousDoc)) {
      const type = String(node.type ?? '');
      if (!BLOCK_NODE_TYPES.has(type)) continue;
      const attrs = isPlainObject(node.attrs) ? node.attrs : {};
      const id =
        typeof attrs.paperBlockId === 'string' ? attrs.paperBlockId.trim() : '';
      if (id) prevById.set(id, blockContentFingerprint(node));
    }
  }

  const incomingBlocks = walkTopLevelBlocks(incomingDoc);
  const stamped = incomingBlocks.map((node) => {
    const type = String(node.type ?? '');
    if (!BLOCK_NODE_TYPES.has(type)) return node;
    const attrs = isPlainObject(node.attrs) ? node.attrs : {};
    const existingId =
      typeof attrs.paperBlockId === 'string' ? attrs.paperBlockId.trim() : '';
    const fp = blockContentFingerprint(node);
    const unchanged =
      existingId && prevById.has(existingId) && prevById.get(existingId) === fp;
    if (unchanged) {
      const prevNode = walkTopLevelBlocks(previousDoc!).find((n) => {
        const a = isPlainObject(n.attrs) ? n.attrs : {};
        return String(a.paperBlockId ?? '').trim() === existingId;
      });
      if (prevNode && isPlainObject(prevNode.attrs)) {
        return {
          ...node,
          attrs: {
            ...(isPlainObject(node.attrs) ? node.attrs : {}),
            paperBlockId: existingId,
            authorId: prevNode.attrs.authorId,
            lastEditedAt: prevNode.attrs.lastEditedAt,
          },
        };
      }
    }
    return stampBlock(node, userId, nowIso, existingId || undefined);
  });

  return { ...incomingDoc, content: stamped };
}

import { createEmptyPaperContentJson } from '../../../shared/types/paperEmptyDocument';

export const EMPTY_PAPER_DOC: Record<string, unknown> =
  createEmptyPaperContentJson();
