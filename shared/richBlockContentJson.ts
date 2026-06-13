/**
 * Rebuild and display helpers for image-slot and button-row rich blocks in v2 docs.
 */
import {
  filledImageSlotAttrsById,
  imageSlotNodeFromAttrs,
  readSlotAttrs,
  type ImageSlotSegment,
  docContainsImageSlots,
} from './imageSlotContentJson';
import { parseImageSlotToken, type ImageSlotAttrs } from './imageSlot';
import {
  type ButtonRowSegment,
  buttonRowNodeFromAttrs,
  buttonRowsById,
  readRowAttrs as readButtonRowAttrs,
} from './buttonRowContentJson';
import { parseButtonRowToken } from './buttonRow';

export type { ImageSlotSegment };

type InlineMention = {
  kind: string;
  label: string;
  start: number;
  end: number;
  userId?: string;
  channelId?: string;
  roleId?: string;
  mentionId?: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function paragraphFromPlainLine(
  line: string,
  lineStartInPlain: number,
  mentions: InlineMention[] | undefined,
): Record<string, unknown> {
  const inline: Record<string, unknown>[] = [];
  const lineEnd = lineStartInPlain + line.length;
  const lineMentions = (mentions ?? [])
    .filter((m) => m.start >= lineStartInPlain && m.end <= lineEnd)
    .map((m) => ({
      ...m,
      start: m.start - lineStartInPlain,
      end: m.end - lineStartInPlain,
    }))
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const m of lineMentions) {
    if (m.start > cursor) {
      inline.push({ type: 'text', text: line.slice(cursor, m.start) });
    }
    if (m.kind === 'channel') {
      inline.push({
        type: 'channelMention',
        attrs: {
          label: m.label,
          channelId: m.channelId ?? '',
          mentionId: m.mentionId ?? '',
        },
      });
    } else {
      inline.push({
        type: 'mentionEntity',
        attrs: {
          kind: m.kind,
          label: m.label,
          userId: m.userId ?? '',
          roleId: m.roleId ?? '',
          mentionId: m.mentionId ?? '',
        },
      });
    }
    cursor = m.end;
  }
  if (cursor < line.length) {
    inline.push({ type: 'text', text: line.slice(cursor) });
  }
  return {
    type: 'paragraph',
    content: inline.length ? inline : undefined,
  };
}

/**
 * Rebuild v2 doc from edited plain text while preserving image slots and button rows.
 */
export function rebuildContentJsonPreservingRichBlocks(
  originalDoc: unknown,
  editedPlain: string,
  mentions?: InlineMention[],
): Record<string, unknown> {
  const filledById = filledImageSlotAttrsById(originalDoc);
  const rowsById = buttonRowsById(originalDoc);
  const plain = editedPlain.replace(/\r\n/g, '\n');
  const blocks: Record<string, unknown>[] = [];

  if (!plain.length) {
    return { type: 'doc', content: blocks };
  }

  const lines = plain.split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    offset += line.length + 1;

    const trimmed = line.trim();
    if (!trimmed) {
      if (line.length === 0 && i < lines.length - 1) {
        blocks.push({ type: 'paragraph' });
      }
      continue;
    }

    const isWholeLineToken =
      trimmed === line.trim() && line.trim().length === trimmed.length;

    const imageParsed = parseImageSlotToken(trimmed);
    if (imageParsed && isWholeLineToken) {
      const prior = filledById.get(imageParsed.slotId);
      const attrs: ImageSlotAttrs = prior
        ? {
            slotId: imageParsed.slotId,
            aspectW: imageParsed.aspectW,
            aspectH: imageParsed.aspectH,
            imageUrl: prior.imageUrl,
            storageKey: prior.storageKey,
            width: prior.width,
            height: prior.height,
          }
        : {
            slotId: imageParsed.slotId,
            aspectW: imageParsed.aspectW,
            aspectH: imageParsed.aspectH,
            imageUrl: null,
            storageKey: null,
            width: null,
            height: null,
          };
      blocks.push(imageSlotNodeFromAttrs(attrs));
      continue;
    }

    const buttonParsed = parseButtonRowToken(trimmed);
    if (buttonParsed && isWholeLineToken) {
      const prior = rowsById.get(buttonParsed.rowId);
      if (prior) {
        blocks.push(buttonRowNodeFromAttrs(prior));
      }
      continue;
    }

    blocks.push(paragraphFromPlainLine(line, lineStart, mentions));
  }

  if (!blocks.length) {
    blocks.push({ type: 'paragraph' });
  }

  return { type: 'doc', content: blocks };
}

