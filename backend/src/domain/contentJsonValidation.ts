/**
 * Validates TipTap/ProseMirror JSON for message writes (whitelist nodes).
 * @see docs/contracts/ECHO_CONTRACT_V2.md
 */
import {
  MAX_CONTENT_JSON_BYTES,
  MESSAGE_FORMAT_VERSION_JSON,
  MESSAGE_FORMAT_VERSION_LEGACY,
} from '../../../shared/echoMessageFormatV2';

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

export function messageFormatVersionForPayload(
  hasContentJson: boolean,
): number {
  return hasContentJson
    ? MESSAGE_FORMAT_VERSION_JSON
    : MESSAGE_FORMAT_VERSION_LEGACY;
}
