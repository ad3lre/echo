import { describe, expect, it } from 'vitest';
import {
  detectActiveSearchInlineFilter,
  removeInlineFilterToken,
} from './searchInlineFilterInput';

describe('searchInlineFilterInput', () => {
  it('detects the active inline filter at the caret', () => {
    const text = 'hello from:beemo world';
    const active = detectActiveSearchInlineFilter(
      text,
      text.indexOf('eem') + 1,
    );
    expect(active).toEqual({
      mode: 'from',
      prefix: 'beemo',
      start: 6,
      end: 16,
    });
  });

  it('does not require the filter to be at the end of the input', () => {
    const text = 'foo in:general bar';
    const active = detectActiveSearchInlineFilter(
      text,
      text.indexOf('general') + 3,
    );
    expect(active?.mode).toBe('in');
    expect(active?.prefix).toBe('general');
  });

  it('returns null when the caret is outside a filter token', () => {
    expect(
      detectActiveSearchInlineFilter('hello from:beemo world', 2),
    ).toBeNull();
    expect(
      detectActiveSearchInlineFilter('hello from:beemo world', 18),
    ).toBeNull();
  });

  it('removes only the selected inline filter token', () => {
    const text = 'hello from:beemo world';
    const active = detectActiveSearchInlineFilter(
      text,
      text.indexOf('beemo') + 2,
    );
    expect(active).not.toBeNull();
    expect(removeInlineFilterToken(text, active!)).toBe('hello world');
  });
});
