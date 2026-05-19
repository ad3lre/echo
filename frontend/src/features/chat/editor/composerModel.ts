import { Node, mergeAttributes, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { MentionEntity } from '@shared/types';
import { findAllIdTokenMatches, linkTokenAppIcon } from '@/utils/idTokens';
import { randomUuidV4 } from '@/utils/randomUuid';
import type { IdTokenResolvers } from '@/composables/useMarkdown';

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function makeMentionId(): string {
  return randomUuidV4();
}

function normalizeMentions(
  content: string,
  mentions: MentionEntity[],
): MentionEntity[] {
  let lastEnd = -1;
  return [...mentions]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .filter((mention) => {
      if (
        mention.start < 0 ||
        mention.end <= mention.start ||
        mention.end > content.length
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

export function shiftMentionsForReplacement(
  content: string,
  mentions: MentionEntity[],
  start: number,
  end: number,
  insertedLength: number,
): MentionEntity[] {
  const delta = insertedLength - (end - start);
  return normalizeMentions(
    content,
    mentions.flatMap((mention) => {
      if (mention.end <= start) return [mention];
      if (mention.start >= end) {
        return [
          {
            ...mention,
            start: mention.start + delta,
            end: mention.end + delta,
          },
        ];
      }
      return [];
    }),
  );
}

function mentionDisplayText(mention: MentionEntity): string {
  return mention.kind === 'channel' ? `#${mention.label}` : `@${mention.label}`;
}

function tokenForCustomEmoji(
  name: string,
  id: string,
  animated: boolean,
): string {
  return animated ? `<a:${name}:${id}>` : `<:${name}:${id}>`;
}

function tokenForAppIcon(filename: string): string {
  return linkTokenAppIcon(filename);
}

function textSegmentToContent(text: string): JSONContent[] {
  if (!text) return [];
  const lines = text.split('\n');
  const out: JSONContent[] = [];
  lines.forEach((line, index) => {
    if (line) out.push({ type: 'text', text: line });
    if (index < lines.length - 1) out.push({ type: 'hardBreak' });
  });
  return out;
}

function rangesOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): boolean {
  return a0 < b1 && b0 < a1;
}

type MergeEvent =
  | { type: 'mention'; start: number; end: number; mention: MentionEntity }
  | {
      type: 'emoji';
      start: number;
      end: number;
      token: { name: string; id: string; animated: boolean };
    }
  | { type: 'appIcon'; start: number; end: number; filename: string };

function toInlineContent(
  content: string,
  mentions: MentionEntity[],
  resolvers?: IdTokenResolvers,
): JSONContent[] {
  const validMentions = normalizeMentions(content, mentions);
  const emojiEvents: MergeEvent[] = findAllIdTokenMatches(content)
    .flatMap((match) => {
      if (match.token.kind !== 'emoji') return [];
      return [
        {
          start: match.start,
          end: match.end,
          token: {
            name: match.token.name,
            id: match.token.id,
            animated: match.token.animated,
          },
        },
      ];
    })
    .filter(
      (match) =>
        !validMentions.some((mention) =>
          rangesOverlap(match.start, match.end, mention.start, mention.end),
        ),
    )
    .map((match) => ({
      type: 'emoji' as const,
      start: match.start,
      end: match.end,
      token: match.token,
    }));
  const iconEvents: MergeEvent[] = findAllIdTokenMatches(content)
    .filter(
      (match) =>
        match.token.kind === 'appIcon' &&
        !validMentions.some((mention) =>
          rangesOverlap(match.start, match.end, mention.start, mention.end),
        ),
    )
    .map((match) => ({
      type: 'appIcon' as const,
      start: match.start,
      end: match.end,
      filename:
        match.token.kind === 'appIcon' ? match.token.filename : 'icon.svg',
    }));
  const mentionEvents: MergeEvent[] = validMentions.map((mention) => ({
    type: 'mention' as const,
    start: mention.start,
    end: mention.end,
    mention,
  }));
  const events = [...mentionEvents, ...emojiEvents, ...iconEvents].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );

  const out: JSONContent[] = [];
  let cursor = 0;
  for (const event of events) {
    if (event.start > cursor) {
      out.push(...textSegmentToContent(content.slice(cursor, event.start)));
    }
    if (event.type === 'mention') {
      if (event.mention.kind === 'channel') {
        out.push({
          type: 'channelMention',
          attrs: {
            mentionId: event.mention.id,
            label: event.mention.label,
            channelId: event.mention.channelId ?? '',
          },
        });
      } else {
        out.push({
          type: 'mentionEntity',
          attrs: {
            mentionId: event.mention.id,
            kind: event.mention.kind,
            label: event.mention.label,
            userId: event.mention.userId ?? '',
            roleId: event.mention.roleId ?? '',
          },
        });
      }
    } else if (event.type === 'emoji') {
      out.push({
        type: 'customEmoji',
        attrs: {
          emojiId: event.token.id,
          name: event.token.name,
          animated: event.token.animated,
          imageUrl:
            resolvers?.customEmojiImageUrl?.(
              event.token.id,
              event.token.name,
              event.token.animated,
            ) ?? '',
        },
      });
    } else {
      out.push({
        type: 'appIcon',
        attrs: {
          filename: event.filename,
          imageUrl: resolvers?.appIconImageUrl?.(event.filename) ?? '',
        },
      });
    }
    cursor = event.end;
  }
  if (cursor < content.length) {
    out.push(...textSegmentToContent(content.slice(cursor)));
  }
  return out;
}

export function buildComposerDoc(
  content: string,
  mentions: MentionEntity[],
  resolvers?: IdTokenResolvers,
): JSONContent {
  const inline = toInlineContent(content, mentions, resolvers);
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: inline.length ? inline : undefined,
      },
    ],
  };
}

