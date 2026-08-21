import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { usePaperSession } from '@/features/paper/composables/usePaperSession';

describe('usePaperSession', () => {
  it('reports synced when author and not saving', () => {
    const session = usePaperSession({
      canAuthor: ref(true),
      saving: ref(false),
      conflict: ref(false),
    });
    expect(session.phase.value).toBe('synced');
    expect(session.autosaveEnabled.value).toBe(true);
  });

  it('reports syncing while save in flight', () => {
    const session = usePaperSession({
      canAuthor: ref(true),
      saving: ref(true),
      conflict: ref(false),
    });
    expect(session.phase.value).toBe('syncing');
    expect(session.tooltip.value).toContain('Saving');
  });

  it('reports conflict on revision mismatch', () => {
    const session = usePaperSession({
      canAuthor: ref(true),
      saving: ref(false),
      conflict: ref(true),
    });
    expect(session.phase.value).toBe('conflict');
  });

  it('idle for non-authors', () => {
    const session = usePaperSession({
      canAuthor: ref(false),
      saving: ref(false),
      conflict: ref(false),
    });
    expect(session.phase.value).toBe('idle');
    expect(session.autosaveEnabled.value).toBe(false);
  });
});
