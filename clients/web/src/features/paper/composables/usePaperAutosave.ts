import { onUnmounted, watch, type Ref } from 'vue';

/** Debounce when no co-authors are present (solo editing) */
const SOLO_DEBOUNCE_MS = 1500;
/** Debounce when collab is active (multiple authors) */
const COLLAB_DEBOUNCE_MS = 400;

export function usePaperAutosave(opts: {
  enabled: Ref<boolean>;
  getContentJson: () => Record<string, unknown> | null;
  save: (contentJson: Record<string, unknown>) => Promise<boolean>;
  /** Solo debounce; defaults to 1500ms */
  debounceMs?: number;
  /** Collab debounce; defaults to 400ms */
  collabDebounceMs?: number;
  /** Whether collab is currently active (multiple authors editing) */
  collabActive?: Ref<boolean>;
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const soloDebounceMs = opts.debounceMs ?? SOLO_DEBOUNCE_MS;
  const collabDebounceMs = opts.collabDebounceMs ?? COLLAB_DEBOUNCE_MS;

  function getCurrentDebounceMs(): number {
    return opts.collabActive?.value ? collabDebounceMs : soloDebounceMs;
  }

  function schedule() {
    if (!opts.enabled.value) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const json = opts.getContentJson();
      if (json) void opts.save(json);
    }, getCurrentDebounceMs());
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!opts.enabled.value) return;
    const json = opts.getContentJson();
    if (json) void opts.save(json);
  }

  watch(opts.enabled, (v) => {
    if (!v && timer) {
      clearTimeout(timer);
      timer = null;
      const json = opts.getContentJson();
      if (json) void opts.save(json);
    }
  });

  onUnmounted(() => {
    if (timer) clearTimeout(timer);
  });

  return { schedule, flush };
}
