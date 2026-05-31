import { echoT } from '@/i18n';
import { loadTimeLanguagePreferences } from '@/features/settings/timeLanguagePreferences';
import type { MessageWithAuthor } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { fingerprintMessageReactions } from '@/features/chat/viewModel/messageWithAuthor';
import {
  isMessageGroupedWithNext,
  isMessageGroupedWithPrevious,
} from '@/features/chat/viewModel/messageListGrouping';

export type MessageWithAuthorRow = MessageWithAuthor & { channelName?: string };

/**
 * Precomputed per-row presentation for the message list. Built in one pass in the
 * view model — not during bubble render. Grouping rules are centralized here + grouping
 * helpers — see `@/features/chat/domain/viewportContract`.
 *
 * Depends only on ordered ids, message/entity maps, and list chrome flags — not on
 * hover, quick actions, context menu, editing, selection, or jump/scrolling UI. Keep
 * those in bubble-local state or UI that does not drive row-facts recomputation.
 */
export interface MessageListRowFacts {
  groupedWithPrevious: boolean;
  groupedWithNext: boolean;
  /** Header row: avatar + author name + inline timestamp in MessageHeader */
  showAvatar: boolean;
  showHeaderTimestamp: boolean;
  /** Continuation row: narrow gutter with hover-only short time */
  showGutterHoverTime: boolean;
  /** Day-change divider rendered above this row */
  showDaySeparatorBefore: boolean;
  /** Label for the day divider (e.g. Today, Yesterday, or calendar date) */
  daySeparatorLabel: string;
  /** Resolved quoted message for reply preview — same rules as former `replyMessageAt` */
  replyTargetResolved: MessageWithAuthorRow | undefined;
  /** List-level tight top padding (voice side chat); passed through for row styling if needed */
  compactTop: boolean;
}

function pollFingerprint(poll: RawMessage['poll'] | undefined): string {
  if (!poll) return '';
  const optionBits = poll.options
    .map(
      (opt) =>
        `${opt.id}\x1f${opt.votes}\x1f${opt.voterIds.join(',')}\x1f${opt.text}\x1f${opt.emoji ?? ''}`,
    )
    .join('\x1d');
  return `${poll.question}\x1e${poll.endsAt ?? ''}\x1e${poll.anonymous === true ? '1' : '0'}\x1e${optionBits}`;
}

