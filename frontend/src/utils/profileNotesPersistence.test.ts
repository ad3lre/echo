import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadProfileNotesMap,
  persistProfileNotesMap,
  PROFILE_NOTES_STORAGE_KEY,
} from './profileNotesPersistence';

function mockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  } as Storage;
}

describe('profileNotesPersistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadProfileNotesMap returns {} when empty or invalid', () => {
    vi.stubGlobal('localStorage', mockLocalStorage());
    expect(loadProfileNotesMap()).toEqual({});
    localStorage.setItem(PROFILE_NOTES_STORAGE_KEY, 'not-json');
    expect(loadProfileNotesMap()).toEqual({});
  });

  it('persists and reloads notes per user id', () => {
    vi.stubGlobal('localStorage', mockLocalStorage());
    persistProfileNotesMap({ u1: 'Remember: timezone PST', u2: 'Met at conf' });
    expect(loadProfileNotesMap()).toEqual({
      u1: 'Remember: timezone PST',
      u2: 'Met at conf',
    });
  });

  it('drops empty trimmed notes on load', () => {
    vi.stubGlobal('localStorage', mockLocalStorage());
    localStorage.setItem(
      PROFILE_NOTES_STORAGE_KEY,
      JSON.stringify({ u1: '   ', u2: 'ok' }),
    );
    expect(loadProfileNotesMap()).toEqual({ u2: 'ok' });
  });
});
