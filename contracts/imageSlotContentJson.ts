/**
 * Walk / patch `imageSlot` nodes in Echo chat TipTap JSON.
 */
import {
  isImageSlotFilled,
  randomImageSlotId,
  type ImageSlotAttrs,
} from './imageSlot';

export type ImageSlotWalkEntry = ImageSlotAttrs & { blockIndex: number };

export type ImageSlotFillPatch = {
  imageUrl: string;
  storageKey?: string;
  width?: number;
  height?: number;
};

export type ImageSlotPatchError =
  | 'slot_not_found'
  | 'slot_already_filled'
  | 'invalid_doc';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function readSlotAttrs(attrs: unknown): ImageSlotAttrs | null {
  if (!isPlainObject(attrs)) return null;
  const slotId = typeof attrs.slotId === 'string' ? attrs.slotId.trim() : '';
  const aspectW =
    typeof attrs.aspectW === 'number' && Number.isFinite(attrs.aspectW)
      ? Math.floor(attrs.aspectW)
      : 0;
  const aspectH =
    typeof attrs.aspectH === 'number' && Number.isFinite(attrs.aspectH)
      ? Math.floor(attrs.aspectH)
      : 0;
  if (!slotId || aspectW <= 0 || aspectH <= 0) return null;
  const imageUrl =
    attrs.imageUrl === null || attrs.imageUrl === undefined
      ? null
      : typeof attrs.imageUrl === 'string'
        ? attrs.imageUrl
        : null;
  const storageKey =
    attrs.storageKey === null || attrs.storageKey === undefined
      ? null
      : typeof attrs.storageKey === 'string'
        ? attrs.storageKey
        : null;
  const width =
    typeof attrs.width === 'number' && Number.isFinite(attrs.width)
      ? attrs.width
      : null;
  const height =
    typeof attrs.height === 'number' && Number.isFinite(attrs.height)
      ? attrs.height
      : null;
  return {
    slotId,
    aspectW,
    aspectH,
    imageUrl,
    storageKey,
    width,
    height,
  };
}

export function imageSlotNodeFromAttrs(
  attrs: ImageSlotAttrs,
): Record<string, unknown> {
  return {
    type: 'imageSlot',
    attrs: {
      slotId: attrs.slotId,
      aspectW: attrs.aspectW,
      aspectH: attrs.aspectH,
      imageUrl: attrs.imageUrl ?? null,
      storageKey: attrs.storageKey ?? null,
      width: attrs.width ?? null,
      height: attrs.height ?? null,
    },
  };
}

/** Ordered top-level `imageSlot` blocks in a doc. */
export function walkImageSlots(doc: unknown): ImageSlotWalkEntry[] {
  if (!isPlainObject(doc) || doc.type !== 'doc') return [];
  const content = doc.content;
  if (!Array.isArray(content)) return [];
  const out: ImageSlotWalkEntry[] = [];
  for (let i = 0; i < content.length; i++) {
    const node = content[i];
    if (!isPlainObject(node) || node.type !== 'imageSlot') continue;
    const attrs = readSlotAttrs(node.attrs);
    if (!attrs) continue;
    out.push({ ...attrs, blockIndex: i });
  }
  return out;
}

export function countImageSlots(doc: unknown): number {
  return walkImageSlots(doc).length;
}

export function docContainsImageSlots(doc: unknown): boolean {
  return countImageSlots(doc) > 0;
}

export function filledImageSlotAttrsById(
  doc: unknown,
): Map<string, ImageSlotAttrs> {
  const map = new Map<string, ImageSlotAttrs>();
  for (const slot of walkImageSlots(doc)) {
    if (isImageSlotFilled(slot)) {
      map.set(slot.slotId, {
        slotId: slot.slotId,
        aspectW: slot.aspectW,
        aspectH: slot.aspectH,
        imageUrl: slot.imageUrl,
        storageKey: slot.storageKey,
        width: slot.width,
        height: slot.height,
      });
    }
  }
  return map;
}

export function patchImageSlotFill(
  doc: unknown,
  slotId: string,
  patch: ImageSlotFillPatch,
):
  | { ok: true; doc: Record<string, unknown> }
  | { ok: false; error: ImageSlotPatchError } {
  if (!isPlainObject(doc) || doc.type !== 'doc') {
    return { ok: false, error: 'invalid_doc' };
  }
  const content = doc.content;
  if (!Array.isArray(content)) {
    return { ok: false, error: 'invalid_doc' };
  }
  const targetId = slotId.trim();
  if (!targetId) return { ok: false, error: 'slot_not_found' };

  const prior = walkImageSlots(doc).find((s) => s.slotId === targetId);
  if (!prior) return { ok: false, error: 'slot_not_found' };
  if (isImageSlotFilled(prior)) {
    return { ok: false, error: 'slot_already_filled' };
  }

  const nextContent = content.map((node) => {
    if (!isPlainObject(node) || node.type !== 'imageSlot') return node;
    const attrs = readSlotAttrs(node.attrs);
    if (!attrs || attrs.slotId !== targetId) return node;
    return imageSlotNodeFromAttrs({
      slotId: attrs.slotId,
      aspectW: attrs.aspectW,
      aspectH: attrs.aspectH,
      imageUrl: patch.imageUrl,
      storageKey: patch.storageKey ?? null,
      width: patch.width ?? null,
      height: patch.height ?? null,
    });
  });

  return { ok: true, doc: { type: 'doc', content: nextContent } };
}

/** Build a new empty slot node for composer insert. */
export function createEmptyImageSlotNode(
  aspectW: number,
  aspectH: number,
  slotId?: string,
): Record<string, unknown> {
  return imageSlotNodeFromAttrs({
    slotId: slotId ?? randomImageSlotId(),
    aspectW,
    aspectH,
    imageUrl: null,
    storageKey: null,
    width: null,
    height: null,
  });
}

export type ImageSlotSegment = {
  type: 'imageSlot';
  slotId: string;
  aspectW: number;
  aspectH: number;
  imageUrl?: string | null;
  storageKey?: string | null;
  width?: number | null;
  height?: number | null;
};
