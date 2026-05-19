export type MarkdownMathRegion = {
  token: string;
  latex: string;
  displayMode: boolean;
};

export type MarkdownMathExtraction = {
  text: string;
  regions: MarkdownMathRegion[];
};

const TOKEN_PREFIX = '@@ECHO_MATH_SLOT_';
const TOKEN_SUFFIX = '@@';

/** Stop extracting math after this many regions (pathological documents). */
const MAX_MATH_REGIONS = 200;
const BARE_DISPLAY_MATH_ENVIRONMENTS = new Set([
  'matrix',
  'pmatrix',
  'bmatrix',
  'Bmatrix',
  'vmatrix',
  'Vmatrix',
  'smallmatrix',
  'cases',
  'aligned',
  'align',
  'align*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'split',
  'array',
]);

function isEscaped(text: string, idx: number): boolean {
  let backslashes = 0;
  for (let i = idx - 1; i >= 0 && text[i] === '\\'; i--) backslashes++;
  return backslashes % 2 === 1;
}

function isLineStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const p = text[i - 1]!;
  return p === '\n' || p === '\r';
}

function findLineEnd(text: string, from: number): number {
  const n = text.indexOf('\n', from);
  return n === -1 ? text.length : n;
}

/** GFM closing fence: same char as opener, length >= opener, optional indent, rest whitespace only. */
function findFenceCloseLineEnd(
  text: string,
  contentStart: number,
  fenceChar: '`' | '~',
  openFenceLen: number,
): number {
  let pos = contentStart;
  while (pos < text.length) {
    const lineEnd = findLineEnd(text, pos);
    let line = text.slice(pos, lineEnd);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    const m = line.match(/^(\s{0,3})(`{3,}|~{3,})\s*$/);
    if (m && m[2]![0] === fenceChar && m[2]!.length >= openFenceLen) {
      return lineEnd < text.length ? lineEnd + 1 : text.length;
    }
    if (lineEnd >= text.length) return -1;
    pos = lineEnd + 1;
  }
  return -1;
}

function findInlineCodeEnd(text: string, from: number, ticks: string): number {
  return text.indexOf(ticks, from);
}

function isInlineDollarMathBody(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  if (trimmed !== body) return false;
  if (/[\r\n`]/.test(body)) return false;
  /**
   * Currency guard: in `$5-$10` the scanner pairs the first `$` with the `$` in
   * `$10`, producing body `5-`. Reject that; do not reject plain numeric math like
   * `$5$` or `$3.14$`.
   */
  if (/^\d+\s*-\s*$/.test(trimmed)) return false;
  return true;
}

function matchBareDisplayMathEnvironment(
  text: string,
  from: number,
): { latex: string; end: number } | null {
  if (!isLineStart(text, from) || !text.startsWith('\\begin{', from))
    return null;
  const open = text.slice(from).match(/^\\begin\{([a-zA-Z][a-zA-Z*]*)\}/);
  if (!open) return null;
  const env = open[1]!;
  if (!BARE_DISPLAY_MATH_ENVIRONMENTS.has(env)) return null;
  const endToken = `\\end{${env}}`;
  const bodyStart = from + open[0].length;
  const endIdx = text.indexOf(endToken, bodyStart);
  if (endIdx === -1) return null;
  const end = endIdx + endToken.length;
  return { latex: text.slice(from, end), end };
}

export function extractMarkdownMathRegions(
  text: string,
): MarkdownMathExtraction {
  if (!text) return { text, regions: [] };
  const regions: MarkdownMathRegion[] = [];
  let out = '';
  let i = 0;
  let slot = 0;

  const pushRegion = (latex: string, displayMode: boolean) => {
    if (slot >= MAX_MATH_REGIONS) {
      if (displayMode) out += `$$${latex}$$`;
      else out += `\\(${latex}\\)`;
      return;
    }
    const token = `${TOKEN_PREFIX}${slot}${TOKEN_SUFFIX}`;
    slot += 1;
    regions.push({ token, latex, displayMode });
    out += token;
  };

  while (i < text.length) {
    if (isLineStart(text, i) && (text[i] === '`' || text[i] === '~')) {
      const lineEnd = findLineEnd(text, i);
      let lineRaw = text.slice(i, lineEnd);
      if (lineRaw.endsWith('\r')) lineRaw = lineRaw.slice(0, -1);
      const openM = lineRaw.match(/^(\s{0,3})(`{3,}|~{3,})(.*)$/);
      if (openM) {
        const fenceSeq = openM[2]!;
        const openLen = fenceSeq.length;
        const fenceChar = fenceSeq[0] as '`' | '~';
        const contentStart = lineEnd < text.length ? lineEnd + 1 : text.length;
        const closeEnd = findFenceCloseLineEnd(
          text,
          contentStart,
          fenceChar,
          openLen,
        );
        if (closeEnd === -1) {
          out += text.slice(i);
          break;
        }
        out += text.slice(i, closeEnd);
        i = closeEnd;
        continue;
      }
    }

    if (text[i] === '`' && !isEscaped(text, i)) {
      let j = i;
      while (j < text.length && text[j] === '`') j++;
      const ticks = text.slice(i, j);
      const end = findInlineCodeEnd(text, j, ticks);
      if (end === -1) {
        out += text.slice(i);
        break;
      }
      out += text.slice(i, end + ticks.length);
      i = end + ticks.length;
      continue;
    }

    const bareEnv = matchBareDisplayMathEnvironment(text, i);
    if (bareEnv) {
      pushRegion(bareEnv.latex, true);
      i = bareEnv.end;
      continue;
    }

    if (text.startsWith('\\(', i)) {
      if (isEscaped(text, i)) {
        out += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      const end = text.indexOf('\\)', i + 2);
      if (end === -1) {
        out += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      pushRegion(text.slice(i + 2, end), false);
      i = end + 2;
      continue;
    }

    if (text.startsWith('\\[', i)) {
      if (isEscaped(text, i)) {
        out += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      const end = text.indexOf('\\]', i + 2);
      if (end === -1) {
        out += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      pushRegion(text.slice(i + 2, end), true);
      i = end + 2;
      continue;
    }

    if (text.startsWith('$$', i)) {
      if (isEscaped(text, i)) {
        out += '$$';
        i += 2;
        continue;
      }
      const end = text.indexOf('$$', i + 2);
      if (end === -1) {
        out += '$$';
        i += 2;
        continue;
      }
      pushRegion(text.slice(i + 2, end), true);
      i = end + 2;
      continue;
    }

    if (text[i] === '$') {
      if (
        isEscaped(text, i) ||
        text.startsWith('$$', i) ||
        /\s/.test(text[i + 1] ?? '')
      ) {
        out += '$';
        i += 1;
        continue;
      }
      let end = i + 1;
      let matched = false;
      while (end < text.length) {
        end = text.indexOf('$', end);
        if (end === -1) break;
        if (
          isEscaped(text, end) ||
          text[end - 1] == null ||
          /\s/.test(text[end - 1]!)
        ) {
          end += 1;
          continue;
        }
        const body = text.slice(i + 1, end);
        if (!isInlineDollarMathBody(body)) {
          end += 1;
          continue;
        }
        pushRegion(body, false);
        i = end + 1;
        matched = true;
        break;
      }
      if (matched) continue;
      out += '$';
      i += 1;
      continue;
    }

    out += text[i]!;
    i += 1;
  }

  return { text: out, regions };
}

export function hasMarkdownMathRegions(text: string): boolean {
  return extractMarkdownMathRegions(text).regions.length > 0;
}

export function injectRenderedMathRegions(
  html: string,
  rendered: ReadonlyArray<{ token: string; html: string }>,
): string {
  if (!html || rendered.length === 0) return html;
  let out = html;
  for (const r of rendered) {
    out = out.split(r.token).join(r.html);
  }
  return out;
}
