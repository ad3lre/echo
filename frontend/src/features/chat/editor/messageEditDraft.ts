import type { MentionEntity } from '@shared/types';
import { plainTextFromEchoContentJson } from '@/features/chat/editor/echoContentJsonPlainText';
import { makeMentionEntity } from '@/features/chat/editor/composerModel';

export type MessageEditDraftSource = {
  content?: string;
  contentText?: string;
  contentJson?: unknown;
  messageFormatVersion?: number;
  mentions?: MentionEntity[];
};

/**
 * Plain text for the message-edit textarea — matches what users see in the bubble
 * (including @/# labels and custom emoji tokens), not only the legacy `content` column.
 */
export function editableTextFromMessage(msg: MessageEditDraftSource): string {
  const mf = msg.messageFormatVersion ?? 1;
  if (mf >= 2 && msg.contentJson !== undefined) {
    const fromJson = plainTextFromEchoContentJson(msg.contentJson).trim();
    if (fromJson) return fromJson;
  }
  return (msg.contentText ?? msg.content ?? '').trim();
}

/**
 * Re-attach mention entities after the user edits plain text (labels must still appear as
 * `@name` / `#channel` in the draft). New @-mentions typed in the textarea are not resolved.
 */
export function relocateMentionsInEditableText(
  text: string,
  templateMentions: MentionEntity[] | undefined,
): MentionEntity[] {
  if (!templateMentions?.length || !text) return [];
  const sorted = [...templateMentions].sort((a, b) => a.start - b.start);
  const out: MentionEntity[] = [];
  let searchFrom = 0;
  for (const t of sorted) {
    const needle = t.kind === 'channel' ? `#${t.label}` : `@${t.label}`;
    const idx = text.indexOf(needle, searchFrom);
    if (idx < 0) continue;
    const end = idx + needle.length;
    const overlaps = out.some((m) => idx < m.end && end > m.start);
    if (overlaps) continue;
    out.push(
      makeMentionEntity(
        {
          kind: t.kind,
          label: t.label,
          userId: t.userId,
          channelId: t.channelId,
          roleId: t.roleId,
        },
        idx,
      ),
    );
    searchFrom = end;
  }
  return out;
}
