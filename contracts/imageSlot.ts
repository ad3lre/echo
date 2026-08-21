/**
 * Image slot blocks and aspect-ratio policy for chat `imageSlot` nodes.
 * Plain tokens use the universal rich-block grammar (`![image: …]`).
 * @see docs/contracts/ECHO_CONTRACT_V2.md
 */

import {
  findAllRichBlockTokens,
  formatRichBlockToken,
  parseRichBlockToken,
  RICH_BLOCK_TYPES,
} from './richBlockToken';

export const IMAGE_SLOT_ASPECT_RATIOS: ReadonlyArray<{
  w: number;
  h: number;
}> = [
  { w: 16, h: 9 },
  { w: 4, h: 3 },
  { w: 1, h: 1 },
  { w: 21, h: 9 },
  { w: 3, h: 2 },
  { w: 2, h: 3 },
];

export type ImageSlotAttrs = {
  slotId: string;
  aspectW: number;
  aspectH: number;
  imageUrl?: string | null;
  storageKey?: string | null;
  width?: number | null;
  height?: number | null;
};

export type ParsedImageSlotToken = {
  aspectW: number;
  aspectH: number;
  slotId: string;
  start: number;
  end: number;
};

const SLOT_ID_MAX = 64;
const IMAGE_BLOCK_TYPE = RICH_BLOCK_TYPES.image;

function parseRatioAttr(
  raw: string | undefined,
): { w: number; h: number } | null {
  if (!raw?.trim()) return null;
  const m = /^(\d+):(\d+)$/.exec(raw.trim());
  if (!m) return null;
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  if (!isAllowedImageSlotAspect(w, h)) return null;
  return { w, h };
}

function readSlotId(attrs: Record<string, string>): string | null {
  const id =
    attrs.slotId ??
    Object.entries(attrs).find(([k]) => k.toLowerCase() === 'slotid')?.[1] ??
    '';
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > SLOT_ID_MAX) return null;
  return trimmed;
}

export function isAllowedImageSlotAspect(w: number, h: number): boolean {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return false;
  }
  return IMAGE_SLOT_ASPECT_RATIOS.some((r) => r.w === w && r.h === h);
}

/**
 * Editable composer shortcut (no `slotId`) — what authors type and see in the composer.
 * Persisted plain projection still uses `formatImageSlotToken` (`slotId` included).
 */
export function formatImageSlotComposerShortcut(
  aspectW: number,
  aspectH: number,
): string {
  const w = Math.floor(aspectW);
  const h = Math.floor(aspectH);
  return formatRichBlockToken(IMAGE_BLOCK_TYPE, { ratio: `${w}:${h}` });
}

/** Canonical plain projection: `![image: ratio=W:H, slotId=…]`. */
export function formatImageSlotToken(attrs: ImageSlotAttrs): string {
  const w = Math.floor(attrs.aspectW);
  const h = Math.floor(attrs.aspectH);
  const id = String(attrs.slotId ?? '').trim();
  const tokenAttrs: Record<string, string> = { ratio: `${w}:${h}` };
  if (id) tokenAttrs.slotId = id;
  return formatRichBlockToken(IMAGE_BLOCK_TYPE, tokenAttrs);
}

export function parseImageSlotToken(
  raw: string,
): Omit<ParsedImageSlotToken, 'start' | 'end'> | null {
  const block = parseRichBlockToken(raw.trim());
  if (!block || block.type !== IMAGE_BLOCK_TYPE) return null;
  const ratio = parseRatioAttr(block.attrs.ratio);
  if (!ratio) return null;
  const slotId = readSlotId(block.attrs);
  if (!slotId) return null;
  return { aspectW: ratio.w, aspectH: ratio.h, slotId };
}

/** Find all image block tokens in a plain string (with offsets). */
export function findAllImageSlotTokens(plain: string): ParsedImageSlotToken[] {
  const out: ParsedImageSlotToken[] = [];
  if (!plain) return out;
  for (const block of findAllRichBlockTokens(plain, IMAGE_BLOCK_TYPE)) {
    const ratio = parseRatioAttr(block.attrs.ratio);
    if (!ratio) continue;
    const slotId = readSlotId(block.attrs);
    if (!slotId) continue;
    out.push({
      aspectW: ratio.w,
      aspectH: ratio.h,
      slotId,
      start: block.start,
      end: block.end,
    });
  }
  return out;
}

/** Parse composer shortcut without `slotId` — `![image: ratio=16:9]`. */
export function parseImageSlotShortcut(
  raw: string,
): { aspectW: number; aspectH: number } | null {
  const block = parseRichBlockToken(raw.trim());
  if (!block || block.type !== IMAGE_BLOCK_TYPE) return null;
  if (readSlotId(block.attrs)) return null;
  const ratio = parseRatioAttr(block.attrs.ratio);
  if (!ratio) return null;
  return { aspectW: ratio.w, aspectH: ratio.h };
}

export function randomImageSlotId(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isImageSlotFilled(attrs: ImageSlotAttrs): boolean {
  const u = attrs.imageUrl;
  return typeof u === 'string' && u.trim().length > 0;
}