function localDayKey(iso: string | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function shouldShowDaySeparatorBefore(
  orderedIds: readonly string[],
  messagesMap: Map<string, MessageWithAuthor>,
  index: number,
): boolean {
  if (index === 0) return true;
  const curId = orderedIds[index];
  const prevId = orderedIds[index - 1];
  if (!curId || !prevId) return index === 0;
  const cur = messagesMap.get(curId);
  const prev = messagesMap.get(prevId);
  if (!cur || !prev) return true;
  return localDayKey(cur.timestamp) !== localDayKey(prev.timestamp);
}

/** Bounded cache for expensive `toLocaleDateString` paths (locale is session-stable). */
const DAY_SEPARATOR_LONG_LABEL_MAX = 128;
const daySeparatorLongLabelByDayKey = new Map<string, string>();

/**
 * Short date label for the sticky day divider (local calendar day).
 */
export function formatMessageListDaySeparatorLabel(
  iso: string | undefined,
): string {
  if (!iso?.trim()) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const msgKey = localDayKey(iso);
  if (!msgKey) return '';
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (msgKey === todayKey) return echoT('time.today');
  const y = new Date(now.getTime() - 864e5);
  const yesterdayKey = `${y.getFullYear()}-${y.getMonth()}-${y.getDate()}`;
  if (msgKey === yesterdayKey) return echoT('time.yesterday');
  const hit = daySeparatorLongLabelByDayKey.get(msgKey);
  if (hit !== undefined) return hit;
  if (daySeparatorLongLabelByDayKey.size >= DAY_SEPARATOR_LONG_LABEL_MAX) {
    const oldest = daySeparatorLongLabelByDayKey.keys().next().value;
    if (oldest !== undefined) daySeparatorLongLabelByDayKey.delete(oldest);
  }
  const formatted = d.toLocaleDateString(loadTimeLanguagePreferences().locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  daySeparatorLongLabelByDayKey.set(msgKey, formatted);
  return formatted;
}

export function resolveReplyTargetForRow(
  message: MessageWithAuthorRow,
  visibleMessages: Map<string, MessageWithAuthorRow>,
  entitiesById: ReadonlyMap<string, RawMessage>,
): MessageWithAuthorRow | undefined {
  const rid = message.replyTo?.messageId;
  if (!rid) return undefined;
  const indexed = entitiesById.get(rid) as
    | (RawMessage & Partial<MessageWithAuthor>)
    | undefined;
  if (!indexed) {
    return visibleMessages.get(rid);
  }
  if ('author' in indexed && indexed.author) {
    return indexed as MessageWithAuthorRow;
  }
  return {
    ...indexed,
    author: {
      id: indexed.authorId,
      name: message.replyTo?.authorName ?? 'Unknown',
      avatar: message.replyTo?.authorAvatar ?? '',
    },
  } as MessageWithAuthorRow;
}

export function buildMessageListRowFactsAtIndex(
  orderedIds: readonly string[],
  messagesMap: Map<string, MessageWithAuthorRow>,
  entitiesById: ReadonlyMap<string, RawMessage>,
  compactTop: boolean,
  index: number,
): MessageListRowFacts {
  const groupedWithPrevious = isMessageGroupedWithPrevious(
    orderedIds,
    messagesMap,
    index,
    entitiesById,
  );
  const groupedWithNext = isMessageGroupedWithNext(
    orderedIds,
    messagesMap,
    index,
    entitiesById,
  );
  const msg = messagesMap.get(orderedIds[index]!);
  const showDay = shouldShowDaySeparatorBefore(orderedIds, messagesMap, index);
  const dayLabel = msg ? formatMessageListDaySeparatorLabel(msg.timestamp) : '';
  const replyTargetResolved = msg
    ? resolveReplyTargetForRow(msg, messagesMap, entitiesById)
    : undefined;
  return {
    groupedWithPrevious,
    groupedWithNext,
    showAvatar: !groupedWithPrevious,
    showHeaderTimestamp: !groupedWithPrevious,
    showGutterHoverTime: groupedWithPrevious,
    showDaySeparatorBefore: showDay,
    daySeparatorLabel: dayLabel,
    replyTargetResolved,
    compactTop,
  };
}

export function buildMessageListRowFacts(
  orderedIds: readonly string[],
  messagesMap: Map<string, MessageWithAuthorRow>,
  entitiesById: ReadonlyMap<string, RawMessage>,
  compactTop: boolean,
): MessageListRowFacts[] {
  const n = orderedIds.length;
  const out: MessageListRowFacts[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(
      buildMessageListRowFactsAtIndex(
        orderedIds,
        messagesMap,
        entitiesById,
        compactTop,
        i,
      ),
    );
  }
  return out;
}

/**
 * Cheap per-message fingerprint for row-facts inputs. When unchanged, skip rebuilding that row.
 * Includes reply-target entity state so late resolution does not require a full-list rebuild.
 */
export function fingerprintMessageListRowFactsInputs(
  messageId: string,
  messagesMap: Map<string, MessageWithAuthorRow>,
  entitiesById: ReadonlyMap<string, RawMessage>,
): string {
  const raw = entitiesById.get(messageId);
  const m = messagesMap.get(messageId);
  const rid = m?.replyTo?.messageId ?? raw?.replyTo?.messageId;
  const targetRaw = rid ? entitiesById.get(rid) : undefined;
  const targetVis = rid ? messagesMap.get(rid) : undefined;
  return [
    raw?.authorId ?? '',
    raw?.timestamp ?? '',
    raw?.systemMessage ? '1' : '0',
    raw?.replyTo?.messageId ?? '',
    raw?.content ?? '',
    raw?.editedAt ?? '',
    pollFingerprint(raw?.poll),
    fingerprintMessageReactions(raw?.reactions),
    m?.author?.name ?? '',
    rid ?? '',
    targetRaw?.id ?? '',
    targetRaw?.authorId ?? '',
    targetRaw?.content ?? '',
    targetRaw?.editedAt ?? '',
    targetVis?.author?.name ?? '',
  ].join('\x1e');
}

/** Grouping is neighbor-sensitive: patch i−1, i, i+1; plus rows whose reply target changed. */
export function collectMessageListRowFactsPatchIndices(
  orderedIds: readonly string[],
  messagesMap: Map<string, MessageWithAuthorRow>,
  entitiesById: ReadonlyMap<string, RawMessage>,
  changedMessageIds: ReadonlySet<string>,
): Set<number> {
  const indices = new Set<number>();
  const idToIndex = new Map<string, number>();
  for (let i = 0; i < orderedIds.length; i += 1) {
    idToIndex.set(orderedIds[i]!, i);
  }
  for (const id of changedMessageIds) {
    const i = idToIndex.get(id);
    if (i === undefined) continue;
    indices.add(i - 1);
    indices.add(i);
    indices.add(i + 1);
  }
  for (let i = 0; i < orderedIds.length; i += 1) {
    const mid = orderedIds[i]!;
    const m = messagesMap.get(mid);
    const rid =
      m?.replyTo?.messageId ?? entitiesById.get(mid)?.replyTo?.messageId;
    if (rid && changedMessageIds.has(rid)) {
      indices.add(i - 1);
      indices.add(i);
      indices.add(i + 1);
    }
  }
  return indices;
}

export type OrderedIdsStructuralChange =
  | { kind: 'same' }
  | { kind: 'full' }
  | { kind: 'append_one'; patchIndices: number[] }
  | { kind: 'prepend_one'; patchIndices: number[] };

/**
 * Detect single-message append/prepend so we patch a small band instead of rebuilding all rows.
 */
export function describeOrderedIdsStructuralChange(
  prev: readonly string[] | null,
  next: readonly string[],
): OrderedIdsStructuralChange {
  if (prev == null || prev.length === 0) {
    return next.length === 0 ? { kind: 'same' } : { kind: 'full' };
  }
  if (prev.length === next.length && prev.every((id, i) => id === next[i])) {
    return { kind: 'same' };
  }
  if (
    next.length === prev.length + 1 &&
    next.slice(0, -1).every((id, i) => id === prev[i])
  ) {
    const n = next.length;
    const patchIndices = [n - 3, n - 2, n - 1].filter((i) => i >= 0);
    return { kind: 'append_one', patchIndices };
  }
  if (
    next.length === prev.length + 1 &&
    next.slice(1).every((id, i) => id === prev[i])
  ) {
    const patchIndices = [0, 1, 2].filter((i) => i < next.length);
    return { kind: 'prepend_one', patchIndices };
  }
  return { kind: 'full' };
}