export function rebuildContentJsonPreservingSlots(
  originalDoc: unknown,
  editedPlain: string,
  mentions?: InlineMention[],
): Record<string, unknown> {
  return rebuildContentJsonPreservingRichBlocks(
    originalDoc,
    editedPlain,
    mentions,
  );
}

export type ContentJsonDisplaySegment =
  | { type: 'text'; text: string }
  | ImageSlotSegment
  | ButtonRowSegment;

function countButtonRowsInDoc(doc: unknown): number {
  if (
    !isPlainObject(doc) ||
    doc.type !== 'doc' ||
    !Array.isArray(doc.content)
  ) {
    return 0;
  }
  return doc.content.filter(
    (node) => isPlainObject(node) && node.type === 'buttonRow',
  ).length;
}

export function docContainsRichContentJsonBlocks(doc: unknown): boolean {
  return docContainsImageSlots(doc) || countButtonRowsInDoc(doc) > 0;
}

export function buildContentJsonDisplaySegments(
  contentJson: unknown,
): ContentJsonDisplaySegment[] {
  if (!isPlainObject(contentJson) || contentJson.type !== 'doc') return [];
  const content = contentJson.content;
  if (!Array.isArray(content)) return [];

  const out: ContentJsonDisplaySegment[] = [];
  for (const node of content) {
    if (!isPlainObject(node)) continue;
    if (node.type === 'imageSlot') {
      const attrs = readSlotAttrs(node.attrs);
      if (!attrs) continue;
      out.push({
        type: 'imageSlot',
        slotId: attrs.slotId,
        aspectW: attrs.aspectW,
        aspectH: attrs.aspectH,
        imageUrl: attrs.imageUrl,
        storageKey: attrs.storageKey,
        width: attrs.width,
        height: attrs.height,
      });
      continue;
    }
    if (node.type === 'buttonRow') {
      const row = readButtonRowAttrs(node.attrs);
      if (!row) continue;
      out.push({
        type: 'buttonRow',
        rowId: row.rowId,
        buttons: row.buttons,
      });
      continue;
    }
    const text = serializeBlockNodeToPlain(node);
    if (text.length > 0) {
      out.push({ type: 'text', text });
    }
  }
  return out;
}

function serializeChildBlocks(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((ch) => (isPlainObject(ch) ? serializeBlockNodeToPlain(ch) : ''))
    .join('\n');
}

function serializeInlineToPlain(node: unknown): string {
  if (!isPlainObject(node)) return '';
  switch (node.type) {
    case 'text':
      return typeof node.text === 'string' ? node.text : '';
    case 'hardBreak':
      return '\n';
    case 'mentionEntity': {
      const attrs = node.attrs;
      const label =
        isPlainObject(attrs) && typeof attrs.label === 'string'
          ? attrs.label
          : '';
      return `@${label}`;
    }
    case 'channelMention': {
      const attrs = node.attrs;
      const label =
        isPlainObject(attrs) && typeof attrs.label === 'string'
          ? attrs.label
          : '';
      return `#${label}`;
    }
    case 'customEmoji': {
      const attrs = node.attrs;
      if (!isPlainObject(attrs)) return '';
      const name = typeof attrs.name === 'string' ? attrs.name : 'emoji';
      const id = typeof attrs.emojiId === 'string' ? attrs.emojiId : '';
      return attrs.animated === true ? `<a:${name}:${id}>` : `<:${name}:${id}>`;
    }
    case 'appIcon': {
      const attrs = node.attrs;
      const filename =
        isPlainObject(attrs) && typeof attrs.filename === 'string'
          ? attrs.filename
          : 'icon.svg';
      const stem = filename.replace(/\.svg$/i, '').trim();
      return `:${stem.replace(/\s+/g, '_').toLowerCase()}:`;
    }
    default:
      if (Array.isArray(node.content)) {
        return node.content.map(serializeInlineToPlain).join('');
      }
      return '';
  }
}

function serializeBlockNodeToPlain(node: Record<string, unknown>): string {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return Array.isArray(node.content)
        ? node.content.map(serializeInlineToPlain).join('')
        : '';
    case 'blockquote':
    case 'listItem':
    case 'bulletList':
    case 'orderedList':
      return serializeChildBlocks(node.content);
    case 'codeBlock':
      if (typeof node.text === 'string') return node.text;
      return Array.isArray(node.content)
        ? node.content.map(serializeInlineToPlain).join('')
        : '';
    default:
      return serializeChildBlocks(node.content);
  }
}
