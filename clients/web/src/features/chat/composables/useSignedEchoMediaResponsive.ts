import {
  onScopeDispose,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import { resolveSignedEchoMediaUrl } from '@/features/chat/mediaCdn';
import type { MediaCdnReadScope } from '@shared/mediaCdn';
import type { MediaCdnAllowedWidth } from '@shared/mediaCdnVariants';
import {
  buildEchoMediaSrcSet,
  buildEchoMediaVariantUrl,
  echoMediaUrlSupportsVariants,
} from '@/features/chat/composables/echoMediaResponsive';

export function useSignedEchoMediaResponsive(
  url: MaybeRefOrGetter<string>,
  opts: {
    storageKey?: MaybeRefOrGetter<string | undefined>;
    scope?: MediaCdnReadScope;
    widths: readonly MediaCdnAllowedWidth[];
    /** CSS `sizes` attribute for srcset selection. */
    sizes: string;
    /** Fallback `src` width (largest sensible default for the slot). */
    fallbackWidth: MediaCdnAllowedWidth;
  },
): { src: Ref<string>; srcset: Ref<string>; sizes: string } {
  const src = ref('');
  const srcset = ref('');
  let requestId = 0;

  async function refresh(): Promise<void> {
    const raw = safeImageUrl(toValue(url));
    const id = ++requestId;
    const signed = await resolveSignedEchoMediaUrl({
      url: raw,
      storageKey: toValue(opts.storageKey),
      scope: opts.scope,
    });
    if (id !== requestId) return;
    if (echoMediaUrlSupportsVariants(signed)) {
      src.value = buildEchoMediaVariantUrl(signed, {
        width: opts.fallbackWidth,
      });
      srcset.value = buildEchoMediaSrcSet(signed, opts.widths);
    } else {
      src.value = signed;
      srcset.value = '';
    }
  }

  watch(
    () =>
      [
        toValue(url),
        toValue(opts.storageKey),
        opts.scope,
        opts.fallbackWidth,
        opts.widths.join(','),
      ] as const,
    () => {
      void refresh();
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    requestId++;
  });

  return { src, srcset, sizes: opts.sizes };
}
