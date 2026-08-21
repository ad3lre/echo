/**
 * Coordinate multiple {@link SuggestableProvider}s in one composer (e.g. chat input).
 * Mirrors ChatInput keydown order: mention → channel → emoji (by priority).
 */

import { useSuggestable } from '@/suggestables/useSuggestable';
import type {
  SuggestableProvider,
  SuggestableSession,
} from '@/suggestables/types';

export type SuggestableRegistryEntry<TItem = unknown> = {
  id: string;
  session: SuggestableSession<TItem>;
};

export type SuggestableRegistry = {
  entries: SuggestableRegistryEntry[];
  updateFromInput: () => void;
  closeAll: () => void;
  handleKeydown: (e: KeyboardEvent) => boolean;
  activeEntry: () => SuggestableRegistryEntry | null;
};

export function useSuggestableRegistry(
  getText: () => string,
  getCursorOffset: () => number,
  providers: readonly SuggestableProvider[],
): SuggestableRegistry {
  const ordered = [...providers].sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
  );

  const entries: SuggestableRegistryEntry[] = ordered.map((provider) => {
    const { id, priority: _priority, ...config } = provider;
    return {
      id,
      session: useSuggestable(getText, getCursorOffset, config),
    };
  });

  function updateFromInput() {
    for (const entry of entries) entry.session.updateFromInput();
  }

  function closeAll() {
    for (const entry of entries) entry.session.close();
  }

  function handleKeydown(e: KeyboardEvent): boolean {
    updateFromInput();
    for (const entry of entries) {
      if (entry.session.handleKeydown(e)) return true;
    }
    return false;
  }

  function activeEntry(): SuggestableRegistryEntry | null {
    return entries.find((e) => e.session.showPopup.value) ?? null;
  }

  return {
    entries,
    updateFromInput,
    closeAll,
    handleKeydown,
    activeEntry,
  };
}
