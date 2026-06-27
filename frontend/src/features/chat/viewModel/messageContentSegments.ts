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
import {
  appendOrphanEchoJumpEmbedSegments,
  splitContentByEchoJumpEmbeds,
} from '@/utils/messageJumpContentParse';
import {
  buildContentJsonDisplaySegments,
  docContainsRichContentJsonBlocks,
} from '@shared/richBlockContentJson';
import type { ButtonRowButton } from '@shared/buttonRow';

export type { MagicTimeRenderContext } from './magicTimeMarkdown';
export type EchoMessageContentSegment =
  | { type: 'text'; text: string }
  | { type: 'invite'; url: string }
  | { type: 'jump'; url: string; embed: Embed }
  | {
      type: 'imageSlot';
      slotId: string;
      aspectW: number;
      aspectH: number;
      imageUrl?: string | null;
      storageKey?: string | null;
      width?: number | null;
      height?: number | null;
    }
  | {
      type: 'buttonRow';
      rowId: string;
      buttons: ButtonRowButton[];
    };

export type EchoRenderedMessageRow =
  | { type: 'text'; text: string; html: string }
  | { type: 'invite'; url: string }
  | { type: 'jump'; url: string; embed: Embed }
  | {
      type: 'imageSlot';
      slotId: string;
      aspectW: number;
      aspectH: number;
      imageUrl?: string | null;
      storageKey?: string | null;
      width?: number | null;
      height?: number | null;
    }
  | {
      type: 'buttonRow';
      rowId: string;
      buttons: ButtonRowButton[];
    };

function splitTextChunkToSegments(text: string): EchoMessageContentSegment[] {
  const out: EchoMessageContentSegment[] = [];
  for (const iv of splitContentByEchoInviteLinks(text)) {
    if (iv.type === 'invite') {
      out.push(iv);
    } else if (iv.text) {
      out.push({ type: 'text', text: iv.text });
    }
  }
  return out;
}

export function buildEchoMessageContentSegments(
  content: string | undefined,
  embeds: Embed[] | undefined,
  contentJson?: unknown,
): EchoMessageContentSegment[] {
  const jsonSegments = buildContentJsonDisplaySegments(contentJson);
  const hasRichBlocks = docContainsRichContentJsonBlocks(contentJson);
  if (hasRichBlocks) {
    const flat: EchoMessageContentSegment[] = [];
    for (const seg of jsonSegments) {
      if (seg.type === 'imageSlot') {
        flat.push({
          type: 'imageSlot',
          slotId: seg.slotId,
          aspectW: seg.aspectW,
          aspectH: seg.aspectH,
          imageUrl: seg.imageUrl,
          storageKey: seg.storageKey,
          width: seg.width,
          height: seg.height,
        });
        continue;
      }
      if (seg.type === 'buttonRow') {
        flat.push({
          type: 'buttonRow',
          rowId: seg.rowId,
          buttons: seg.buttons,
        });
        continue;
      }
      const jumpParts = splitContentByEchoJumpEmbeds(seg.text, embeds);
      for (const p of jumpParts) {
        if (p.type === 'jump') {
          flat.push(p);
          continue;
        }
        flat.push(...splitTextChunkToSegments(p.text));
      }
    }
    return appendOrphanEchoJumpEmbedSegments(
      flat,
      content ?? '',
      contentJson,
      embeds,
    );
  }

  const jumpParts = splitContentByEchoJumpEmbeds(content ?? '', embeds);
  const flat: EchoMessageContentSegment[] = [];
  for (const p of jumpParts) {
    if (p.type === 'jump') {
      flat.push(p);
      continue;
    }
    flat.push(...splitTextChunkToSegments(p.text));
  }
  return appendOrphanEchoJumpEmbedSegments(
    flat,
    content ?? '',
    contentJson,
    embeds,
  );
}

export function buildRenderedEchoMessageSegments(
  content: string | undefined,
  embeds: Embed[] | undefined,
  mentions?: MentionEntity[],
  parseIdResolvers?: IdTokenResolvers,
  magicTime?: MagicTimeRenderContext | null,
  contentJson?: unknown,
): EchoRenderedMessageRow[] {
  const raw = buildEchoMessageContentSegments(content, embeds, contentJson);
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
  if (seg.type === 'imageSlot') return `s-${index}-${seg.slotId}`;
  if (seg.type === 'buttonRow') return `b-${index}-${seg.rowId}`;
  return `t-${index}-${seg.text.slice(0, 24)}`;
}
