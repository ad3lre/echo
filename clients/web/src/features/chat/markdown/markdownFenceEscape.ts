/**
 * Echo extension: `!` immediately before a GFM fence opener (` ``` ` / `~~~`)
 * disables the fence so inner lines use full markdown. Opener and matching closer
 * lines are stripped before message rendering.
 */

const ESCAPED_FENCE_OPENER_RE = /^ {0,3}!(`{3,}|~{3,})(?:[^\n]*)?$/;

export function isEscapedMarkdownFenceOpenerLine(line: string): boolean {
  return ESCAPED_FENCE_OPENER_RE.test(line);
}

export function parseMarkdownFenceOpener(
  line: string,
): { char: '`' | '~'; len: number } | null {
  const m = /^ {0,3}(`{3,}|~{3,})(?:[ \t]+[^\n]*)?$/.exec(line);
  if (!m) return null;
  const fence = m[1]!;
  return { char: fence[0] === '`' ? '`' : '~', len: fence.length };
}

export function isMarkdownFenceCloserLine(
  line: string,
  fenceChar: '`' | '~',
  minLen: number,
): boolean {
  const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
  if (!m) return false;
  const seq = m[1]!;
  if (fenceChar === '`' && !seq.startsWith('`')) return false;
  if (fenceChar === '~' && !seq.startsWith('~')) return false;
  return seq.length >= minLen;
}

function lineEnd(text: string, i: number): number {
  const n = text.indexOf('\n', i);
  return n === -1 ? text.length : n;
}

/** Remove `!`-prefixed fence opener/closer lines; keep inner content for markdown. */
export function stripEscapedMarkdownFenceMarkers(text: string): string {
  const out: string[] = [];
  let pos = 0;
  let inEscaped = false;
  let fenceChar: '`' | '~' = '`';
  let minCloseLen = 3;

  while (pos <= text.length) {
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? text.length : nl;
    const line = text.slice(pos, end);

    if (!inEscaped) {
      if (isEscapedMarkdownFenceOpenerLine(line)) {
        const m = ESCAPED_FENCE_OPENER_RE.exec(line)!;
        const fence = m[1]!;
        fenceChar = fence[0] === '`' ? '`' : '~';
        minCloseLen = fence.length;
        inEscaped = true;
      } else {
        out.push(line);
      }
    } else if (isMarkdownFenceCloserLine(line, fenceChar, minCloseLen)) {
      inEscaped = false;
    } else {
      out.push(line);
    }

    if (nl === -1) break;
    pos = nl + 1;
  }

  return out.join('\n');
}

export type EscapedMarkdownFenceWalkState = {
  inEscapedFence: boolean;
  fenceChar: '`' | '~';
  minCloseLen: number;
};

export function createEscapedMarkdownFenceWalkState(): EscapedMarkdownFenceWalkState {
  return { inEscapedFence: false, fenceChar: '`', minCloseLen: 3 };
}

/** Advance escaped-fence state at a line boundary; returns true when the line was consumed. */
export function stepEscapedMarkdownFenceAtLine(
  line: string,
  state: EscapedMarkdownFenceWalkState,
): boolean {
  if (!state.inEscapedFence) {
    if (!isEscapedMarkdownFenceOpenerLine(line)) return false;
    const m = ESCAPED_FENCE_OPENER_RE.exec(line)!;
    const fence = m[1]!;
    state.fenceChar = fence[0] === '`' ? '`' : '~';
    state.minCloseLen = fence.length;
    state.inEscapedFence = true;
    return true;
  }

  if (isMarkdownFenceCloserLine(line, state.fenceChar, state.minCloseLen)) {
    state.inEscapedFence = false;
    return true;
  }
  return false;
}
