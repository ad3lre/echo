import { computed, ref, watch, type Ref } from 'vue';

export type PaperUiMode = 'edit' | 'comment' | 'view';

const STORAGE_PREFIX = 'echo-paper-ui-mode:';

function loadStored(channelId: string): PaperUiMode | null {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${channelId}`);
    if (raw === 'edit' || raw === 'comment' || raw === 'view') return raw;
  } catch {
    /* ignore */
  }
  return null;
}

function store(channelId: string, mode: PaperUiMode) {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${channelId}`, mode);
  } catch {
    /* ignore */
  }
}

function defaultModeForPermissions(
  canAuthor: boolean,
  canComment: boolean,
): PaperUiMode {
  if (canAuthor) return 'edit';
  if (canComment) return 'comment';
  return 'view';
}

export function usePaperUiMode(opts: {
  channelId: Ref<string>;
  canAuthor: Ref<boolean>;
  canComment: Ref<boolean>;
}) {
  const preferred = ref<PaperUiMode>('view');

  function applyPreferredForChannel(channelId: string) {
    const stored = loadStored(channelId);
    preferred.value = stored
      ? stored
      : defaultModeForPermissions(opts.canAuthor.value, opts.canComment.value);
  }

  watch(
    () => opts.channelId.value,
    (id) => {
      if (!id) return;
      applyPreferredForChannel(id);
    },
    { immediate: true },
  );

  watch([opts.canAuthor, opts.canComment], () => {
    const id = opts.channelId.value.trim();
    if (!id) return;
    if (loadStored(id) != null) return;
    preferred.value = defaultModeForPermissions(
      opts.canAuthor.value,
      opts.canComment.value,
    );
  });

  const effectiveMode = computed((): PaperUiMode => {
    const p = preferred.value;
    if (p === 'edit' && opts.canAuthor.value) return 'edit';
    if (p === 'comment' && opts.canComment.value) return 'comment';
    if (p === 'view') return 'view';
    return defaultModeForPermissions(
      opts.canAuthor.value,
      opts.canComment.value,
    );
  });

  const modeOptions = computed(() => {
    const options: { id: PaperUiMode; label: string; hint: string }[] = [];
    if (opts.canAuthor.value) {
      options.push({
        id: 'edit',
        label: 'Editing',
        hint: 'Type and format the document',
      });
    }
    if (opts.canComment.value) {
      options.push({
        id: 'comment',
        label: 'Commenting',
        hint: 'Select text to add margin comments',
      });
    }
    options.push({
      id: 'view',
      label: 'Viewing',
      hint: 'Read-only — no edits',
    });
    return options;
  });

  function setMode(mode: PaperUiMode) {
    preferred.value = mode;
    store(opts.channelId.value, mode);
  }

  const modeLabel = computed(
    () =>
      modeOptions.value.find((o) => o.id === effectiveMode.value)?.label ??
      'Viewing',
  );

  return {
    preferred,
    effectiveMode,
    modeOptions,
    modeLabel,
    setMode,
  };
}
