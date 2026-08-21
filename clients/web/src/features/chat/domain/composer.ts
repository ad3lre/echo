import {
  makeMentionEntity,
  shiftMentionsForReplacement,
} from '@/features/chat/editor/composerModel';
import type { MentionEntity, MentionKind } from '@shared/types';

export function replaceRangeTransform(
  content: string,
  mentions: MentionEntity[],
  start: number,
  end: number,
  text: string,
) {
  const nextContent = content.slice(0, start) + text + content.slice(end);
  const nextMentions = shiftMentionsForReplacement(
    nextContent,
    mentions,
    start,
    end,
    text.length,
  );
  const nextSelectionStart = start + text.length;
  const nextSelectionEnd = nextSelectionStart;
  return { nextContent, nextMentions, nextSelectionStart, nextSelectionEnd };
}

export function insertMentionTransform(
  content: string,
  mentions: MentionEntity[],
  start: number,
  end: number,
  kind: MentionKind,
  label: string,
  userId?: string,
  channelId?: string,
  roleId?: string,
) {
  const mentionText = `@${label}`;
  const replacement = `${mentionText} `;
  const nextContent =
    content.slice(0, start) + replacement + content.slice(end);
  const shiftedMentions = shiftMentionsForReplacement(
    nextContent,
    mentions,
    start,
    end,
    replacement.length,
  );
  const nextMentions = [
    ...shiftedMentions,
    makeMentionEntity(
      {
        kind,
        label,
        userId,
        channelId,
        roleId,
      },
      start,
    ),
  ];
  const nextSelectionStart = start + replacement.length;
  const nextSelectionEnd = nextSelectionStart;
  return { nextContent, nextMentions, nextSelectionStart, nextSelectionEnd };
}

export function insertChannelMentionTransform(
  content: string,
  mentions: MentionEntity[],
  start: number,
  end: number,
  channelName: string,
  channelId: string,
) {
  const mentionText = `#${channelName}`;
  const replacement = `${mentionText} `;
  const nextContent =
    content.slice(0, start) + replacement + content.slice(end);
  const shiftedMentions = shiftMentionsForReplacement(
    nextContent,
    mentions,
    start,
    end,
    replacement.length,
  );
  const nextMentions = [
    ...shiftedMentions,
    makeMentionEntity(
      { kind: 'channel', label: channelName, channelId },
      start,
    ),
  ];
  const nextSelectionStart = start + replacement.length;
  const nextSelectionEnd = nextSelectionStart;
  return { nextContent, nextMentions, nextSelectionStart, nextSelectionEnd };
}

export function wrapSelectionTransform(
  content: string,
  mentions: MentionEntity[],
  start: number,
  end: number,
  prefix: string,
  suffix = prefix,
) {
  if (start === end) return null;
  const selected = content.slice(start, end);
  const replacement = `${prefix}${selected}${suffix}`;
  const nextContent =
    content.slice(0, start) + replacement + content.slice(end);
  const nextMentions = shiftMentionsForReplacement(
    nextContent,
    mentions,
    start,
    end,
    replacement.length,
  );
  const nextSelectionStart = start + prefix.length;
  const nextSelectionEnd = nextSelectionStart + selected.length;
  return { nextContent, nextMentions, nextSelectionStart, nextSelectionEnd };
}
