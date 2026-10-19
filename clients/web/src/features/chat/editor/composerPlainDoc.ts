/**
 * TipTap-JSON builders that do **not** import `@tiptap/core` values.
 * Keeps AppLayout / message-edit paths off the rich-editor vendor chunk.
 */
import type { JSONContent } from '@tiptap/core';
import {
  docContainsRichContentJsonBlocks,
  rebuildContentJsonPreservingRichBlocks,
} from '@shared/richBlockContentJson';
import type { MentionEntity } from '@shared/types';
import {
  findAllIdTokenMatches,
  linkTokenAppIcon,
} from '@/features/layout/ids/idTokens';
import { randomUuidV4 } from '@/features/layout/ids/randomUuid';
import type { IdTokenResolvers } from '@/features/chat/markdown/useMarkdown';

export function makeMentionId(): string {
  return randomUuidV4();
}

export function normalizeMentions(
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

export function mentionDisplayText(mention: MentionEntity): string {
  return mention.kind === 'channel' ? `#${mention.label}` : `@${mention.label}`;
}

export function tokenForCustomEmoji(
  name: string,
  id: string,
  animated: boolean,
): string {
  return animated ? `<a:${name}:${id}>` : `<:${name}:${id}>`;
}

export function tokenForAppIcon(filename: string): string {
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
  const idTokenMatches = findAllIdTokenMatches(content);
  const emojiEvents: MergeEvent[] = idTokenMatches
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
  const iconEvents: MergeEvent[] = idTokenMatches
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

/** True when the composer has no user-visible text (whitespace-only counts as empty). */
export function isComposerContentEffectivelyEmpty(content: string): boolean {
  return content.trim().length === 0;
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

/** Rebuild a TipTap doc from serialized plain text without dropping rich blocks. */
export function buildComposerDocFromPlain(
  content: string,
  mentions: MentionEntity[],
  resolvers?: IdTokenResolvers,
  preserveFromDoc?: unknown,
): JSONContent {
  const needsRichRebuild =
    content.includes('\n') ||
    /!\[(?:image|button|buttonrow):/i.test(content) ||
    docContainsRichContentJsonBlocks(preserveFromDoc);
  if (!needsRichRebuild) {
    return buildComposerDoc(content, mentions, resolvers);
  }
  return rebuildContentJsonPreservingRichBlocks(
    preserveFromDoc ?? { type: 'doc', content: [] },
    content,
    mentions,
  ) as JSONContent;
}

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
