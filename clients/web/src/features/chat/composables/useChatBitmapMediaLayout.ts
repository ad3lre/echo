import { computed, ref, watch, type Ref } from 'vue';
import type { StyleValue } from 'vue';
import {
  mediaAspectStyleFromDims,
  readAspectRatioFromStyle,
} from '@/features/chat/composables/chatMediaAspect';
import {
  CHAT_MEDIA_BOX_ASPECT_CSS,
  CHAT_MEDIA_BOX_MAX_WIDTH_CSS,
} from '@/features/chat/domain/messageMediaReservation';

type LayoutOptions = {
  url: Ref<string>;
  metadataWidth?: Ref<number | null | undefined>;
  metadataHeight?: Ref<number | null | undefined>;
  imageStyle?: Ref<StyleValue | undefined>;
  maxWidth?: string;
};

/**
 * Reserved aspect box + skeleton for chat still images / GIFs.
 *
 * Outer height uses trusted server dims or the shared fixed 16:9 reservation.
 * Client probes are intentionally unused here — they must not change the
 * virtual row's outer height (see message-list subtraction plan Phase 4).
 */
export function useChatBitmapMediaLayout(options: LayoutOptions) {
  const mediaDecoded = ref(false);

  const resolvedAspectRatio = computed((): string => {
    const fromMeta = mediaAspectStyleFromDims({
      width: options.metadataWidth?.value,
      height: options.metadataHeight?.value,
    });
    if (fromMeta) return fromMeta.aspectRatio;

    const fromStyle = readAspectRatioFromStyle(options.imageStyle?.value);
    if (fromStyle) return fromStyle;

    return CHAT_MEDIA_BOX_ASPECT_CSS;
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
    return false;
  });

  const shellStyle = computed(
    (): StyleValue => ({
      aspectRatio: resolvedAspectRatio.value,
      width: '100%',
      maxWidth: options.maxWidth ?? CHAT_MEDIA_BOX_MAX_WIDTH_CSS,
      ...(hasExactLayout.value ? {} : { minHeight: '6rem' }),
    }),
  );

  const showLayoutSkeleton = computed(() => !mediaDecoded.value);

  watch(
    () => options.url.value,
    () => {
      mediaDecoded.value = false;
    },
    { immediate: true },
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
