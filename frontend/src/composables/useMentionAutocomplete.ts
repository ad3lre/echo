/**
 * @mention autocomplete for chat input.
 * Detects @query pattern, shows suggestions, replaces on select.
 */

import type { MentionKind } from '@shared/types';
import { ref, computed, watch, type Ref } from 'vue';
import { isMessageAuthorOffline } from '@/utils/isOfflinePresence';

export interface MentionOption {
  id: string;
  name: string;
  /** Additional search aliases (e.g. username, server nickname). */
  aliases?: string[];
  avatar?: string;
  /** When set, offline users get muted label + grayscale avatar in the popover. */
  status?: string;
  special?: boolean;
  kind?: MentionKind;
}

export type MentionTriggerSpan = { start: number; end: number };

const SUGGESTION_LIMIT = 6;
const QUERY_TAIL = /[a-zA-Z0-9_]/;

function normalizeMentionQueryToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
}

function optionMatchesQuery(option: MentionOption, queryRaw: string): boolean {
  const q = normalizeMentionQueryToken(queryRaw);
  if (!q) return true;
  const candidates = [option.name, ...(option.aliases ?? [])]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
  if (candidates.length === 0) return false;
  return candidates.some((candidate) =>
    normalizeMentionQueryToken(candidate).startsWith(q),
  );
}

/**
 * Locate an active `@query` mention trigger before the caret.
 * Ignores `@` inside existing mention entities (prevents a stuck menu after pick).
 */
export function findMentionTrigger(
  text: string,
  cursor: number,
  mentions: readonly MentionTriggerSpan[] = [],
): { start: number; query: string } | null {
  if (cursor < 0 || cursor > text.length) return null;
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;

  const query = before.slice(at + 1);
  if (!/^[a-zA-Z0-9_]*$/.test(query)) return null;

  for (const m of mentions) {
    if (at >= m.start && at < m.end) return null;
    if (cursor > m.start && cursor <= m.end && at <= m.start) return null;
  }

  if (at === 0) return { start: at, query };

  const prev = before[at - 1]!;
  if (/\s/.test(prev)) return { start: at, query };

  if (mentions.some((m) => m.end === at)) return { start: at, query };

  return null;
}

export function useMentionAutocomplete(
  getText: () => string,
  getCursorOffset: () => number,
  insertMention: (start: number, end: number, option: MentionOption) => void,
  users: Ref<MentionOption[]>,
  allowBroadcastMentions?: Ref<boolean>,
  getMentions?: () => readonly MentionTriggerSpan[],
) {
  const triggerStart = ref<number | null>(null);
  const query = ref('');
  const selectedIndex = ref(0);

  const specialOptions: MentionOption[] = [
    { id: '__everyone__', name: 'Everyone', special: true, kind: 'everyone' },
    { id: '__active__', name: 'Active', special: true, kind: 'active' },
  ];

  const suggestions = computed<MentionOption[]>(() => {
    const q = query.value;
    const broadcastOptions =
      allowBroadcastMentions?.value === false ? [] : specialOptions;
    const combined = [...broadcastOptions, ...users.value];
    const filtered = combined.filter((u) => optionMatchesQuery(u, q));
    const specials = filtered.filter((u) => u.special);
    const regular = filtered.filter((u) => !u.special);
    regular.sort((a, b) => {
      const aOff = isMessageAuthorOffline(a.status);
      const bOff = isMessageAuthorOffline(b.status);
      if (aOff !== bOff) return Number(aOff) - Number(bOff);
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return [...specials, ...regular].slice(0, SUGGESTION_LIMIT);
  });

  const showPopup = computed(() => {
    return triggerStart.value !== null && suggestions.value.length > 0;
  });

  watch([query, suggestions], () => {
    if (triggerStart.value !== null) selectedIndex.value = 0;
  });

  function updateFromInput() {
    const text = getText();
    const offset = getCursorOffset();
    const mentions = getMentions?.() ?? [];
    const trigger = findMentionTrigger(text, offset, mentions);
    if (trigger) {
      const changed =
        triggerStart.value !== trigger.start || query.value !== trigger.query;
      triggerStart.value = trigger.start;
      query.value = trigger.query;
      if (changed) selectedIndex.value = 0;
    } else {
      triggerStart.value = null;
      query.value = '';
    }
  }

  function close() {
    triggerStart.value = null;
    query.value = '';
  }

  function replaceWith(option: MentionOption) {
    const start = triggerStart.value;
    if (start === null) return;
    const text = getText();
    let end = getCursorOffset();
    // Defensive: when caret state lags by one tick, consume any remaining
    // query-tail chars so Enter selection cannot leave a stray letter.
    while (end < text.length && QUERY_TAIL.test(text[end] ?? '')) end += 1;
    insertMention(start, end, option);
    close();
  }

  function selectCurrent() {
    const list = suggestions.value;
    if (list.length === 0) return;
    const idx = Math.min(selectedIndex.value, list.length - 1);
    replaceWith(list[idx]!);
  }

  function handleKeydown(e: KeyboardEvent): boolean {
    updateFromInput();
    if (!showPopup.value) return false;

    if (e.key === 'Escape') {
      close();
      return true;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      selectCurrent();
      return true;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex.value = Math.min(
        selectedIndex.value + 1,
        suggestions.value.length - 1,
      );
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
      return true;
    }
    return false;
  }

  return {
    triggerStart,
    query,
    suggestions,
    showPopup,
    selectedIndex,
    updateFromInput,
    close,
    select: replaceWith,
    selectCurrent,
    handleKeydown,
  };
}
