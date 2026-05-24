import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import {
  emitPaperAuthoring,
  emitPaperUnwatch,
  emitPaperWatch,
  subscribePaperWatchers,
  type PaperWatchersPayload,
} from '@/services/realtime/paperWatchSocketBridge';

export type PaperSocketWatcher = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  authoring?: boolean;
};

export function usePaperWatchers(
  channelId: Ref<string>,
  authoring: Ref<boolean> = ref(false),
) {
  const watchers = ref<PaperSocketWatcher[]>([]);
  const authorCount = ref(0);
  const collabEnabled = ref(false);

  function applyPayload(payload: PaperWatchersPayload) {
    if (payload.channelId !== channelId.value.trim()) return;
    watchers.value = payload.watchers.map((w) => ({
      userId: w.userId,
      displayName: w.displayName,
      avatarUrl: w.avatarUrl,
      authoring: w.authoring,
    }));
    authorCount.value = payload.authorCount ?? 0;
    collabEnabled.value = payload.collabEnabled === true;
  }

  let unsubscribe: (() => void) | undefined;

  function startWatch() {
    const id = channelId.value.trim();
    if (!id) return;
    emitPaperWatch(id, authoring.value);
  }

  function stopWatch() {
    const id = channelId.value.trim();
    if (!id) return;
    emitPaperUnwatch(id);
    watchers.value = [];
    authorCount.value = 0;
    collabEnabled.value = false;
  }

  onMounted(() => {
    unsubscribe = subscribePaperWatchers(applyPayload);
    startWatch();
  });

  onUnmounted(() => {
    stopWatch();
    unsubscribe?.();
  });

  watch(channelId, (next, prev) => {
    if (prev?.trim()) emitPaperUnwatch(prev.trim());
    watchers.value = [];
    authorCount.value = 0;
    collabEnabled.value = false;
    if (next.trim()) startWatch();
  });

  watch(authoring, (active) => {
    const id = channelId.value.trim();
    if (!id) return;
    emitPaperAuthoring(id, active);
  });

  return { watchers, authorCount, collabEnabled };
}
