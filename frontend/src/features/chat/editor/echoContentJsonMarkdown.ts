/**
 * Best-effort TipTap JSON → Markdown (GFM-style) for “copy as written” / clipboard.
 * Reconstructs emphasis, lists, headings, etc. from stored `contentJson` — not the literal
 * keystrokes, but a faithful Markdown representation of the same structure.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function customEmojiToken(name: string, id: string, animated: boolean): string {
  return animated ? `<a:${name}:${id}>` : `<:${name}:${id}>`;
}

function appIconToken(filename: string): string {
  const stem = filename.replace(/\.svg$/i, '').trim();
  const slug = stem.replace(/\s+/g, '_').toLowerCase();
  return `:${slug}:`;
}

function escapeMdPlain(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/`/g, '\\`');
}

function escapeMdLinkUrl(href: string): string {
  return href.replace(/\\/g, '\\\\').replace(/\)/g, '\\)');
}

type Mark = { type?: string; attrs?: Record<string, unknown> };

function composeMarkedText(raw: string, marks: unknown[] | undefined): string {
  if (!marks?.length) return escapeMdPlain(raw);
  const list = marks as Mark[];
  const types = new Set(list.map((m) => m.type));
  if (types.has('code')) {
    const inner = raw.replace(/`/g, '`\u200b`');
    return '`' + inner + '`';
  }
  let out = escapeMdPlain(raw);
  const linkMark = list.find((m) => m.type === 'link');
  const href =
    linkMark?.attrs && typeof linkMark.attrs.href === 'string'
      ? linkMark.attrs.href.trim()
      : '';
  const hasBold = types.has('bold');
  const hasItalic = types.has('italic');
  const hasStrike = types.has('strike');
  if (hasStrike) out = `~~${out}~~`;
  if (hasBold && hasItalic) out = `***${out}***`;
  else if (hasBold) out = `**${out}**`;
  else if (hasItalic) out = `*${out}*`;
  if (href) {
    out = `[${out}](${escapeMdLinkUrl(href)})`;
  }
  return out;
}

function serializeInlineFragment(nodes: unknown[] | undefined): string {
  if (!nodes?.length) return '';
  let s = '';
  for (const node of nodes) {
    s += serializeInlineNode(node);
  }
  return s;
}

function serializeInlineNode(node: unknown): string {
  if (!isPlainObject(node)) return '';
  switch (node.type) {
    case 'text': {
      const raw = typeof node.text === 'string' ? node.text : '';
      const marks = Array.isArray(node.marks) ? node.marks : undefined;
      return composeMarkedText(raw, marks);
    }
    case 'hardBreak':
      return '  \n';
    case 'mentionEntity': {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      const label = String(attrs?.label ?? '');
      return `@${label}`;
    }
    case 'channelMention': {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      const label = String(attrs?.label ?? '');
      return `#${label}`;
    }
    case 'customEmoji': {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      return customEmojiToken(
        String(attrs?.name ?? 'emoji'),
        String(attrs?.emojiId ?? ''),
        Boolean(attrs?.animated),
      );
    }
    case 'appIcon': {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      return appIconToken(String(attrs?.filename ?? 'icon.svg'));
    }
    default:
      if (Array.isArray(node.content)) {
        return node.content.map(serializeInlineNode).join('');
      }
      return '';
  }
}

function blockQuotePrefix(body: string): string {
  const lines = body.split('\n');
  return lines.map((line) => (line.length ? `> ${line}` : '>')).join('\n');
}

function serializeBlock(node: unknown, listDepth = 0): string {
  if (!isPlainObject(node)) return '';
  switch (node.type) {
    case 'doc':
      return (Array.isArray(node.content) ? node.content : [])
        .map((ch) => serializeBlock(ch, 0))
        .filter((s) => s.length > 0)
        .join('\n\n');
    case 'paragraph':
      return serializeInlineFragment(
        Array.isArray(node.content) ? node.content : undefined,
      );
    case 'heading': {
      const levelRaw = isPlainObject(node.attrs) ? node.attrs.level : 1;
      const level =
        typeof levelRaw === 'number' && levelRaw >= 1 && levelRaw <= 6
          ? levelRaw
          : 1;
      const hashes = '#'.repeat(level);
      const inner = serializeInlineFragment(
        Array.isArray(node.content) ? node.content : undefined,
      );
      return `${hashes} ${inner}`.trimEnd();
    }
    case 'blockquote': {
      const inner = (Array.isArray(node.content) ? node.content : [])
        .map((ch) => serializeBlock(ch, listDepth))
        .filter((s) => s.length > 0)
        .join('\n\n');
      return blockQuotePrefix(inner);
    }
    case 'codeBlock': {
      let code = '';
      if (typeof node.text === 'string') {
        code = node.text;
      } else if (Array.isArray(node.content)) {
        code = node.content.map(serializeInlineNode).join('');
      }
      const lang =
        isPlainObject(node.attrs) &&
        typeof node.attrs.language === 'string' &&
        node.attrs.language.trim()
          ? node.attrs.language.trim()
          : '';
      return '```' + lang + '\n' + code.replace(/\n+$/, '') + '\n```';
    }
    case 'bulletList': {
      const items = Array.isArray(node.content) ? node.content : [];
      return items
        .map((item) => serializeListItem(item, false, 0, listDepth))
        .filter((s) => s.length > 0)
        .join('\n');
    }
    case 'orderedList': {
      const items = Array.isArray(node.content) ? node.content : [];
      return items
        .map((item, i) => serializeListItem(item, true, i + 1, listDepth))
        .filter((s) => s.length > 0)
        .join('\n');
    }
    default:
      if (node.type === 'listItem') {
        return serializeListItem(node, false, 1, listDepth);
      }
      if (Array.isArray(node.content)) {
        return node.content
          .map((ch) => serializeBlock(ch, listDepth))
          .join('\n');
      }
      return '';
  }
}

function serializeListItem(
  item: unknown,
  ordered: boolean,
  index: number,
  depth: number,
): string {
  if (!isPlainObject(item) || item.type !== 'listItem') {
    return serializeBlock(item, depth);
  }
  const inner = (Array.isArray(item.content) ? item.content : [])
    .map((ch) => serializeBlock(ch, depth + 1))
    .filter((s) => s.length > 0)
    .join('\n');
  const indent = '  '.repeat(depth);
  const bullet = ordered ? `${index}. ` : '- ';
  const lines = inner.split('\n');
  if (lines.length === 0) return `${indent}${bullet}`;
  return lines
    .map((line, idx) =>
      idx === 0 ? `${indent}${bullet}${line}` : `${indent}  ${line}`,
    )
    .join('\n');
}

/** Returns empty string if `doc` is not a `doc` root. */
export function markdownFromEchoContentJson(doc: unknown): string {
  if (!isPlainObject(doc) || doc.type !== 'doc') return '';
  const out = serializeBlock(doc, 0);
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
