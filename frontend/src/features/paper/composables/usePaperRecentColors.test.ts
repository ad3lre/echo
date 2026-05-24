import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  pushPaperRecentColor,
  readPaperRecentColors,
  PAPER_RECENT_COLOR_LIMIT,
} from '@/features/paper/composables/usePaperRecentColors';

function memoryLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

describe('usePaperRecentColors', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryLocalStorage());
    localStorage.clear();
  });

  it('starts empty', () => {
    expect(readPaperRecentColors('text')).toEqual([]);
  });

  it('stores normalized lowercase hex', () => {
    pushPaperRecentColor('text', '#DC2626');
    expect(readPaperRecentColors('text')).toEqual(['#dc2626']);
  });

  it('dedupes and moves recent to front', () => {
    pushPaperRecentColor('text', '#111111');
    pushPaperRecentColor('text', '#222222');
    pushPaperRecentColor('text', '#111111');
    expect(readPaperRecentColors('text')).toEqual(['#111111', '#222222']);
  });

  it('keeps text and highlight lists separate', () => {
    pushPaperRecentColor('text', '#111111');
    pushPaperRecentColor('highlight', '#fef08a');
    expect(readPaperRecentColors('text')).toEqual(['#111111']);
    expect(readPaperRecentColors('highlight')).toEqual(['#fef08a']);
  });

  it('caps list length', () => {
    for (let i = 0; i < PAPER_RECENT_COLOR_LIMIT + 3; i++) {
      pushPaperRecentColor('text', `#${i.toString(16).padStart(6, '0')}`);
    }
    expect(readPaperRecentColors('text')).toHaveLength(
      PAPER_RECENT_COLOR_LIMIT,
    );
  });

  it('ignores invalid hex', () => {
    const before = pushPaperRecentColor('text', 'not-a-color');
    expect(before).toEqual([]);
    expect(readPaperRecentColors('text')).toEqual([]);
  });
});
