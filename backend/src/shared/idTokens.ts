/**
 * Linkable ID tokens used by backend message persistence.
 */

const ID_PART = String.raw`[\w.-]{1,128}`;

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
    };

// Compiled once at module load. `findAllIdTokenMatches` calls `tryMatchTokenAt` at every
// `<` in every persisted message, so building these per call was 7 RegExp compilations per
// candidate position. Patterns are byte-identical to the previous inline versions.
const RE_EMOJI_ANIMATED = /^<a:([^:>]+):(\d+)>/;
const RE_EMOJI_STATIC = /^<:([^:>]+):(\d+)>/;
const RE_USER = new RegExp(`^<@!?(${ID_PART})>`);
const RE_CHANNEL = new RegExp(`^<#(${ID_PART})>`);
const RE_ROLE = new RegExp(`^<@&(${ID_PART})>`);
const RE_SERVER = new RegExp(`^<\\$(${ID_PART})>`);
const RE_MESSAGE = new RegExp(`^<m:(${ID_PART})>`);

function tryMatchTokenAt(s: string): ParsedIdToken | null {
  let m = s.match(RE_EMOJI_ANIMATED);
  if (m) {
    return {
      kind: 'emoji',
      animated: true,
      name: m[1],
      id: m[2],
      rawLen: m[0].length,
    };
  }

  m = s.match(RE_EMOJI_STATIC);
  if (m) {
    return {
      kind: 'emoji',
      animated: false,
      name: m[1],
      id: m[2],
      rawLen: m[0].length,
    };
  }

  m = s.match(RE_USER);
  if (m) {
    return { kind: 'user', id: m[1], rawLen: m[0].length };
  }

  m = s.match(RE_CHANNEL);
  if (m) {
    return { kind: 'channel', id: m[1], rawLen: m[0].length };
  }

  m = s.match(RE_ROLE);
  if (m) {
    return { kind: 'role', id: m[1], rawLen: m[0].length };
  }

  m = s.match(RE_SERVER);
  if (m) {
    return { kind: 'server', id: m[1], rawLen: m[0].length };
  }

  m = s.match(RE_MESSAGE);
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
      i += 1;
      continue;
    }

    const token = tryMatchTokenAt(text.slice(i));
    if (token) {
      out.push({ start: i, end: i + token.rawLen, token });
      i += token.rawLen;
    } else {
      i += 1;
    }
  }

  return out;
}
