import type pg from 'pg';
import type {
  MentionEntity,
  MessageAttachmentPayload,
} from '../../../../../../contracts/types';
import { isEchoMessageAuthorOrLinkedTwin } from '../../discord/discordTwinMessageAuth';
import {
  selectEchoMessageAuthorDeleted,
  softDeleteEchoMessageSql,
  updateEchoMessageBodyJsonSql,
  updateEchoMessageContentSql,
} from '../../echoMessagesDal';
import { filterMentionsForChannelContext } from './mentionContext';
import { deriveMessageComponentsFromContentJson } from '../../../../../../contracts/buttonRowContentJson';

export type EchoMessageEditBody =
  | {
      kind: 'legacy';
      content: string;
      /** When set, replaces `attachments` column (including `[]` to clear). Omit to leave unchanged. */
      attachments?: MessageAttachmentPayload[] | null;
    }
  | {
      kind: 'json';
      content: string;
      contentJson: unknown;
      searchIndexText: string;
      mentions?: MentionEntity[];
      contentSchemaVersion: number;
      attachments?: MessageAttachmentPayload[] | null;
    };

export type EchoMessageAuthorMeta = {
  authorId: string;
  deleted: boolean;
  messageFormatVersion: number;
};

export async function updateEchoMessageContent(
  pool: pg.Pool,
  channelId: string,
  messageId: string,
  editorId: string,
  body: EchoMessageEditBody,
  prevalidated?: EchoMessageAuthorMeta,
): Promise<'ok' | 'not_found' | 'forbidden'> {
  const row =
    prevalidated ??
    (await selectEchoMessageAuthorDeleted(pool, channelId, messageId));
  if (!row) return 'not_found';
  if (row.deleted) return 'forbidden';
  if (
    row.authorId !== editorId &&
    !(await isEchoMessageAuthorOrLinkedTwin(pool, editorId, row.authorId))
  ) {
    return 'forbidden';
  }

  if (body.kind === 'legacy') {
    await updateEchoMessageContentSql(
      pool,
      channelId,
      messageId,
      body.content,
      body.attachments,
    );
    return 'ok';
  }

  const scopedMentions = await filterMentionsForChannelContext(
    pool,
    channelId,
    body.mentions,
  );

  await updateEchoMessageBodyJsonSql(pool, channelId, messageId, {
    content: body.content,
    contentJson: body.contentJson,
    searchIndexText: body.searchIndexText,
    mentions: scopedMentions ?? [],
    messageFormatVersion: 2,
    contentSchemaVersion: body.contentSchemaVersion,
    attachments: body.attachments,
    components: deriveMessageComponentsFromContentJson(body.contentJson),
  });
  return 'ok';
}

export async function softDeleteEchoMessage(
  pool: pg.Pool,
  channelId: string,
  messageId: string,
  actorId: string,
  asModerator: boolean,
): Promise<'ok' | 'not_found' | 'forbidden'> {
  const row = await selectEchoMessageAuthorDeleted(pool, channelId, messageId);
  if (!row) return 'not_found';
  if (row.deleted) return 'forbidden';
  if (
    row.authorId !== actorId &&
    !asModerator &&
    !(await isEchoMessageAuthorOrLinkedTwin(pool, actorId, row.authorId))
  ) {
    return 'forbidden';
  }
  await softDeleteEchoMessageSql(pool, channelId, messageId);
  return 'ok';
}
