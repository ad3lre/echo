import { ref, watch, type Ref } from 'vue';
import type { PaperDocumentPayload } from '@shared/types/paper';
import {
  fetchPaperDocument,
  patchPaperDocument,
} from '@/features/paper/api/paper';

export function usePaperDocument(channelId: Ref<string>) {
  const doc = ref<PaperDocumentPayload | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const conflict = ref(false);

  async function load() {
    const id = channelId.value.trim();
    if (!id) return;
    loading.value = true;
    error.value = null;
    conflict.value = false;
    try {
      doc.value = await fetchPaperDocument(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load paper';
      doc.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function save(contentJson: Record<string, unknown>) {
    const id = channelId.value.trim();
    const current = doc.value;
    if (!id || !current) return false;
    saving.value = true;
    error.value = null;
    conflict.value = false;
    try {
      doc.value = await patchPaperDocument(id, {
        contentJson,
        expectedRevision: current.revision,
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      if (msg.includes('409') || msg.toLowerCase().includes('conflict')) {
        conflict.value = true;
        await load();
      } else {
        error.value = msg;
      }
      return false;
    } finally {
      saving.value = false;
    }
  }

  watch(
    channelId,
    () => {
      void load();
    },
    { immediate: true },
  );

  return {
    doc,
    loading,
    saving,
    error,
    conflict,
    load,
    save,
  };
}
