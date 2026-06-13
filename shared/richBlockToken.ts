/**
 * Universal plain-text tokens for rich block nodes in chat `content_json`.
 *
 * Grammar: `![type: key=value, key2=value2]`
 *
 * - `type` — lowercase block kind (`image`, future `button`, …).
 * - Attributes are comma-separated `key=value` pairs; values may be quoted when they
 *   contain commas or spaces.
 *
 * @see docs/contracts/ECHO_CONTRACT_V2.md
 */

export type RichBlockToken = {
  type: string;
  attrs: Record<string, string>;
  start: number;
  end: number;
  raw: string;
};

/** Known block kinds (extend when adding new rich blocks). */
export const RICH_BLOCK_TYPES = {
  image: 'image',
  button: 'button',
  buttonRow: 'buttonrow',
} as const;

export type KnownRichBlockType = keyof typeof RICH_BLOCK_TYPES;

const BLOCK_TOKEN_RE = /!\[([a-z][a-z0-9_-]*):\s*([^\]]*)\]/gi;

const SAFE_UNQUOTED_VALUE_RE = /^[a-zA-Z0-9._:/-]+$/;

function escapeAttrValue(val: string): string {
  if (SAFE_UNQUOTED_VALUE_RE.test(val)) return val;
  return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Format a rich block token for plain projection / composer shortcuts. */
export function formatRichBlockToken(
  type: string,
  attrs: Record<string, string>,
): string {
  const kind = type.trim().toLowerCase();
  if (!kind) return '';
  const pairs = Object.entries(attrs)
    .filter(([k, v]) => k.trim().length > 0 && v !== undefined && v !== null)
    .map(([k, v]) => `${k.trim()}=${escapeAttrValue(String(v).trim())}`);
  if (!pairs.length) return `![${kind}]`;
  return `![${kind}: ${pairs.join(', ')}]`;
}

/** Parse attribute pairs from the inside of a block token (after `type:`). */
export function parseRichBlockAttrs(body: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const parts: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"') {
      inQuote = !inQuote;
      cur += c;
    } else if (c === ',' && !inQuote) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim()) parts.push(cur.trim());

  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    let val = part.slice(eq + 1).trim();
    if (
      val.length >= 2 &&
      val.startsWith('"') &&
      val.endsWith('"') &&
      !inQuote
    ) {
      val = val.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    if (key) attrs[key] = val;
  }
  return attrs;
}

/** Parse a single rich block token string (must be the full token). */
export function parseRichBlockToken(raw: string): RichBlockToken | null {
  const s = raw.trim();
  const m = /^!\[([a-z][a-z0-9_-]*):\s*([^\]]*)\]$/i.exec(s);
  if (!m) return null;
  const type = m[1].toLowerCase();
  const attrs = parseRichBlockAttrs(m[2]);
  return {
    type,
    attrs,
    start: 0,
    end: s.length,
    raw: s,
  };
}

/** Find all rich block tokens in plain text (optionally filter by type). */
export function findAllRichBlockTokens(
  plain: string,
  typeFilter?: string,
): RichBlockToken[] {
  const out: RichBlockToken[] = [];
  if (!plain) return out;
  const filter = typeFilter?.trim().toLowerCase();
  BLOCK_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BLOCK_TOKEN_RE.exec(plain)) !== null) {
    const type = m[1].toLowerCase();
    if (filter && type !== filter) continue;
    const attrs = parseRichBlockAttrs(m[2]);
    out.push({
      type,
      attrs,
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
    });
  }
  return out;
}
