import { describe, expect, it } from 'vitest';
import { applyComposerOrderedListEnter } from '@/features/chat/editor/composerMarkdownListEnter';

describe('applyComposerOrderedListEnter', () => {
  it('continues ordered list with incremented marker', () => {
    const content = '2. first';
    const res = applyComposerOrderedListEnter(
      content,
      content.length,
      content.length,
    );
    expect(res).not.toBeNull();
    expect(res!.content).toBe('2. first\n3. ');
    expect(res!.selectionStart).toBe(res!.content.length);
  });

  it('preserves non-1 starting marker on the current line', () => {
    const content = '3. item';
    const res = applyComposerOrderedListEnter(content, 3, 3);
    expect(res?.content.startsWith('3. ')).toBe(true);
    expect(res?.content).not.toMatch(/^1\./);
  });

  it('returns null outside ordered list lines', () => {
    expect(applyComposerOrderedListEnter('hello', 3, 3)).toBeNull();
  });
});