function mapParagraphChildToRawOffset(
  paragraph: ProseMirrorNode,
  blockStart: number,
  target: number,
  rawBase: number,
): { mapped: number | null; rawEnd: number } {
  let raw = rawBase;
  let mapped: number | null = null;

  paragraph.forEach((child, childFragOffset) => {
    if (mapped !== null) return;
    const pos = blockStart + 1 + childFragOffset;

    if (child.isText) {
      const text = child.text ?? '';
      const end = pos + text.length;
      if (target >= pos && target <= end) {
        mapped = raw + (target - pos);
      }
      raw += text.length;
      return;
    }
    if (child.type.name === 'hardBreak') {
      const nextRaw = raw + 1;
      if (target === pos) mapped = raw;
      if (target === pos + child.nodeSize) mapped = nextRaw;
      raw = nextRaw;
      return;
    }
    if (child.type.name === 'mentionEntity') {
      const len = `@${child.attrs.label ?? ''}`.length;
      const nextRaw = raw + len;
      if (target <= pos) mapped = raw;
      else if (target >= pos + child.nodeSize) mapped = nextRaw;
      raw = nextRaw;
      return;
    }
    if (child.type.name === 'channelMention') {
      const len = `#${child.attrs.label ?? ''}`.length;
      const nextRaw = raw + len;
      if (target <= pos) mapped = raw;
      else if (target >= pos + child.nodeSize) mapped = nextRaw;
      raw = nextRaw;
      return;
    }
    if (child.type.name === 'customEmoji') {
      const len = tokenForCustomEmoji(
        child.attrs.name ?? 'emoji',
        child.attrs.emojiId ?? '',
        Boolean(child.attrs.animated),
      ).length;
      const nextRaw = raw + len;
      if (target <= pos) mapped = raw;
      else if (target >= pos + child.nodeSize) mapped = nextRaw;
      raw = nextRaw;
      return;
    }
    if (child.type.name === 'appIcon') {
      const len = tokenForAppIcon(
        String(child.attrs.filename ?? 'icon.svg'),
      ).length;
      const nextRaw = raw + len;
      if (target <= pos) mapped = raw;
      else if (target >= pos + child.nodeSize) mapped = nextRaw;
      raw = nextRaw;
      return;
    }
  });

  return { mapped, rawEnd: raw };
}

function composerSerializedPlainLength(doc: ProseMirrorNode): number {
  let n = 0;
  doc.forEach((block, _, index) => {
    if (index > 0) n += 1;
    if (block.type.name === 'paragraph') {
      block.forEach((child) => {
        if (child.isText) {
          n += child.text?.length ?? 0;
          return;
        }
        if (child.type.name === 'hardBreak') {
          n += 1;
          return;
        }
        if (child.type.name === 'mentionEntity') {
          n += `@${String(child.attrs.label ?? '')}`.length;
          return;
        }
        if (child.type.name === 'channelMention') {
          n += `#${String(child.attrs.label ?? '')}`.length;
          return;
        }
        if (child.type.name === 'customEmoji') {
          n += tokenForCustomEmoji(
            String(child.attrs.name ?? 'emoji'),
            String(child.attrs.emojiId ?? ''),
            Boolean(child.attrs.animated),
          ).length;
          return;
        }
        if (child.type.name === 'appIcon') {
          n += tokenForAppIcon(
            String(child.attrs.filename ?? 'icon.svg'),
          ).length;
        }
      });
    } else {
      n += block.textContent.length;
    }
  });
  return n;
}

