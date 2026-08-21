import { onScopeDispose, ref, watch, type Ref } from 'vue';
import {
  fetchEchoStageSpeakRequests,
  resolveEchoStageSpeakRequest,
} from '@/api/echo/voice';

/** Cookie session auth; echoFetch ignores bearer and uses credentials. */
const ECHO_API_TOKEN = '';

export function useStageSpeakRequests(opts: {
  enabled: Ref<boolean>;
  isAuthenticated: Ref<boolean>;
  serverId: Ref<string | null | undefined>;
  channelId: Ref<string | null | undefined>;
  pollMs?: number;
}) {
  const pendingUserIds = ref<string[]>([]);
  const busy = ref(false);

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function canPoll(): boolean {
    const sid = opts.serverId.value?.trim();
    const cid = opts.channelId.value?.trim();
    return opts.enabled.value && opts.isAuthenticated.value && !!sid && !!cid;
  }

  async function refresh() {
    const sid = opts.serverId.value?.trim();
    const cid = opts.channelId.value?.trim();
    if (!canPoll()) {
      pendingUserIds.value = [];
      return;
    }
    try {
      const { userIds } = await fetchEchoStageSpeakRequests(
        ECHO_API_TOKEN,
        sid!,
        cid!,
      );
      pendingUserIds.value = Array.isArray(userIds) ? userIds.map(String) : [];
    } catch {
      pendingUserIds.value = [];
    }
  }

  async function resolve(targetUserId: string, approve: boolean) {
    const sid = opts.serverId.value?.trim();
    const cid = opts.channelId.value?.trim();
    if (!canPoll()) return;
    busy.value = true;
    try {
      await resolveEchoStageSpeakRequest(
        ECHO_API_TOKEN,
        sid!,
        cid!,
        targetUserId,
        approve,
      );
      await refresh();
    } finally {
      busy.value = false;
    }
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPoll() {
    stopPoll();
    if (!opts.enabled.value) return;
    void refresh();
    pollTimer = setInterval(() => void refresh(), opts.pollMs ?? 4000);
  }

  watch(
    () =>
      [
        opts.enabled.value,
        opts.isAuthenticated.value,
        opts.serverId.value,
        opts.channelId.value,
      ] as const,
    () => {
      stopPoll();
      if (!opts.enabled.value) {
        pendingUserIds.value = [];
        return;
      }
      startPoll();
    },
    { immediate: true },
  );

  onScopeDispose(stopPoll);

  return { pendingUserIds, busy, refresh, resolve };
}
