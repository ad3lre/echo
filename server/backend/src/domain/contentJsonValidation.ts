/**
 * Validates TipTap/ProseMirror JSON for message writes (allowlist nodes).
 * @see docs/contracts/ECHO_CONTRACT_V2.md
 */
import {
  MAX_CONTENT_JSON_BYTES,
  MESSAGE_FORMAT_VERSION_JSON,
  MESSAGE_FORMAT_VERSION_LEGACY,
} from '../../../../contracts/echoMessageFormatV2';
import { docContainsImageSlots } from '../../../../contracts/imageSlotContentJson';
import {
  docContainsButtonRows,
  deriveMessageComponentsFromContentJson,
} from '../../../../contracts/buttonRowContentJson';
import {
  isAllowedImageSlotAspect,
  isImageSlotFilled,
  type ImageSlotAttrs,
} from '../../../../contracts/imageSlot';
import {
  BUTTON_ROW_LIMITS,
  isValidButtonRowButton,
  normalizeButtonRowButtons,
  type ButtonRowButton,
} from '../../../../contracts/buttonRow';
import { PAPER_CONTENT_JSON_NODE_TYPES } from '../../../../contracts/paperContentJson';
import { mediaUrlPassesEchoPolicy } from '../services/uploads/mediaUrlPolicy';

const ALLOWED_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'hardBreak',
  'mentionEntity',
  'channelMention',
  'customEmoji',
  'appIcon',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'heading',
  'imageSlot',
  'buttonRow',
]);

const IMAGE_SLOT_ID_MAX = 64;
const IMAGE_SLOT_DIM_MAX = 8192;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Walk all nodes; returns error string or undefined if ok.
 */
function validateNode(node: unknown, depth: number): string | undefined {
  if (depth > 80) return 'content_json nested too deep';
  if (!isPlainObject(node)) return 'content_json invalid node';
  const type = node.type;
  if (typeof type !== 'string' || !ALLOWED_TYPES.has(type)) {
    return `content_json disallowed or unknown node type: ${String(type)}`;
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content))
      return 'content_json invalid content array';
    for (const ch of node.content) {
      const err = validateNode(ch, depth + 1);
      if (err) return err;
    }
  }
  if (node.type === 'text') {
    if (node.text !== undefined && typeof node.text !== 'string')
      return 'content_json text node invalid';
  }
  if (node.type === 'imageSlot') {
    const err = validateImageSlotAttrs(node.attrs);
    if (err) return err;
  }
  if (node.type === 'buttonRow') {
    const err = validateButtonRowAttrs(node.attrs);
    if (err) return err;
  }
  return undefined;
}

function readButtonRowButtons(attrs: unknown): ButtonRowButton[] | null {
  if (!isPlainObject(attrs)) return null;
  const rowId = typeof attrs.rowId === 'string' ? attrs.rowId.trim() : '';
  if (!rowId || rowId.length > BUTTON_ROW_LIMITS.rowIdMax) return null;
  if (!Array.isArray(attrs.buttons)) return null;
  const buttons = normalizeButtonRowButtons(attrs.buttons as ButtonRowButton[]);
  if (!buttons.length) return null;
  return buttons;
}

function validateButtonRowAttrs(attrs: unknown): string | undefined {
  const buttons = readButtonRowButtons(attrs);
  if (!buttons?.length) return 'content_json buttonRow invalid attrs';
  for (const btn of buttons) {
    if (!isValidButtonRowButton(btn)) {
      return 'content_json buttonRow invalid button';
    }
    if (btn.style === 5 && btn.url && !/^https?:\/\//i.test(btn.url.trim())) {
      return 'content_json buttonRow invalid button url';
    }
  }
  return undefined;
}

