import {
  onScopeDispose,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { resolveSignedEchoMediaUrl } from '@/services/mediaCdn';
import type { MediaCdnReadScope } from '@shared/mediaCdn';

export function useSignedEchoMediaUrl(
  url: MaybeRefOrGetter<string>,
  opts?: {
    storageKey?: MaybeRefOrGetter<string | undefined>;
    scope?: MediaCdnReadScope;
  },
): Ref<string> {
  const resolved = ref('');
  let requestId = 0;

  async function refresh(): Promise<void> {
    const raw = safeImageUrl(toValue(url));
    const id = ++requestId;
    const signed = await resolveSignedEchoMediaUrl({
      url: raw,
      storageKey: toValue(opts?.storageKey),
      scope: opts?.scope,
    });
    if (id === requestId) resolved.value = signed;
  }

  watch(
    () => [toValue(url), toValue(opts?.storageKey), opts?.scope] as const,
    () => {
      void refresh();
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    requestId++;
  });

  return resolved;
}
