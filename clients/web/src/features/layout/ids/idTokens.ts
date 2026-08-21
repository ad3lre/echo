/**
 * Linkable ID tokens for chat. When pasted, the client renders them as pills (like @ / #).
 *
 * - User:    <@id> or <@!id> (optional ! ignored when parsing)
 * - Channel: <#id>
 * - Role:    <@&id>
 * - Server:  <$id>  (guild; Discord has no in-message guild token — Echo uses $)
 * - Message: <m:id>
 * - Custom emoji: <:name:id> or <a:name:id> (animated)
 * - App icon (Echo SVG catalog): <icon:filename.svg> — filename is the asset name under `assets/icons/`
 */

const ID_PART = String.raw`[\w.-]{1,128}`;

const APP_ICON_INNER_MAX = 200;

/** Paste / copy helpers */
export function linkTokenUser(id: string): string {
  return `<@${id}>`;
}

export function linkTokenChannel(id: string): string {
  return `<#${id}>`;
}

export function linkTokenRole(id: string): string {
  return `<@&${id}>`;
}

export function linkTokenServer(id: string): string {
  return `<$${id}>`;
}

export function linkTokenMessage(id: string): string {
  return `<m:${id}>`;
}

/** Discord custom emoji (static or animated name+snowflake) */
export function linkTokenCustomEmoji(name: string, id: string): string {
  const safe = name.replace(/:/g, '_').replace(/[<>]/g, '') || 'emoji';
  return `<:${safe}:${id}>`;
}

export function linkTokenCustomEmojiAnimated(name: string, id: string): string {
  const safe = name.replace(/:/g, '_').replace(/[<>]/g, '') || 'emoji';
  return `<a:${safe}:${id}>`;
}

/** In-house SVG icon token (resolved client-side via `assets/iconCatalog`). */
export function linkTokenAppIcon(filename: string): string {
  const safe =
    filename.replace(/[<>]/g, '').trim().slice(0, APP_ICON_INNER_MAX) ||
    'icon.svg';
  return `<icon:${safe}>`;
}

export type ParsedIdToken =
  | { kind: 'user'; id: string; rawLen: number }
  | { kind: 'channel'; id: string; rawLen: number }
  | { kind: 'role'; id: string; rawLen: number }
  | { kind: 'server'; id: string; rawLen: number }
  | { kind: 'message'; id: string; rawLen: number }
  | {
      kind: 'emoji';
      name: string;
      id: string;
      animated: boolean;
      rawLen: number;
    }
  | { kind: 'appIcon'; filename: string; rawLen: number };

function tryMatchTokenAt(s: string): ParsedIdToken | null {
  {
    const m = s.match(/^<icon:([^>\n]{1,200})>/);
    if (m) {
      const filename = m[1]!.trim();
      if (filename.length > 0) {
        return {
          kind: 'appIcon',
          filename,
          rawLen: m[0].length,
        };
      }
    }
  }
  let m = s.match(new RegExp(`^<a:([^:>]+):(${ID_PART})>`));
  if (m) {
    return {
      kind: 'emoji',
      animated: true,
      name: m[1],
      id: m[2],
      rawLen: m[0].length,
    };
  }
  m = s.match(new RegExp(`^<:([^:>]+):(${ID_PART})>`));
  if (m) {
    return {
      kind: 'emoji',
      animated: false,
      name: m[1],
      id: m[2],
      rawLen: m[0].length,
    };
  }
  m = s.match(new RegExp(`^<@!?(${ID_PART})>`));
  if (m) {
    return { kind: 'user', id: m[1], rawLen: m[0].length };
  }
  m = s.match(new RegExp(`^<#(${ID_PART})>`));
  if (m) {
    return { kind: 'channel', id: m[1], rawLen: m[0].length };
  }
  m = s.match(new RegExp(`^<@&(${ID_PART})>`));
  if (m) {
    return { kind: 'role', id: m[1], rawLen: m[0].length };
  }
  m = s.match(new RegExp(`^<\\$(${ID_PART})>`));
  if (m) {
    return { kind: 'server', id: m[1], rawLen: m[0].length };
  }
  m = s.match(new RegExp(`^<m:(${ID_PART})>`));
  if (m) {
    return { kind: 'message', id: m[1], rawLen: m[0].length };
  }
  return null;
}

export function findAllIdTokenMatches(
  text: string,
): Array<{ start: number; end: number; token: ParsedIdToken }> {
  const out: Array<{ start: number; end: number; token: ParsedIdToken }> = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '<') {
      i++;
      continue;
    }
    const t = tryMatchTokenAt(text.slice(i));
    if (t) {
      out.push({ start: i, end: i + t.rawLen, token: t });
      i += t.rawLen;
    } else {
      i++;
    }
  }
  return out;
}
