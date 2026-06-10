import { computed, ref, watch, type Ref } from 'vue';
import type { StyleValue } from 'vue';
import {
  CHAT_BITMAP_DEFAULT_ASPECT_RATIO,
  mediaAspectStyleFromDims,
  readAspectRatioFromStyle,
} from '@/utils/chatMediaAspect';
import {
  getCachedImageDimensions,
  probeImageDimensionsFromUrl,
} from '@/utils/probeImageDimensions';

type LayoutOptions = {
  url: Ref<string>;
  metadataWidth?: Ref<number | undefined>;
  metadataHeight?: Ref<number | undefined>;
  imageStyle?: Ref<StyleValue | undefined>;
  maxWidth?: string;
};

/**
 * Reserved aspect box + skeleton for chat still images / GIFs so rows do not grow from 0
 * height when bytes decode (scroll anchor stability).
 */
export function useChatBitmapMediaLayout(options: LayoutOptions) {
  const probedWidth = ref<number | undefined>();
  const probedHeight = ref<number | undefined>();
  const mediaDecoded = ref(false);

  const resolvedAspectRatio = computed((): string => {
    const fromMeta = mediaAspectStyleFromDims({
      width: options.metadataWidth?.value,
      height: options.metadataHeight?.value,
    });
    if (fromMeta) return fromMeta.aspectRatio;

    const fromStyle = readAspectRatioFromStyle(options.imageStyle?.value);
    if (fromStyle) return fromStyle;

    const fromProbe = mediaAspectStyleFromDims({
      width: probedWidth.value,
      height: probedHeight.value,
    });
    if (fromProbe) return fromProbe.aspectRatio;

    return CHAT_BITMAP_DEFAULT_ASPECT_RATIO;
  });

  const hasExactLayout = computed(() => {
    if (
      mediaAspectStyleFromDims({
        width: options.metadataWidth?.value,
        height: options.metadataHeight?.value,
      })
    ) {
      return true;
    }
    if (readAspectRatioFromStyle(options.imageStyle?.value)) return true;
    if (
      mediaAspectStyleFromDims({
        width: probedWidth.value,
        height: probedHeight.value,
      })
    ) {
      return true;
    }
    return false;
  });

  const shellStyle = computed(
    (): StyleValue => ({
      aspectRatio: resolvedAspectRatio.value,
      width: '100%',
      maxWidth: options.maxWidth ?? 'min(100%, 40rem)',
      ...(hasExactLayout.value ? {} : { minHeight: '6rem' }),
    }),
  );

  const showLayoutSkeleton = computed(() => !mediaDecoded.value);

  function resetForUrl() {
    mediaDecoded.value = false;
    probedWidth.value = undefined;
    probedHeight.value = undefined;
  }

  async function probeIfNeeded() {
    if (hasExactLayout.value) return;
    const trimmed = options.url.value?.trim();
    if (!trimmed) return;

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
    () => options.url.value,
    () => {
      resetForUrl();
      void probeIfNeeded();
    },
    { immediate: true },
  );

  watch(
    () =>
      [options.metadataWidth?.value, options.metadataHeight?.value] as const,
    () => {
      if (hasExactLayout.value) {
        probedWidth.value = undefined;
        probedHeight.value = undefined;
      }
    },
  );

  function onMediaDecoded() {
    mediaDecoded.value = true;
  }

  return {
    shellStyle,
    showLayoutSkeleton,
    hasExactLayout,
    onMediaDecoded,
  };
}
