import { nextTick, type Ref } from 'vue';
import { findActionForKeyboardEvent } from '@/features/settings/keybindPreferences';

export type MarkdownComposerWrapKind =
  | 'bold'
  | 'italic'
  | 'inlineCode'
  | 'strike'
  | 'spoiler';

/** Ctrl+letter (Windows/Linux) or Cmd+letter (macOS); ignores Alt; skips IME composition. */
export function resolveMarkdownComposerKeybind(
  e: KeyboardEvent,
): MarkdownComposerWrapKind | null {
  if (e.isComposing) return null;
  const action = findActionForKeyboardEvent(e);
  if (action === 'composer.bold') return 'bold';
  if (action === 'composer.italic') return 'italic';
  if (action === 'composer.inlineCode') return 'inlineCode';
  if (action === 'composer.strike') return 'strike';
  if (action === 'composer.spoiler') return 'spoiler';
  return null;
}

export function markdownWrapDelimiters(kind: MarkdownComposerWrapKind): {
  prefix: string;
  suffix: string;
} {
  switch (kind) {
    case 'bold':
      return { prefix: '**', suffix: '**' };
    case 'italic':
      return { prefix: '*', suffix: '*' };
    case 'inlineCode':
      return { prefix: '`', suffix: '`' };
    case 'strike':
      return { prefix: '~~', suffix: '~~' };
    case 'spoiler':
      return { prefix: '||', suffix: '||' };
  }
}

/** Plain `<textarea>` + v-model: wrap selection or insert empty pair with caret inside. */
export function applyMarkdownWrapToTextareaValue(
  draft: Ref<string>,
  textarea: HTMLTextAreaElement | null,
  prefix: string,
  suffix: string,
): void {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd ?? start;
  const text = draft.value;

  if (start !== end) {
    const selected = text.slice(start, end);
    draft.value =
      text.slice(0, start) + prefix + selected + suffix + text.slice(end);
    const selA = start + prefix.length;
    const selB = selA + selected.length;
    void nextTick(() => {
      textarea.setSelectionRange(selA, selB);
      textarea.focus();
    });
    return;
  }

  draft.value = text.slice(0, start) + prefix + suffix + text.slice(end);
  const mid = start + prefix.length;
  void nextTick(() => {
    textarea.setSelectionRange(mid, mid);
    textarea.focus();
  });
}
