import { nextTick, watch, type Ref, type MaybeRefOrGetter, toValue } from 'vue';

/**
 * Focus a primary text control when a surface opens. Uses `nextTick` so the field exists
 * after `v-if` / layout (matches focus-trap timing).
 */
export function useAutofocusOnOpen(
  open: MaybeRefOrGetter<boolean>,
  inputRef: Ref<HTMLElement | null | undefined>,
  options?: {
    /** When false, focus is skipped (e.g. loading state hides the input). */
    when?: MaybeRefOrGetter<boolean>;
  },
) {
  watch(
    () => ({
      o: toValue(open),
      w: options?.when !== undefined ? toValue(options.when) : true,
    }),
    ({ o, w }) => {
      if (!o || !w) return;
      void nextTick(() => inputRef.value?.focus());
    },
    { immediate: true },
  );
}
