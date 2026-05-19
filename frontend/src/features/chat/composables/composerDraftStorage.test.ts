import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  COMPOSER_DRAFTS_STORAGE_KEY,
  clearComposerDraft,
  isComposerDraftEmpty,
  readComposerDraft,
  resetComposerDraftStorageForTests,
  writeComposerDraft,
} from './composerDraftStorage';

function memoryLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

describe('composerDraftStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryLocalStorage());
    resetComposerDraftStorageForTests();
  });

  it('isComposerDraftEmpty treats whitespace-only as empty', () => {
    expect(isComposerDraftEmpty({ content: '  \n', mentions: [] })).toBe(true);
    expect(
      isComposerDraftEmpty({
        content: '',
        mentions: [{ kind: 'user', label: 'a', start: 0, end: 1 } as any],
      }),
    ).toBe(false);
  });

  it('round-trips a draft per channel', () => {
    writeComposerDraft('ch-a', {
      content: 'hello',
      mentions: [],
      contentJson: { type: 'doc' },
    });
    expect(readComposerDraft('ch-a')?.content).toBe('hello');
    expect(readComposerDraft('ch-b')).toBeNull();
  });

  it('removes empty drafts instead of storing them', () => {
    writeComposerDraft('ch-a', { content: 'x', mentions: [] });
    writeComposerDraft('ch-a', { content: '   ', mentions: [] });
    expect(readComposerDraft('ch-a')).toBeNull();
    expect(
      localStorage.getItem(COMPOSER_DRAFTS_STORAGE_KEY) ?? '{}',
    ).not.toContain('ch-a');
  });

  it('clearComposerDraft deletes one channel', () => {
    writeComposerDraft('ch-a', { content: 'a', mentions: [] });
    writeComposerDraft('ch-b', { content: 'b', mentions: [] });
    clearComposerDraft('ch-a');
    expect(readComposerDraft('ch-a')).toBeNull();
    expect(readComposerDraft('ch-b')?.content).toBe('b');
  });
});
