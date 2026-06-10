import { describe, expect, it } from 'vitest';
import {
  detectActiveSearchInlineFilter,
  removeInlineFilterToken,
  parseSearchInputSegments,
  filterTagValueLabel,
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

  it('parseSearchInputSegments preserves order of text and filters', () => {
    expect(parseSearchInputSegments('hello from:beemo world')).toEqual([
      { type: 'text', value: 'hello ', start: 0, end: 6 },
      {
        type: 'filter',
        mode: 'from',
        value: 'beemo',
        start: 6,
        end: 16,
      },
      { type: 'text', value: ' world', start: 16, end: 22 },
    ]);
  });

  it('parseSearchInputSegments includes empty filter values while typing', () => {
    expect(parseSearchInputSegments('from:')).toEqual([
      { type: 'filter', mode: 'from', value: '', start: 0, end: 5 },
    ]);
  });

  it('filterTagValueLabel adds channel and user prefixes', () => {
    expect(filterTagValueLabel('in', 'general')).toBe('#general');
    expect(filterTagValueLabel('from', 'alice')).toBe('@alice');
    expect(filterTagValueLabel('has', 'image')).toBe('image');
  });
});
