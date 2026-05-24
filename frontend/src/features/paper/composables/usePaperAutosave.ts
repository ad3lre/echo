import { onUnmounted, watch, type Ref } from 'vue';

export function usePaperAutosave(opts: {
  enabled: Ref<boolean>;
  getContentJson: () => Record<string, unknown> | null;
  save: (contentJson: Record<string, unknown>) => Promise<boolean>;
  debounceMs?: number;
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounceMs = opts.debounceMs ?? 1500;

  function schedule() {
    if (!opts.enabled.value) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const json = opts.getContentJson();
      if (json) void opts.save(json);
    }, debounceMs);
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
    }
  });

  onUnmounted(() => {
    if (timer) clearTimeout(timer);
  });

  return { schedule, flush };
}
