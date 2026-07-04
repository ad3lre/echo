function isEscaped(text: string, idx: number): boolean {
  let backslashes = 0;
  for (let i = idx - 1; i >= 0 && text[i] === '\\'; i -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function isLineStart(text: string, idx: number): boolean {
  if (idx === 0) return true;
  const prev = text[idx - 1];
  return prev === '\n' || prev === '\r';
}

function findLineEnd(text: string, from: number): number {
  const next = text.indexOf('\n', from);
  return next === -1 ? text.length : next;
}

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
    const match = line.match(/^(\s{0,3})(`{3,}|~{3,})\s*$/);
    if (
      match &&
      match[2]![0] === fenceChar &&
      match[2]!.length >= openFenceLen
    ) {
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

function readBraceArgument(
  text: string,
  from: number,
): { content: string; end: number } | null {
  if (text[from] !== '{') return null;
  let depth = 0;
  let out = '';
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === '{' && !isEscaped(text, i)) {
      if (depth > 0) out += ch;
      depth += 1;
      continue;
    }
    if (ch === '}' && !isEscaped(text, i)) {
      depth -= 1;
      if (depth === 0) return { content: out, end: i + 1 };
      out += ch;
      continue;
    }
    out += ch;
  }
  return null;
}

function readBracketArgument(
  text: string,
  from: number,
): { content: string; end: number } | null {
  if (text[from] !== '[') return null;
  let depth = 0;
  let out = '';
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === '[' && !isEscaped(text, i)) {
      if (depth > 0) out += ch;
      depth += 1;
      continue;
    }
    if (ch === ']' && !isEscaped(text, i)) {
      depth -= 1;
      if (depth === 0) return { content: out, end: i + 1 };
      out += ch;
      continue;
    }
    out += ch;
  }
  return null;
}

function consumeCommandWhitespace(text: string, from: number): number {
  let i = from;
  while (i < text.length && /\s/.test(text[i]!)) i += 1;
  return i;
}

function matchCommandWithBraceArg(
  text: string,
  from: number,
  command: string,
): { content: string; end: number } | null {
  const prefix = `\\${command}`;
  if (!text.startsWith(prefix, from)) return null;
  let cursor = from + prefix.length;
  if (text[cursor] === '*') cursor += 1;
  cursor = consumeCommandWhitespace(text, cursor);
  return readBraceArgument(text, cursor);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeTabularBody(body: string): string {
  return body.replace(/\s*\\\s+\\\s*/g, '\\\\');
}

function splitLatexRows(body: string): string[] {
  const rows: string[] = [];
  let cur = '';
  let i = 0;
  while (i < body.length) {
    if (body.startsWith('\\\\', i)) {
      if (cur.trim()) rows.push(cur.trim());
      cur = '';
      i += 2;
      while (i < body.length && /\s/.test(body[i]!)) i += 1;
      continue;
    }
    cur += body[i]!;
    i += 1;
  }
  if (cur.trim()) rows.push(cur.trim());
  return rows;
}

function splitLatexCells(row: string): string[] {
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i]!;
    if (ch === '&' && !isEscaped(row, i)) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function parseTabularAlignments(
  spec: string,
): Array<'left' | 'center' | 'right'> {
  const cols: Array<'left' | 'center' | 'right'> = [];
  for (const ch of spec) {
    if (ch === 'l') cols.push('left');
    if (ch === 'c') cols.push('center');
    if (ch === 'r') cols.push('right');
  }
  return cols;
}

function cellAlignStyle(
  alignments: Array<'left' | 'center' | 'right'>,
  index: number,
): string {
  const align = alignments[index];
  return align ? ` style="text-align:${align}"` : '';
}

function renderTabularHtml(body: string): string {
  const tabularMatch = body.match(/^\{([^}]*)\}([\s\S]*)$/);
  if (!tabularMatch) return body;
  const alignments = parseTabularAlignments(tabularMatch[1] ?? '');
  const cleaned = normalizeTabularBody(tabularMatch[2] ?? '')
    .replace(/\\hline\b/g, '')
    .trim();
  if (!cleaned) return '';
  const rows = splitLatexRows(cleaned)
    .map((row) => splitLatexCells(row))
    .filter((cells) => cells.some((cell) => cell.length > 0));
  if (rows.length === 0) return '';
  const renderCells = (cells: string[], tag: 'th' | 'td') =>
    cells
      .map((cell, index) => {
        const inner = preprocessLatexTextCompat(cell).trim() || '&nbsp;';
        return `<${tag}${cellAlignStyle(alignments, index)}>${inner}</${tag}>`;
      })
      .join('');
  /** Trailing newlines so `marked` resumes Markdown after raw HTML (CommonMark ends HTML blocks at blank lines). */
  const blockSuffix = '\n\n';
  if (rows.length === 1) {
    return `<table><tbody><tr>${renderCells(rows[0]!, 'td')}</tr></tbody></table>${blockSuffix}`;
  }
  const [head, ...rest] = rows;
  const bodyRows = rest
    .map((cells) => `<tr>${renderCells(cells, 'td')}</tr>`)
    .join('');
  return `<table><thead><tr>${renderCells(head!, 'th')}</tr></thead><tbody>${bodyRows}</tbody></table>${blockSuffix}`;
}

function matchTabularEnvironment(
  text: string,
  from: number,
): { html: string; end: number } | null {
  const prefix = '\\begin{tabular}';
  if (!text.startsWith(prefix, from)) return null;
  const bodyArg = readBraceArgument(text, from + prefix.length);
  if (!bodyArg) return null;
  const endToken = '\\end{tabular}';
  const end = text.indexOf(endToken, bodyArg.end);
  if (end === -1) return null;
  const body = text.slice(bodyArg.end, end);
  return {
    html: renderTabularHtml(`{${bodyArg.content}}${body}`),
    end: end + endToken.length,
  };
}

function renderInlineCommand(
  text: string,
  from: number,
  command: string,
  tag: string,
): { html: string; end: number } | null {
  const match = matchCommandWithBraceArg(text, from, command);
  if (!match) return null;
  return {
    html: `<${tag}>${preprocessLatexTextCompat(match.content).trim()}</${tag}>`,
    end: match.end,
  };
}

function renderHeadingCommand(
  text: string,
  from: number,
  command: string,
  tag: 'h1' | 'h2' | 'h3',
): { html: string; end: number } | null {
  const match = matchCommandWithBraceArg(text, from, command);
  if (!match) return null;
  return {
    html: `\n<${tag}>${preprocessLatexTextCompat(match.content).trim()}</${tag}>\n`,
    end: match.end,
  };
}

function renderFootnoteCommand(
  text: string,
  from: number,
): { html: string; end: number } | null {
  const prefix = '\\footnote';
  if (!text.startsWith(prefix, from)) return null;
  let cursor = from + prefix.length;
  cursor = consumeCommandWhitespace(text, cursor);
  const labelArg = readBracketArgument(text, cursor);
  if (labelArg) cursor = labelArg.end;
  cursor = consumeCommandWhitespace(text, cursor);
  const bodyArg = readBraceArgument(text, cursor);
  if (!bodyArg) return null;
  const label = labelArg?.content?.trim();
  const body = preprocessLatexTextCompat(bodyArg.content).trim();
  const sup = label ? `<sup>[${escapeHtml(label)}]</sup>` : '<sup>[*]</sup>';
  return {
    html: `${sup} <small>${body}</small>`,
    end: bodyArg.end,
  };
}

function matchCommandWithTwoBraceArgs(
  text: string,
  from: number,
  command: string,
): { first: string; second: string; end: number } | null {
  const first = matchCommandWithBraceArg(text, from, command);
  if (!first) return null;
  const cursor = consumeCommandWhitespace(text, first.end);
  const second = readBraceArgument(text, cursor);
  if (!second) return null;
  return { first: first.content, second: second.content, end: second.end };
}

function renderUrlCommand(
  text: string,
  from: number,
): { html: string; end: number } | null {
  const match = matchCommandWithBraceArg(text, from, 'url');
  if (!match) return null;
  const raw = match.content.trim();
  if (!/^https?:\/\/\S+$/i.test(raw)) {
    return { html: escapeHtml(raw), end: match.end };
  }
  const safe = escapeHtml(raw);
  return {
    html: `<a href="${safe}">${safe}</a>`,
    end: match.end,
  };
}

function renderHrefCommand(
  text: string,
  from: number,
): { html: string; end: number } | null {
  const match = matchCommandWithTwoBraceArgs(text, from, 'href');
  if (!match) return null;
  const url = match.first.trim();
  const label = preprocessLatexTextCompat(match.second).trim();
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return { html: escapeHtml(label || url), end: match.end };
  }
  const safeUrl = escapeHtml(url);
  const safeLabel = label || safeUrl;
  return {
    html: `<a href="${safeUrl}">${safeLabel}</a>`,
    end: match.end,
  };
}

export function preprocessLatexTextCompat(text: string): string {
  if (!text) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (isLineStart(text, i) && (text[i] === '`' || text[i] === '~')) {
      const lineEnd = findLineEnd(text, i);
      let lineRaw = text.slice(i, lineEnd);
      if (lineRaw.endsWith('\r')) lineRaw = lineRaw.slice(0, -1);
      const openMatch = lineRaw.match(/^(\s{0,3})(`{3,}|~{3,})(.*)$/);
      if (openMatch) {
        const fenceSeq = openMatch[2]!;
        const closeEnd = findFenceCloseLineEnd(
          text,
          lineEnd < text.length ? lineEnd + 1 : text.length,
          fenceSeq[0] as '`' | '~',
          fenceSeq.length,
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
      while (j < text.length && text[j] === '`') j += 1;
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

    const heading =
      renderHeadingCommand(text, i, 'subsubsection', 'h3') ??
      renderHeadingCommand(text, i, 'subsection', 'h2') ??
      renderHeadingCommand(text, i, 'section', 'h1');
    if (heading) {
      out += heading.html;
      i = heading.end;
      continue;
    }

    const inline =
      renderInlineCommand(text, i, 'textbf', 'strong') ??
      renderInlineCommand(text, i, 'textit', 'em') ??
      renderInlineCommand(text, i, 'emph', 'em') ??
      renderInlineCommand(text, i, 'texttt', 'code') ??
      renderFootnoteCommand(text, i) ??
      renderUrlCommand(text, i) ??
      renderHrefCommand(text, i);
    if (inline) {
      out += inline.html;
      i = inline.end;
      continue;
    }

    const table = matchTabularEnvironment(text, i);
    if (table) {
      out += table.html;
      i = table.end;
      continue;
    }

    if (text.startsWith('\\begin{center}', i)) {
      out += '<div class="md-latex-center">';
      i += '\\begin{center}'.length;
      continue;
    }
    if (text.startsWith('\\end{center}', i)) {
      out += '</div>\n\n';
      i += '\\end{center}'.length;
      continue;
    }
    if (text.startsWith('\\qquad', i)) {
      out += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
      i += '\\qquad'.length;
      continue;
    }
    if (text.startsWith('\\quad', i)) {
      out += '&nbsp;&nbsp;&nbsp;&nbsp;';
      i += '\\quad'.length;
      continue;
    }
    if (text.startsWith('\\\\', i)) {
      out += '<br>';
      i += 2;
      continue;
    }
    if (text.startsWith('\\hline', i)) {
      i += '\\hline'.length;
      continue;
    }

    out += text[i]!;
    i += 1;
  }
  return out;
}
