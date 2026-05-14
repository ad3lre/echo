/**
 * Client-side shape check before readonly TipTap render (INV-RENDER / INV-SCHEMA-UPGRADE).
 * Mirrors server whitelist in `backend/src/domain/contentJsonValidation.ts`.
 */
import {
  ECHO_CONTENT_SCHEMA_VERSION,
  MAX_CONTENT_JSON_BYTES,
} from '@shared/echoMessageFormatV2';

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

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function validateNode(node: unknown, depth: number): string | undefined {
  if (depth > 80) return 'nested too deep';
  if (!isPlainObject(node)) return 'invalid node';
  const type = node.type;
  if (typeof type !== 'string' || !ALLOWED_TYPES.has(type)) {
    return `unknown node type: ${String(type)}`;
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) return 'invalid content array';
    for (const ch of node.content) {
      const err = validateNode(ch, depth + 1);
      if (err) return err;
    }
  }
  if (
    node.type === 'text' &&
    node.text !== undefined &&
    typeof node.text !== 'string'
  ) {
    return 'invalid text node';
  }
  return undefined;
}

export function validateEchoContentJsonForRender(raw: unknown):
  | {
      ok: true;
      doc: Record<string, unknown>;
    }
  | { ok: false } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false };
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    return { ok: false };
  }
  if (utf8ByteLength(serialized) > MAX_CONTENT_JSON_BYTES) {
    return { ok: false };
  }
  const doc = raw as Record<string, unknown>;
  if (doc.type !== 'doc') return { ok: false };
  const err = validateNode(doc, 0);
  if (err) return { ok: false };
  return { ok: true, doc };
}

export function isEchoContentSchemaSupportedForRender(
  version: number | undefined,
): boolean {
  const v = version ?? 1;
  return v >= 1 && v <= ECHO_CONTENT_SCHEMA_VERSION;
}
