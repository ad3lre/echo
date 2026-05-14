import { ref, watch, type MaybeRefOrGetter, toValue } from 'vue';
import type { EchoInvitePreviewDto } from '@/api/echo/types';
import { fetchInvitePreview } from '@/services/orchestration/fetchInvitePreview';

export function useEchoInvitePreview(
  inviteToken: MaybeRefOrGetter<string | null | undefined>,
  voiceChannelId: MaybeRefOrGetter<string | null | undefined> = () => null,
) {
  const preview = ref<EchoInvitePreviewDto | null>(null);
  const loading = ref(false);
  let requestSeq = 0;

  watch(
    () => [toValue(inviteToken), toValue(voiceChannelId)] as const,
    ([t, vid]) => {
      const seq = ++requestSeq;
      preview.value = null;
      const trimmed = t?.trim() ?? '';
      if (!trimmed) {
        loading.value = false;
        return;
      }
      const voice = vid?.trim() ?? '';
      loading.value = true;
      void (async () => {
        try {
          const next = await fetchInvitePreview(trimmed, voice ? voice : null);
          if (seq !== requestSeq) return;
          preview.value = next;
        } finally {
          if (seq === requestSeq) loading.value = false;
        }
      })();
    },
    { immediate: true },
  );

  return { preview, loading };
}
