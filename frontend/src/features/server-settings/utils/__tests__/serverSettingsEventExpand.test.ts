import { describe, expect, it } from 'vitest';
import { toggleExpandedEventId } from '../serverSettingsEventExpand';

describe('toggleExpandedEventId', () => {
  it('expands when nothing is open', () => {
    expect(toggleExpandedEventId(null, 'ev-1')).toBe('ev-1');
  });

  it('collapses when the same row is toggled', () => {
    expect(toggleExpandedEventId('ev-1', 'ev-1')).toBeNull();
  });

  it('switches expansion to another row', () => {
    expect(toggleExpandedEventId('ev-1', 'ev-2')).toBe('ev-2');
  });
});
