/**
 * Validates TipTap/ProseMirror JSON for message writes (whitelist nodes).
 * @see docs/contracts/ECHO_CONTRACT_V2.md
 */
import {
  MAX_CONTENT_JSON_BYTES,
  MESSAGE_FORMAT_VERSION_JSON,
  MESSAGE_FORMAT_VERSION_LEGACY,
} from '../../../shared/echoMessageFormatV2';
import { PAPER_CONTENT_JSON_NODE_TYPES } from '../../../shared/paperContentJson';

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
]);

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
