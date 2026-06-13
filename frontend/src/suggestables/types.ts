/**
 * Shared types for text-input suggestion / autocomplete providers.
 *
 * Each provider (emoji `:slug:`, `@mention`, `#channel`, future `/command`, …)
 * implements {@link SuggestableConfig} and is driven by {@link useSuggestable}.
 */

/** Cursor-relative text slice used for trigger detection and insertion. */
export type SuggestableInputContext = {
  text: string;
  cursor: number;
};

/** Active trigger before the caret (e.g. `@al`, `:sk`, `#gen`). */
export type SuggestableTrigger = {
  start: number;
  query: string;
};

/** Range replaced when the user picks a suggestion. */
export type SuggestableSelectionRange = {
  start: number;
  end: number;
};

/** Passed to optional per-provider keydown hooks while the popup is open. */
export type SuggestableKeydownContext<TItem> = {
  query: string;
  suggestions: readonly TItem[];
  select: (item: TItem) => void;
  close: () => void;
};

/**
 * Provider contract: detect trigger → list matches → insert selection.
 * Rendering (popover UI) stays in Vue components; this layer is state + keyboard.
 */
export type SuggestableConfig<TItem> = {
  detectTrigger: (ctx: SuggestableInputContext) => SuggestableTrigger | null;
  getSuggestions: (query: string, ctx: SuggestableInputContext) => TItem[];
  applySelection: (
    item: TItem,
    range: SuggestableSelectionRange,
    ctx: SuggestableInputContext,
  ) => void;
  /**
   * Resolve the text range to replace on pick. Defaults to trigger start → cursor.
   * Mention/channel providers extend `end` past the caret to consume query tail.
   */
  resolveSelectionRange?: (
    ctx: SuggestableInputContext,
    triggerStart: number,
  ) => SuggestableSelectionRange | null;
  /** Called when a new trigger is detected (e.g. lazy-load search indexes). */
  onTriggerOpen?: (ctx: SuggestableInputContext) => void;
  /** Provider-specific keys while the popup is open (e.g. emoji `:` completion). */
  handleKeydownExtra?: (
    e: KeyboardEvent,
    keydownCtx: SuggestableKeydownContext<TItem>,
  ) => boolean;
  /**
   * When true, keep the popup open with an empty query (e.g. `@` lists everyone).
   * Default false — emoji hides until the user types at least one query char.
   */
  showWithEmptyQuery?: boolean;
};

/** {@link SuggestableConfig} plus identity and keydown ordering for registries. */
export type SuggestableProvider<TItem = unknown> = SuggestableConfig<TItem> & {
  id: string;
  /** Lower value = earlier in chained `handleKeydown` (mention before channel before emoji). */
  priority?: number;
};

/** Reactive session returned by {@link useSuggestable}. */
export type SuggestableSession<TItem> = {
  triggerStart: import('vue').Ref<number | null>;
  query: import('vue').Ref<string>;
  selectedIndex: import('vue').Ref<number>;
  suggestions: import('vue').ComputedRef<TItem[]>;
  showPopup: import('vue').ComputedRef<boolean>;
  updateFromInput: () => void;
  close: () => void;
  select: (item: TItem) => void;
  selectCurrent: () => void;
  handleKeydown: (e: KeyboardEvent) => boolean;
};