function mapSelectionToRawOffset(doc: ProseMirrorNode, target: number): number {
  let rawOffset = 0;
  let mapped: number | null = null;

  doc.forEach((block, fragmentOffset, index) => {
    if (mapped !== null) return;
    const blockStart = 1 + fragmentOffset;

    if (index > 0) {
      const nlAt = rawOffset;
      rawOffset += 1;
      if (target < blockStart) {
        mapped = nlAt;
        return;
      }
    }

    if (block.type.name === 'paragraph') {
      const inner = mapParagraphChildToRawOffset(
        block,
        blockStart,
        target,
        rawOffset,
      );
      if (inner.mapped !== null) mapped = inner.mapped;
      rawOffset = inner.rawEnd;
    } else {
      const t = block.textContent;
      const textStart = blockStart + 1;
      const textEnd = textStart + t.length;
      if (target >= textStart && target <= textEnd) {
        mapped = rawOffset + (target - textStart);
      }
      rawOffset += t.length;
    }
  });

  return mapped ?? rawOffset;
}

export function serializeComposerDoc(
  node: ProseMirrorNode,
  selection?: { from: number; to: number },
): {
  content: string;
  mentions: MentionEntity[];
  selectionStart: number;
  selectionEnd: number;
} {
  let content = '';
  const mentions: MentionEntity[] = [];

  node.forEach((block, _fragmentOffset, index) => {
    if (index > 0) content += '\n';
    if (block.type.name === 'paragraph') {
      block.forEach((child) => {
        if (child.isText) {
          content += child.text ?? '';
          return;
        }
        if (child.type.name === 'hardBreak') {
          content += '\n';
          return;
        }
        if (child.type.name === 'mentionEntity') {
          const start = content.length;
          const label = String(child.attrs.label ?? '');
          const text = `@${label}`;
          content += text;
          const k = child.attrs.kind;
          const kind: MentionEntity['kind'] =
            k === 'active'
              ? 'active'
              : k === 'everyone'
                ? 'everyone'
                : k === 'role'
                  ? 'role'
                  : 'user';
          mentions.push({
            id: String(child.attrs.mentionId || makeMentionId()),
            kind,
            label,
            start,
            end: start + text.length,
            ...(child.attrs.userId
              ? { userId: String(child.attrs.userId) }
              : {}),
            ...(kind === 'role' && child.attrs.roleId
              ? { roleId: String(child.attrs.roleId) }
              : {}),
          });
          return;
        }
        if (child.type.name === 'channelMention') {
          const start = content.length;
          const label = String(child.attrs.label ?? '');
          const text = `#${label}`;
          content += text;
          mentions.push({
            id: String(child.attrs.mentionId || makeMentionId()),
            kind: 'channel',
            label,
            start,
            end: start + text.length,
            ...(child.attrs.channelId
              ? { channelId: String(child.attrs.channelId) }
              : {}),
          });
          return;
        }
        if (child.type.name === 'customEmoji') {
          content += tokenForCustomEmoji(
            String(child.attrs.name ?? 'emoji'),
            String(child.attrs.emojiId ?? ''),
            Boolean(child.attrs.animated),
          );
          return;
        }
        if (child.type.name === 'appIcon') {
          content += tokenForAppIcon(
            String(child.attrs.filename ?? 'icon.svg'),
          );
          return;
        }
      });
    } else {
      content += block.textContent;
    }
  });

  const selectionStart = selection
    ? mapSelectionToRawOffset(node, selection.from)
    : content.length;
  const selectionEnd = selection
    ? mapSelectionToRawOffset(node, selection.to)
    : content.length;
  return {
    content,
    mentions: normalizeMentions(content, mentions),
    selectionStart,
    selectionEnd,
  };
}

export function rawOffsetToEditorPos(
  doc: ProseMirrorNode,
  rawTarget: number,
): number {
  const maxPos = Math.max(1, doc.nodeSize - 1);
  if (rawTarget <= 0) return 1;

  const serializedLen = composerSerializedPlainLength(doc);
  if (rawTarget >= serializedLen) return maxPos;

  let low = 1;
  let high = maxPos;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (mapSelectionToRawOffset(doc, mid) < rawTarget) low = mid + 1;
    else high = mid;
  }
  return low;
}

