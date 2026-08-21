/** GFM ordered-list line prefix (matches composer markdown decorations). */
const OL_LINE_RE = /^(\s*)(\d{1,9}\.)(\s+)(.*)$/;

function lineBoundsAt(
  content: string,
  offset: number,
): { lineStart: number; lineEnd: number } {
  const lineStart = content.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const nl = content.indexOf('\n', offset);
  const lineEnd = nl === -1 ? content.length : nl;
  return { lineStart, lineEnd };
}

/**
 * On Enter inside an ordered-list line, insert the next list marker (`n+1.`)
 * while preserving the user's chosen starting number on the current line.
 */
export function applyComposerOrderedListEnter(
  content: string,
  selectionStart: number,
  selectionEnd: number,
): { content: string; selectionStart: number; selectionEnd: number } | null {
  if (selectionStart !== selectionEnd) return null;

  const { lineStart, lineEnd } = lineBoundsAt(content, selectionStart);
  const line = content.slice(lineStart, lineEnd);
  const match = line.match(OL_LINE_RE);
  if (!match) return null;

  const indent = match[1] ?? '';
  const marker = match[2] ?? '1.';
  const spacer = match[3] ?? ' ';
  const body = match[4] ?? '';
  const prefixLen = indent.length + marker.length + spacer.length;
  const cursorInLine = selectionStart - lineStart;

  // Empty item at/after prefix: exit list (remove marker) instead of forcing `1.`
  if (body.trim().length === 0 && cursorInLine <= prefixLen) {
    const withoutPrefix = indent + body;
    const newContent =
      content.slice(0, lineStart) + withoutPrefix + content.slice(lineEnd);
    const newPos = lineStart + Math.min(cursorInLine, indent.length);
    return {
      content: newContent,
      selectionStart: newPos,
      selectionEnd: newPos,
    };
  }

  const parsed = parseInt(marker.replace(/\.$/, ''), 10);
  const next = Number.isFinite(parsed) ? parsed + 1 : 1;
  const insert = `\n${indent}${next}. `;
  const newContent =
    content.slice(0, selectionStart) + insert + content.slice(selectionEnd);
  const newPos = selectionStart + insert.length;
  return {
    content: newContent,
    selectionStart: newPos,
    selectionEnd: newPos,
  };
}
