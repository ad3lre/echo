import { computed, type Ref } from 'vue';

export type PaperConnectionPhase =
  | 'idle'
  | 'synced'
  | 'syncing'
  | 'conflict'
  | 'offline'
  | 'error';

export function usePaperSession(opts: {
  canAuthor: Ref<boolean>;
  saving: Ref<boolean>;
  conflict: Ref<boolean>;
}) {
  const autosaveEnabled = computed(() => opts.canAuthor.value);

  const phase = computed((): PaperConnectionPhase => {
    if (!opts.canAuthor.value) return 'idle';
    if (opts.conflict.value) return 'conflict';
    if (opts.saving.value) return 'syncing';
    return 'synced';
  });

  const tooltip = computed(() => {
    switch (phase.value) {
      case 'synced':
        return 'All changes saved';
      case 'syncing':
        return 'Saving…';
      case 'conflict':
        return 'Updated elsewhere — showing latest version';
      default:
        return '';
    }
  });

  return {
    phase,
    tooltip,
    autosaveEnabled,
  };
}