function readImageSlotAttrs(attrs: unknown): ImageSlotAttrs | null {
  if (!isPlainObject(attrs)) return null;
  const slotId = typeof attrs.slotId === 'string' ? attrs.slotId.trim() : '';
  if (!slotId || slotId.length > IMAGE_SLOT_ID_MAX) return null;
  const aspectW =
    typeof attrs.aspectW === 'number' && Number.isFinite(attrs.aspectW)
      ? Math.floor(attrs.aspectW)
      : 0;
  const aspectH =
    typeof attrs.aspectH === 'number' && Number.isFinite(attrs.aspectH)
      ? Math.floor(attrs.aspectH)
      : 0;
  if (!isAllowedImageSlotAspect(aspectW, aspectH)) return null;
  const imageUrl =
    attrs.imageUrl === null || attrs.imageUrl === undefined
      ? null
      : typeof attrs.imageUrl === 'string'
        ? attrs.imageUrl.trim()
        : null;
  const storageKey =
    attrs.storageKey === null || attrs.storageKey === undefined
      ? null
      : typeof attrs.storageKey === 'string'
        ? attrs.storageKey.trim()
        : null;
  const width =
    typeof attrs.width === 'number' && Number.isFinite(attrs.width)
      ? Math.floor(attrs.width)
      : null;
  const height =
    typeof attrs.height === 'number' && Number.isFinite(attrs.height)
      ? Math.floor(attrs.height)
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

function validateImageSlotAttrs(attrs: unknown): string | undefined {
  const parsed = readImageSlotAttrs(attrs);
  if (!parsed) return 'content_json imageSlot invalid attrs';
  if (
    parsed.width != null &&
    (parsed.width <= 0 || parsed.width > IMAGE_SLOT_DIM_MAX)
  ) {
    return 'content_json imageSlot invalid width';
  }
  if (
    parsed.height != null &&
    (parsed.height <= 0 || parsed.height > IMAGE_SLOT_DIM_MAX)
  ) {
    return 'content_json imageSlot invalid height';
  }
  if (isImageSlotFilled(parsed)) {
    const url = String(parsed.imageUrl ?? '').trim();
    if (!/^https?:\/\//i.test(url) || !mediaUrlPassesEchoPolicy(url)) {
      return 'content_json imageSlot invalid imageUrl';
    }
    if (parsed.storageKey != null && parsed.storageKey.length > 512) {
      return 'content_json imageSlot invalid storageKey';
    }
  } else if (parsed.imageUrl != null && parsed.imageUrl.length > 0) {
    return 'content_json imageSlot empty slot must not have imageUrl';
  }
  return undefined;
}

function countTopLevelButtonRows(doc: Record<string, unknown>): number {
  const content = doc.content;
  if (!Array.isArray(content)) return 0;
  return content.filter(
    (node) =>
      isPlainObject(node) &&
      node.type === 'buttonRow' &&
      readButtonRowButtons(node.attrs) != null,
  ).length;
}

/** Reject schema v1 payloads that contain rich block nodes. */
export function validateContentJsonSchemaVersionForDoc(
  doc: unknown,
  contentSchemaVersion: number,
): string | undefined {
  if (contentSchemaVersion >= 2) return undefined;
  if (docContainsImageSlots(doc)) {
    return 'content_json imageSlot requires content_schema_version >= 2';
  }
  if (docContainsButtonRows(doc)) {
    return 'content_json buttonRow requires content_schema_version >= 2';
  }
  return undefined;
}

export type ValidatedContentJson = Record<string, unknown>;

export function validateContentJsonForWrite(raw: unknown):
  | {
      ok: true;
      doc: ValidatedContentJson;
      serializedUtf8Bytes: number;
    }
  | {
      ok: false;
      error: string;
    } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'content_json must be an object' };
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    return { ok: false, error: 'content_json is not JSON-serializable' };
  }
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_CONTENT_JSON_BYTES) {
    return { ok: false, error: 'content_json too large' };
  }
  const doc = raw as Record<string, unknown>;
  if (doc.type !== 'doc') {
    return { ok: false, error: 'content_json root must be type doc' };
  }
  const err = validateNode(doc, 0);
  if (err) return { ok: false, error: err };
  const buttonRowCount = countTopLevelButtonRows(doc);
  if (buttonRowCount > BUTTON_ROW_LIMITS.maxRowsPerMessage) {
    return {
      ok: false,
      error: `content_json exceeds max buttonRow blocks (${BUTTON_ROW_LIMITS.maxRowsPerMessage})`,
    };
  }
  return { ok: true, doc, serializedUtf8Bytes: bytes };
}

