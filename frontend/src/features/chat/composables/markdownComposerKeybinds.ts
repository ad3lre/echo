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

/**
 * Triple-click / line-select in a `<textarea>` often includes the trailing line break.
 * Wrapping that range puts closing markdown delimiters on the next line as literal text.
 */
export function normalizeTextareaWrapRange(
  text: string,
  start: number,
  end: number,
): { start: number; end: number } {
  let s = Math.max(0, Math.min(start, text.length));
  let e = Math.max(s, Math.min(end, text.length));

  while (e > s) {
    const ch = text[e - 1];
    if (ch === '\n') {
      e--;
      if (e > s && text[e - 1] === '\r') e--;
      continue;
    }
    if (ch === '\r') {
      e--;
      continue;
    }
    break;
  }

  while (s < e) {
    const ch = text[s];
    if (ch === '\r') {
      s++;
      if (s < e && text[s] === '\n') s++;
      continue;
    }
    if (ch === '\n') {
      s++;
      continue;
    }
    break;
  }

  return { start: s, end: e };
}

/** Plain `<textarea>` + v-model: wrap selection or insert empty pair with caret inside. */
export function applyMarkdownWrapToTextareaValue(
  draft: Ref<string>,
  textarea: HTMLTextAreaElement | null,
  prefix: string,
  suffix: string,
): void {
  if (!textarea) return;
  const rawStart = textarea.selectionStart;
  const rawEnd = textarea.selectionEnd ?? rawStart;
  const text = draft.value;
  let start = rawStart;
  let end = rawEnd;

  if (rawStart !== rawEnd) {
    ({ start, end } = normalizeTextareaWrapRange(text, start, end));
  }

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

  draft.value = text.slice(0, rawStart) + prefix + suffix + text.slice(rawEnd);
  const mid = rawStart + prefix.length;
  void nextTick(() => {
    textarea.setSelectionRange(mid, mid);
    textarea.focus();
  });
}
