/**
 * Fill an empty `imageSlot` block in a v2 message body (author-only).
 */
import type pg from 'pg';
import { patchImageSlotFill } from '../../../shared/imageSlotContentJson';
import { isEchoMessageAuthorOrLinkedTwin } from './discordTwinMessageAuth';
import {
  selectEchoMessageAuthorDeleted,
  selectEchoMessageContentJsonRow,
  updateEchoMessageBodyJsonSql,
} from './echoMessagesDal';
import { filterMentionsForChannelContext } from './echoStore/mentionContext';
import {
  deriveMessagePlainText,
  projectPlainAndMentionsFromContentJson,
} from './messagePlainTextProjection';

export type ImageSlotFillInput = {
  imageUrl: string;
  storageKey?: string;
  width?: number;
  height?: number;
};

export type ImageSlotFillResult =
  | { ok: true; contentJson: unknown; content: string }
  | {
      ok: false;
      code:
        | 'not_found'
        | 'forbidden'
        | 'invalid_format'
        | 'slot_not_found'
        | 'slot_already_filled'
        | 'invalid_doc';
    };

export async function fillEchoMessageImageSlot(
  pool: pg.Pool,
  channelId: string,
  messageId: string,
  editorId: string,
  slotId: string,
  fill: ImageSlotFillInput,
): Promise<ImageSlotFillResult> {
  const meta = await selectEchoMessageAuthorDeleted(pool, channelId, messageId);
  if (!meta) return { ok: false, code: 'not_found' };
  if (meta.deleted) return { ok: false, code: 'forbidden' };
  if (meta.authorId !== editorId) {
    const twin = await isEchoMessageAuthorOrLinkedTwin(
      pool,
      editorId,
      meta.authorId,
    );
    if (!twin) return { ok: false, code: 'forbidden' };
  }
  if ((meta.messageFormatVersion ?? 1) < 2) {
    return { ok: false, code: 'invalid_format' };
  }

  const stored = await selectEchoMessageContentJsonRow(
    pool,
    channelId,
    messageId,
  );
  if (!stored?.contentJson) {
    return { ok: false, code: 'invalid_format' };
  }

  const patched = patchImageSlotFill(stored.contentJson, slotId, {
    imageUrl: fill.imageUrl,
    ...(fill.storageKey ? { storageKey: fill.storageKey } : {}),
    ...(fill.width != null ? { width: fill.width } : {}),
    ...(fill.height != null ? { height: fill.height } : {}),
  });
  if (!patched.ok) {
    if (patched.error === 'slot_not_found') {
      return { ok: false, code: 'slot_not_found' };
    }
    if (patched.error === 'slot_already_filled') {
      return { ok: false, code: 'slot_already_filled' };
    }
    return { ok: false, code: 'invalid_doc' };
  }

  const contentJson = patched.doc;
  const plain = deriveMessagePlainText(contentJson);
  const { mentions } = projectPlainAndMentionsFromContentJson(contentJson);
  const scopedMentions = await filterMentionsForChannelContext(
    pool,
    channelId,
    mentions,
  );
  const schemaVersion = stored.contentSchemaVersion ?? 2;

  await updateEchoMessageBodyJsonSql(pool, channelId, messageId, {
    content: plain,
    contentJson,
    searchIndexText: plain,
    mentions: scopedMentions ?? [],
    messageFormatVersion: 2,
    contentSchemaVersion: schemaVersion,
  });

  return { ok: true, contentJson, content: plain };
}