const PAPER_ALLOWED_TYPES = new Set<string>(PAPER_CONTENT_JSON_NODE_TYPES);

function validatePaperNode(node: unknown, depth: number): string | undefined {
  if (depth > 80) return 'content_json nested too deep';
  if (!isPlainObject(node)) return 'content_json invalid node';
  const type = node.type;
  if (typeof type !== 'string' || !PAPER_ALLOWED_TYPES.has(type)) {
    return `content_json disallowed or unknown node type: ${String(type)}`;
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content))
      return 'content_json invalid content array';
    for (const ch of node.content) {
      const err = validatePaperNode(ch, depth + 1);
      if (err) return err;
    }
  }
  if (node.type === 'text') {
    if (node.text !== undefined && typeof node.text !== 'string')
      return 'content_json text node invalid';
  }
  if (node.type === 'image') {
    const src = isPlainObject(node.attrs) ? node.attrs.src : undefined;
    if (typeof src !== 'string' || !src.trim()) {
      return 'content_json image requires src';
    }
  }
  if (node.type === 'paperShape') {
    const attrs = isPlainObject(node.attrs) ? node.attrs : {};
    const shape = attrs.shape;
    if (
      shape !== undefined &&
      shape !== 'rectangle' &&
      shape !== 'circle' &&
      shape !== 'triangle' &&
      shape !== 'line'
    ) {
      return 'content_json paperShape invalid shape';
    }
    const fill = attrs.fill;
    if (fill !== undefined && typeof fill !== 'string') {
      return 'content_json paperShape invalid fill';
    }
    const imageSrc = attrs.imageSrc;
    if (
      imageSrc !== undefined &&
      imageSrc !== null &&
      typeof imageSrc !== 'string'
    ) {
      return 'content_json paperShape invalid imageSrc';
    }
    const borderColor = attrs.borderColor;
    if (
      borderColor !== undefined &&
      borderColor !== null &&
      typeof borderColor !== 'string'
    ) {
      return 'content_json paperShape invalid borderColor';
    }
    const borderWidth = attrs.borderWidth;
    if (borderWidth !== undefined && typeof borderWidth !== 'string') {
      return 'content_json paperShape invalid borderWidth';
    }
    const borderStyle = attrs.borderStyle;
    if (
      borderStyle !== undefined &&
      borderStyle !== 'solid' &&
      borderStyle !== 'dashed' &&
      borderStyle !== 'dotted'
    ) {
      return 'content_json paperShape invalid borderStyle';
    }
  }
  return undefined;
}

/** Paper documents allow tables, images, and block attribution attrs. */
export function validatePaperContentJsonForWrite(raw: unknown):
  | {
      ok: true;
      doc: ValidatedContentJson;
      serializedUtf8Bytes: number;
    }
  | {
      ok: false;
      error: string;
    } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'content_json must be an object' };
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    return { ok: false, error: 'content_json is not JSON-serializable' };
  }
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_CONTENT_JSON_BYTES) {
    return { ok: false, error: 'content_json too large' };
  }
  const doc = raw as Record<string, unknown>;
  if (doc.type !== 'doc') {
    return { ok: false, error: 'content_json root must be type doc' };
  }
  const err = validatePaperNode(doc, 0);
  if (err) return { ok: false, error: err };
  return { ok: true, doc, serializedUtf8Bytes: bytes };
}

export function messageFormatVersionForPayload(
  hasContentJson: boolean,
): number {
  return hasContentJson
    ? MESSAGE_FORMAT_VERSION_JSON
    : MESSAGE_FORMAT_VERSION_LEGACY;
}
