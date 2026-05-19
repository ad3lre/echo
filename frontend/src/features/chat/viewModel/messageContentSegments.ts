import type { Embed, MentionEntity } from '@shared/types';
import type { MagicTimeRenderContext } from './magicTimeMarkdown';
import {
  parseMessageContent,
  type IdTokenResolvers,
} from './messageBodyMarkdown';
import {
  applyMagicTimeToPlaintext,
  buildMagicTimeParseCacheExtra,
  replaceMagicTimePlaceholdersInHtml,
} from './magicTimeMarkdown';
import { splitContentByEchoInviteLinks } from '@/utils/inviteEmbedParse';
import { splitContentByEchoJumpEmbeds } from '@/utils/messageJumpContentParse';

export type { MagicTimeRenderContext } from './magicTimeMarkdown';
export type EchoMessageContentSegment =
  | { type: 'text'; text: string }
  | { type: 'invite'; url: string }
  | { type: 'jump'; url: string; embed: Embed };

export type EchoRenderedMessageRow =
  | { type: 'text'; text: string; html: string }
  | { type: 'invite'; url: string }
  | { type: 'jump'; url: string; embed: Embed };

export function buildEchoMessageContentSegments(
  content: string | undefined,
  embeds: Embed[] | undefined,
): EchoMessageContentSegment[] {
  const jumpParts = splitContentByEchoJumpEmbeds(content ?? '', embeds);
  const flat: EchoMessageContentSegment[] = [];
  for (const p of jumpParts) {
    if (p.type === 'jump') {
      flat.push(p);
      continue;
    }
    for (const iv of splitContentByEchoInviteLinks(p.text)) {
      if (iv.type === 'invite') {
        flat.push(iv);
      } else if (iv.text) {
        flat.push({ type: 'text', text: iv.text });
      }
    }
  }
  return flat;
}

export function buildRenderedEchoMessageSegments(
  content: string | undefined,
  embeds: Embed[] | undefined,
  mentions?: MentionEntity[],
  parseIdResolvers?: IdTokenResolvers,
  magicTime?: MagicTimeRenderContext | null,
): EchoRenderedMessageRow[] {
  const raw = buildEchoMessageContentSegments(content, embeds);
  return raw.map((seg) => {
    if (seg.type === 'text') {
      if (magicTime) {
        const { text: z, slots } = applyMagicTimeToPlaintext(
          seg.text,
          magicTime,
        );
        let html = parseMessageContent(z, mentions, parseIdResolvers, 0, {
          parseCacheExtra: buildMagicTimeParseCacheExtra(magicTime),
        });
        html = replaceMagicTimePlaceholdersInHtml(html, slots);
        return { type: 'text', text: seg.text, html };
      }
      return {
        type: 'text',
        text: seg.text,
        html: parseMessageContent(seg.text, mentions, parseIdResolvers),
      };
    }
    return seg;
  });
}

export function echoMessageSegmentRowKey(
  seg: EchoMessageContentSegment | EchoRenderedMessageRow,
  index: number,
): string {
  if (seg.type === 'jump') return `j-${index}-${seg.url}`;
  if (seg.type === 'invite') return `i-${index}-${seg.url}`;
  return `t-${index}-${seg.text.slice(0, 24)}`;
}
