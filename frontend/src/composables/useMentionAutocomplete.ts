/**
 * @mention autocomplete for chat input.
 * Detects @query pattern, shows suggestions, replaces on select.
 */

import type { MentionKind } from '@shared/types';
import { ref, computed, type Ref } from 'vue';
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

const TRIGGER = /(?:^|\s)@([a-zA-Z0-9_]*)$/;
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

export function useMentionAutocomplete(
  getText: () => string,
  getCursorOffset: () => number,
  insertMention: (start: number, end: number, option: MentionOption) => void,
  users: Ref<MentionOption[]>,
  allowBroadcastMentions?: Ref<boolean>,
) {
  const triggerStart = ref<number | null>(null);
  const query = ref('');
  const selectedIndex = ref(0);
  /** Prevent immediate popup re-open at the same caret after selecting a mention. */
  const suppressUntilCursorMovesFrom = ref<number | null>(null);

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

  function updateFromInput() {
    const offset = getCursorOffset();
    if (suppressUntilCursorMovesFrom.value !== null) {
      if (offset === suppressUntilCursorMovesFrom.value) {
        triggerStart.value = null;
        query.value = '';
        return;
      }
      suppressUntilCursorMovesFrom.value = null;
    }
    const text = getText();
    const before = text.slice(0, offset);
    const match = before.match(TRIGGER);
    if (match) {
      const leadingWhitespaceLength = match[0].startsWith('@') ? 0 : 1;
      triggerStart.value = offset - match[0].length + leadingWhitespaceLength;
      query.value = match[1] ?? '';
      selectedIndex.value = 0;
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
    suppressUntilCursorMovesFrom.value = getCursorOffset();
  }

  function selectCurrent() {
    const list = suggestions.value;
    if (list.length === 0) return;
    const idx = Math.min(selectedIndex.value, list.length - 1);
    replaceWith(list[idx]!);
  }

  function handleKeydown(e: KeyboardEvent): boolean {
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
