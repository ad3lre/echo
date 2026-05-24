import { computed, ref, watch, type Ref } from 'vue';
import {
  fetchPaperShareSettings,
  patchPaperShareVisibility,
} from '@/features/paper/api/paper';
import {
  buildPaperGlobalShareUrl,
  buildPaperServerShareUrl,
} from '@/features/paper/editor/paperShareLinks';
import type {
  PaperShareSettingsPayload,
  PaperShareVisibility,
} from '@shared/types/paperShare';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

export function usePaperShare(channelId: Ref<string>, serverId?: Ref<string>) {
  const settings = ref<PaperShareSettingsPayload | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  async function load() {
    const id = channelId.value.trim();
    if (!id) return;
    loading.value = true;
    error.value = null;
    try {
      settings.value = await fetchPaperShareSettings(id);
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Could not load share settings';
      settings.value = null;
    } finally {
      loading.value = false;
    }
  }

  watch(
    channelId,
    () => {
      void load();
    },
    { immediate: true },
  );

  const shareLink = computed(() => {
    const s = settings.value;
    if (!s) return '';
    if (s.visibility === 'global' && s.shareToken) {
      return buildPaperGlobalShareUrl(s.shareToken) || s.publicShareUrl || '';
    }
    const sid = serverId?.value?.trim() || s.serverId;
    if (sid) {
      return buildPaperServerShareUrl(sid, s.channelId) || s.shareUrl;
    }
    return s.shareUrl;
  });

  async function setVisibility(visibility: PaperShareVisibility) {
    const id = channelId.value.trim();
    if (!id || !settings.value?.canManageShare) return;
    saving.value = true;
    try {
      settings.value = await patchPaperShareVisibility(id, visibility);
      dispatchAppToast('Share settings updated', 'success');
    } catch (e) {
      dispatchAppToast(
        e instanceof Error ? e.message : 'Could not update share settings',
        'warning',
      );
    } finally {
      saving.value = false;
    }
  }

  return {
    settings,
    loading,
    saving,
    error,
    shareLink,
    load,
    setVisibility,
  };
}