export const MentionEntityNode = Node.create({
  name: 'mentionEntity',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      mentionId: { default: '' },
      kind: { default: 'user' },
      label: { default: '' },
      userId: { default: '' },
      roleId: { default: '' },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const kind = String(HTMLAttributes.kind ?? 'user');
    const label = String(HTMLAttributes.label ?? '');
    const cls =
      kind === 'user'
        ? 'composer-mention'
        : kind === 'everyone' || kind === 'active' || kind === 'role'
          ? 'composer-mention composer-mention--special'
          : 'composer-mention';
    return [
      'span',
      mergeAttributes(
        { class: cls, 'data-mention-kind': kind },
        HTMLAttributes,
      ),
      `@${label}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label ?? ''}`;
  },
});

export const ChannelMentionNode = Node.create({
  name: 'channelMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      mentionId: { default: '' },
      label: { default: '' },
      channelId: { default: '' },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const label = String(HTMLAttributes.label ?? '');
    return [
      'span',
      mergeAttributes(
        { class: 'composer-mention composer-mention--channel' },
        HTMLAttributes,
      ),
      `#${label}`,
    ];
  },

  renderText({ node }) {
    return `#${node.attrs.label ?? ''}`;
  },
});

export const CustomEmojiNode = Node.create({
  name: 'customEmoji',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      emojiId: { default: '' },
      name: { default: '' },
      animated: { default: false },
      imageUrl: { default: '' },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const emojiId = String(HTMLAttributes.emojiId ?? '');
    const name = String(HTMLAttributes.name ?? 'emoji');
    const animated =
      HTMLAttributes.animated === true || HTMLAttributes.animated === 'true';
    const imageUrl = String(HTMLAttributes.imageUrl ?? '').trim();
    const token = `:${name}:`;
    const inner: [string, Record<string, unknown>, ...unknown[]] = imageUrl
      ? [
          'img',
          {
            class: 'emoji custom-emoji',
            draggable: 'false',
            alt: escapeAttr(token),
            title: escapeAttr(token),
            src: imageUrl,
          },
        ]
      : [
          'span',
          {
            class: 'composer-inline-glyph-fallback',
            title: escapeAttr(token),
            'aria-label': escapeAttr(token),
            role: 'img',
          },
          token,
        ];
    return [
      'span',
      {
        class: 'composer-custom-emoji',
        'data-emoji-id': emojiId,
        'data-emoji-name': name,
        'data-emoji-animated': animated ? 'true' : 'false',
        contenteditable: 'false',
      },
      inner,
    ];
  },

  renderText({ node }) {
    return tokenForCustomEmoji(
      String(node.attrs.name ?? 'emoji'),
      String(node.attrs.emojiId ?? ''),
      Boolean(node.attrs.animated),
    );
  },
});

export const AppIconNode = Node.create({
  name: 'appIcon',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      filename: { default: '' },
      imageUrl: { default: '' },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const filename = String(HTMLAttributes.filename ?? 'icon.svg');
    const imageUrl = String(HTMLAttributes.imageUrl ?? '').trim();
    const token = `:${filename.replace(/\.svg$/i, '')}:`;
    const inner: [string, Record<string, unknown>, ...unknown[]] = imageUrl
      ? [
          'img',
          {
            class: 'emoji app-inline-icon',
            draggable: 'false',
            alt: '',
            'aria-label': escapeAttr(token),
            title: escapeAttr(token),
            src: imageUrl,
          },
        ]
      : [
          'span',
          {
            class: 'composer-inline-glyph-fallback',
            title: escapeAttr(token),
            'aria-label': escapeAttr(token),
            role: 'img',
          },
          token,
        ];
    return [
      'span',
      {
        class: 'composer-app-icon',
        'data-app-icon': filename,
        contenteditable: 'false',
      },
      inner,
    ];
  },

  renderText({ node }) {
    return tokenForAppIcon(String(node.attrs.filename ?? 'icon.svg'));
  },
});

export function makeMentionEntity(
  mention: Pick<
    MentionEntity,
    'kind' | 'label' | 'userId' | 'channelId' | 'roleId'
  >,
  start: number,
): MentionEntity {
  const text = mentionDisplayText({
    id: '',
    kind: mention.kind,
    label: mention.label,
    start,
    end: start,
    userId: mention.userId,
    channelId: mention.channelId,
  });
  return {
    id: makeMentionId(),
    kind: mention.kind,
    label: mention.label,
    start,
    end: start + text.length,
    ...(mention.userId ? { userId: mention.userId } : {}),
    ...(mention.channelId ? { channelId: mention.channelId } : {}),
    ...(mention.roleId ? { roleId: mention.roleId } : {}),
  };
}
