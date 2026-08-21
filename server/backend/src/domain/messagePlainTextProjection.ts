/**
 * Sole product-path implementation: TipTap JSON → plain string for search_index_text / content.
 * @see docs/contracts/ECHO_CONTRACT_V2.md — INV-JSON-STRING
 */
import type { MentionEntity } from '../../../../contracts/types';
import { formatImageSlotToken } from '../../../../contracts/imageSlot';
import { formatButtonRowToken } from '../../../../contracts/buttonRow';
import { randomUUID } from 'node:crypto';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function makeMentionId(): string {
  return randomUUID();
}

/** Normalize mentions for storage (offsets into plain string). */
export function normalizeMentionsForPlain(
  plain: string,
  mentions: MentionEntity[],
): MentionEntity[] {
  let lastEnd = -1;
  return [...mentions]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .filter((mention) => {
      if (
        mention.start < 0 ||
        mention.end <= mention.start ||
        mention.end > plain.length
      )
        return false;
      if (mention.start < lastEnd) return false;
      if (
        mention.kind === 'user' &&
        (!mention.userId || !mention.userId.trim())
      )
        return false;
      if (
        mention.kind === 'channel' &&
        (!mention.channelId || !mention.channelId.trim())
      )
        return false;
      if (
        mention.kind === 'role' &&
        (!mention.roleId || !mention.roleId.trim())
      )
        return false;
      lastEnd = mention.end;
      return true;
    });
}

type WalkCtx = {
  parts: string[];
  mentions: MentionEntity[];
};

function appendText(ctx: WalkCtx, s: string): void {
  ctx.parts.push(s);
}

function sanitizeAppIconFilename(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return 'icon.svg';
  // Prevent control chars / brackets from escaping token shape.
  const cleaned = s.replace(/[<>\r\n\t]/g, '');
  // Keep it conservative: filenames like `message.svg`, `message-alt.svg`.
  if (!/^[a-z0-9_.-]+$/i.test(cleaned)) return 'icon.svg';
  return cleaned;
}

