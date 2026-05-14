/**
 * Best-effort plain text from stored Echo TipTap JSON (v2), for clipboard / search fallbacks.
 * Mirrors node kinds allowed in `echoContentJsonForRender` / server validation.
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

function serializeInline(node: unknown): string {
  if (!isPlainObject(node)) return '';
  switch (node.type) {
    case 'text':
      return typeof node.text === 'string' ? node.text : '';
    case 'hardBreak':
      return '\n';
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
        return node.content.map(serializeInline).join('');
      }
      return '';
  }
}

function serializeBlock(node: unknown): string {
  if (!isPlainObject(node)) return '';
  switch (node.type) {
    case 'doc':
      return (Array.isArray(node.content) ? node.content : [])
        .map(serializeBlock)
        .filter((s) => s.length > 0)
        .join('\n');
    case 'paragraph':
    case 'heading':
      return Array.isArray(node.content)
        ? node.content.map(serializeInline).join('')
        : '';
    case 'blockquote':
    case 'listItem':
      return (Array.isArray(node.content) ? node.content : [])
        .map(serializeBlock)
        .join('\n');
    case 'bulletList':
    case 'orderedList':
      return (Array.isArray(node.content) ? node.content : [])
        .map(serializeBlock)
        .join('\n');
    case 'codeBlock': {
      if (typeof node.text === 'string') return node.text;
      if (Array.isArray(node.content)) {
        return node.content.map(serializeInline).join('');
      }
      return '';
    }
    default:
      if (Array.isArray(node.content)) {
        return node.content.map(serializeBlock).join('\n');
      }
      return '';
  }
}

/** Returns empty string if `doc` is not a recognizable doc root. */
export function plainTextFromEchoContentJson(doc: unknown): string {
  if (!isPlainObject(doc) || doc.type !== 'doc') return '';
  return serializeBlock(doc);
}
