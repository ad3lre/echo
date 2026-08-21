/* @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import {
  applyMarkdownWrapToTextareaValue,
  normalizeTextareaWrapRange,
} from './markdownComposerKeybinds';

describe('normalizeTextareaWrapRange', () => {
  it('trims a trailing newline from line selection', () => {
    const text = 'hello world\nsecond';
    expect(normalizeTextareaWrapRange(text, 0, 12)).toEqual({
      start: 0,
      end: 11,
    });
  });

  it('trims trailing CRLF', () => {
    const text = 'line one\r\nline two';
    expect(normalizeTextareaWrapRange(text, 0, 10)).toEqual({
      start: 0,
      end: 8,
    });
  });

  it('keeps internal newlines in a multi-line selection', () => {
    const text = 'line one\nline two\n';
    expect(normalizeTextareaWrapRange(text, 0, text.length)).toEqual({
      start: 0,
      end: text.length - 1,
    });
  });

  it('trims a leading newline from the selection', () => {
    const text = 'first\nsecond line';
    expect(normalizeTextareaWrapRange(text, 5, 16)).toEqual({
      start: 6,
      end: 16,
    });
  });
});

describe('applyMarkdownWrapToTextareaValue', () => {
  it('wraps line text without placing delimiters after the newline', async () => {
    const draft = ref('hello world\nnext line');
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = draft.value;
    textarea.setSelectionRange(0, 12);

    applyMarkdownWrapToTextareaValue(draft, textarea, '**', '**');
    await nextTick();

    expect(draft.value).toBe('**hello world**\nnext line');
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(13);
    textarea.remove();
  });

  it('wraps a mid-line selection', async () => {
    const draft = ref('hello world');
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = draft.value;
    textarea.setSelectionRange(6, 11);

    applyMarkdownWrapToTextareaValue(draft, textarea, '*', '*');
    await nextTick();

    expect(draft.value).toBe('hello *world*');
    textarea.remove();
  });
});