function walkNode(node: unknown, ctx: WalkCtx, depth: number): void {
  if (depth > 100 || node === null || node === undefined) return;
  if (!isPlainObject(node)) return;
  const type = node.type;
  if (typeof type !== 'string') return;

  switch (type) {
    case 'doc':
    case 'blockquote':
    case 'listItem': {
      const c = node.content;
      if (Array.isArray(c)) {
        for (const ch of c) walkNode(ch, ctx, depth + 1);
      }
      break;
    }
    case 'paragraph':
    case 'heading': {
      const c = node.content;
      if (Array.isArray(c)) {
        for (const ch of c) walkNode(ch, ctx, depth + 1);
      }
      appendText(ctx, '\n');
      break;
    }
    case 'bulletList':
    case 'orderedList': {
      const c = node.content;
      if (Array.isArray(c)) {
        for (const ch of c) walkNode(ch, ctx, depth + 1);
      }
      break;
    }
    case 'codeBlock': {
      const text = typeof node.text === 'string' ? node.text : '';
      appendText(ctx, text);
      appendText(ctx, '\n');
      break;
    }
    case 'text': {
      if (typeof node.text === 'string') appendText(ctx, node.text);
      break;
    }
    case 'hardBreak': {
      appendText(ctx, '\n');
      break;
    }
    case 'mentionEntity': {
      const attrs = node.attrs;
      const label =
        isPlainObject(attrs) && typeof attrs.label === 'string'
          ? attrs.label
          : '';
      const start = ctx.parts.join('').length;
      const piece = `@${label}`;
      appendText(ctx, piece);
      const kindRaw = isPlainObject(attrs) ? attrs.kind : undefined;
      const kind =
        kindRaw === 'everyone'
          ? 'everyone'
          : kindRaw === 'active'
            ? 'active'
            : kindRaw === 'role'
              ? 'role'
              : 'user';
      const userId =
        isPlainObject(attrs) && typeof attrs.userId === 'string'
          ? attrs.userId
          : undefined;
      const roleId =
        isPlainObject(attrs) && typeof attrs.roleId === 'string'
          ? attrs.roleId
          : undefined;
      const mid =
        isPlainObject(attrs) &&
        typeof attrs.mentionId === 'string' &&
        attrs.mentionId.trim()
          ? attrs.mentionId.trim()
          : makeMentionId();
      ctx.mentions.push({
        id: mid,
        kind,
        label,
        start,
        end: start + piece.length,
        ...(userId ? { userId } : {}),
        ...(kind === 'role' && roleId ? { roleId } : {}),
      });
      break;
    }
    case 'channelMention': {
      const attrs = node.attrs;
      const label =
        isPlainObject(attrs) && typeof attrs.label === 'string'
          ? attrs.label
          : '';
      const channelId =
        isPlainObject(attrs) && typeof attrs.channelId === 'string'
          ? attrs.channelId
          : '';
      const start = ctx.parts.join('').length;
      const piece = `#${label}`;
      appendText(ctx, piece);
      const mid =
        isPlainObject(attrs) &&
        typeof attrs.mentionId === 'string' &&
        attrs.mentionId.trim()
          ? attrs.mentionId.trim()
          : makeMentionId();
      ctx.mentions.push({
        id: mid,
        kind: 'channel',
        label,
        start,
        end: start + piece.length,
        ...(channelId ? { channelId } : {}),
      });
      break;
    }
    case 'customEmoji': {
      const attrs = node.attrs;
      const name =
        isPlainObject(attrs) && typeof attrs.name === 'string'
          ? attrs.name
          : 'emoji';
      const emojiId =
        isPlainObject(attrs) && typeof attrs.emojiId === 'string'
          ? attrs.emojiId
          : '';
      const animated = isPlainObject(attrs) && attrs.animated === true;
      const piece = animated
        ? `<a:${name}:${emojiId}>`
        : `<:${name}:${emojiId}>`;
      appendText(ctx, piece);
      break;
    }
    case 'appIcon': {
      const attrs = node.attrs;
      const filename = isPlainObject(attrs)
        ? sanitizeAppIconFilename(attrs.filename)
        : 'icon.svg';
      appendText(ctx, `<icon:${filename}>`);
      break;
    }
    case 'imageSlot': {
      const attrs = node.attrs;
      if (!isPlainObject(attrs)) break;
      const slotId =
        typeof attrs.slotId === 'string' ? attrs.slotId.trim() : '';
      const aspectW =
        typeof attrs.aspectW === 'number' && Number.isFinite(attrs.aspectW)
          ? Math.floor(attrs.aspectW)
          : 0;
      const aspectH =
        typeof attrs.aspectH === 'number' && Number.isFinite(attrs.aspectH)
          ? Math.floor(attrs.aspectH)
          : 0;
      if (!slotId || aspectW <= 0 || aspectH <= 0) break;
      appendText(ctx, formatImageSlotToken({ slotId, aspectW, aspectH }));
      appendText(ctx, '\n');
      break;
    }
    case 'buttonRow': {
      const attrs = node.attrs;
      if (!isPlainObject(attrs)) break;
      const rowId = typeof attrs.rowId === 'string' ? attrs.rowId.trim() : '';
      if (!rowId) break;
      appendText(ctx, formatButtonRowToken({ rowId }));
      appendText(ctx, '\n');
      break;
    }
    default:
      break;
  }
}

/**
 * Project JSON doc to plain text + mentions (server authority for v2).
 */
export function projectPlainAndMentionsFromContentJson(doc: unknown): {
  plain: string;
  mentions: MentionEntity[];
} {
  const ctx: WalkCtx = { parts: [], mentions: [] };
  walkNode(doc, ctx, 0);
  let plain = ctx.parts.join('');
  if (plain.endsWith('\n')) {
    let end = plain.length;
    while (end > 0 && plain[end - 1] === '\n') end--;
    plain = plain.slice(0, end);
  }
  const mentions = normalizeMentionsForPlain(plain, ctx.mentions);
  return { plain, mentions };
}

/**
 * Single exported plain derivation for persistence and search materialization.
 */
export function deriveMessagePlainText(contentJson: unknown): string {
  return projectPlainAndMentionsFromContentJson(contentJson).plain;
}
