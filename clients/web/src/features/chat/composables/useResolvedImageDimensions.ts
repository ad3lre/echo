import { computed, ref, watch, type Ref } from 'vue';
import {
  getCachedImageDimensions,
  probeImageDimensionsFromUrl,
} from '@/features/layout/display/probeImageDimensions';

/**
 * Reactive image dimensions for legacy URLs / attachments without stored metadata.
 * Reads the URL cache synchronously, then probes once if needed.
 */
export function useResolvedImageDimensions(
  url: Ref<string | null | undefined>,
  knownWidth?: Ref<number | null | undefined>,
  knownHeight?: Ref<number | null | undefined>,
) {
  const probedWidth = ref<number | undefined>();
  const probedHeight = ref<number | undefined>();

  const width = computed(() => {
    const kw = knownWidth?.value;
    if (typeof kw === 'number' && kw > 0) return kw;
    return probedWidth.value;
  });

  const height = computed(() => {
    const kh = knownHeight?.value;
    if (typeof kh === 'number' && kh > 0) return kh;
    return probedHeight.value;
  });

  function resetProbed() {
    probedWidth.value = undefined;
    probedHeight.value = undefined;
  }

  async function probeIfNeeded() {
    if (
      typeof knownWidth?.value === 'number' &&
      knownWidth.value > 0 &&
      typeof knownHeight?.value === 'number' &&
      knownHeight.value > 0
    ) {
      resetProbed();
      return;
    }
    const trimmed = url.value?.trim();
    if (!trimmed) {
      resetProbed();
      return;
    }
    const cached = getCachedImageDimensions(trimmed);
    if (cached) {
      probedWidth.value = cached.width;
      probedHeight.value = cached.height;
      return;
    }
    const dims = await probeImageDimensionsFromUrl(trimmed);
    if (dims) {
      probedWidth.value = dims.width;
      probedHeight.value = dims.height;
    }
  }

  watch(
    () => [url.value, knownWidth?.value, knownHeight?.value] as const,
    () => {
      void probeIfNeeded();
    },
    { immediate: true },
  );

  return { width, height };
}
