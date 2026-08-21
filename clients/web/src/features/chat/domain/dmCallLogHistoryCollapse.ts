import type { MessageWithAuthor } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { buildMessageWithAuthor } from '@/features/chat/domain/messageWithAuthor';

/** Max contiguous DM call log rows shown before folding older entries behind “See more”. */
export const DM_CALL_LOG_HISTORY_VISIBLE_CAP = 4;

export const DM_CALL_ROLLUP_MESSAGE_ID_PREFIX = '__echo_dm_call_roll:';

export function isDmCallLocalLogEntity(
  entity: RawMessage | undefined,
): boolean {
  const id = entity?.id?.trim() ?? '';
  return id.startsWith('local_dm_call_log:');
}

export function isDmCallRollupCollapseMessageId(
  messageId: string | undefined,
): boolean {
  return !!messageId?.startsWith(DM_CALL_ROLLUP_MESSAGE_ID_PREFIX);
}

/** Parse synthetic rollup id: `__echo_dm_call_roll:<channelId>:<firstHiddenMessageId>` */
export function parseDmCallRollupMessageId(messageId: string): {
  channelId: string;
  firstHiddenMessageId: string;
} | null {
  const prefix = DM_CALL_ROLLUP_MESSAGE_ID_PREFIX;
  if (!messageId.startsWith(prefix)) return null;
  const rest = messageId.slice(prefix.length);
  const colon = rest.indexOf(':');
  if (colon <= 0) return null;
  const channelId = rest.slice(0, colon);
  const firstHiddenMessageId = rest.slice(colon + 1);
  if (!channelId.trim() || !firstHiddenMessageId.trim()) return null;
  return { channelId, firstHiddenMessageId };
}

export function dmCallRollupRevealKey(
  channelId: string,
  firstHiddenMessageId: string,
): string {
  return `${channelId.trim()}:${firstHiddenMessageId.trim()}`;
}

function buildRollupSynthetic(
  rollupId: string,
  hiddenCount: number,
  timestampIso: string,
): { raw: RawMessage; row: MessageWithAuthor } {
  const raw: RawMessage = {
    id: rollupId,
    authorId: 'system',
    systemMessage: true,
    authorDisplayName: 'Call',
    timestamp: timestampIso,
    content:
      hiddenCount === 1 ? '1 earlier call' : `${hiddenCount} earlier calls`,
    contentText:
      hiddenCount === 1 ? '1 earlier call' : `${hiddenCount} earlier calls`,
  };
  const row = buildMessageWithAuthor(raw, new Map(), {});
  return { raw, row };
}

export type DmCallLogPresentation = {
  displayOrderedIds: string[];
  mergedEntities: Map<string, RawMessage>;
  mergedMessages: Map<string, MessageWithAuthor & { channelName?: string }>;
};

/**
 * Collapses long runs of local DM call log rows: keeps the newest
 * {@link DM_CALL_LOG_HISTORY_VISIBLE_CAP} and folds older ones behind one rollup row.
 */
export function buildDmCallLogPresentation(
  rawOrderedIds: readonly string[],
  entities: ReadonlyMap<string, RawMessage>,
  messages: Map<string, MessageWithAuthor & { channelName?: string }>,
  channelId: string | undefined,
  revealKeys: ReadonlySet<string>,
): DmCallLogPresentation {
  const cid = channelId?.trim() ?? '';
  const mergedEntities = new Map<string, RawMessage>(
    entities as Map<string, RawMessage>,
  );
  const mergedMessages = new Map<
    string,
    MessageWithAuthor & { channelName?: string }
  >(messages);

  const displayOrderedIds: string[] = [];
  let i = 0;
  const n = rawOrderedIds.length;

  while (i < n) {
    const id0 = rawOrderedIds[i]!;
    const ent0 = entities.get(id0);
    if (!isDmCallLocalLogEntity(ent0)) {
      displayOrderedIds.push(id0);
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < n) {
      const e = entities.get(rawOrderedIds[j]!);
      if (!isDmCallLocalLogEntity(e)) break;
      j += 1;
    }
    const run = rawOrderedIds.slice(i, j);
    const revealKey = cid && run[0] ? dmCallRollupRevealKey(cid, run[0]) : '';
    const shouldCollapse =
      cid &&
      run.length > DM_CALL_LOG_HISTORY_VISIBLE_CAP &&
      revealKey &&
      !revealKeys.has(revealKey);

    if (!shouldCollapse) {
      displayOrderedIds.push(...run);
      i = j;
      continue;
    }

    const hidden = run.slice(0, -DM_CALL_LOG_HISTORY_VISIBLE_CAP);
    const visible = run.slice(-DM_CALL_LOG_HISTORY_VISIBLE_CAP);
    const firstHiddenEntity = entities.get(hidden[0]!);
    const ts = firstHiddenEntity?.timestamp ?? new Date().toISOString();
    const rollupId = `${DM_CALL_ROLLUP_MESSAGE_ID_PREFIX}${cid}:${hidden[0]!}`;
    const { raw, row } = buildRollupSynthetic(rollupId, hidden.length, ts);
    mergedEntities.set(rollupId, raw);
    mergedMessages.set(rollupId, row);
    displayOrderedIds.push(rollupId, ...visible);
    i = j;
  }

  return { displayOrderedIds, mergedEntities, mergedMessages };
}
