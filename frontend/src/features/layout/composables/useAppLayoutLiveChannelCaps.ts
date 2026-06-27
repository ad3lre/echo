/**
 * Holds **server-authoritative** per-channel capability flags for the active routed channel
 * (`fetchEchoChannelCapabilities`). Consumed by `createChatPermissions` / `useChatPermissions` for
 * live send gating (not role-preview simulation).
 */
import { onScopeDispose, ref, watch, type Ref } from 'vue';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { EchoChannelCapabilitiesDto } from '@/api/echo/types';
import { isEchoGraphId } from '@/utils/echoIds';
import { fetchEchoChannelCapabilities } from '@/api/echoClient';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { scheduleDeferredTask } from '@/utils/scheduleDeferredTask';

export function useAppLayoutLiveChannelCaps(deps: {
  authSession: ReturnType<typeof useAuthSessionStore>;
  activeChannelId: Ref<string>;
  refreshKey?: Ref<number>;
}) {
  const { authSession, activeChannelId, refreshKey } = deps;

  const liveChannelCapabilities = ref<EchoChannelCapabilitiesDto | null>(null);

  let channelCapabilitiesAbort: AbortController | null = null;
  let deferredCapabilitiesRefresh: ReturnType<
    typeof scheduleDeferredTask
  > | null = null;

  watch(
    () =>
      [
        authSession.isAuthenticated,
        activeChannelId.value,
        refreshKey?.value ?? 0,
      ] as const,
    ([isAuthenticated, channelId]) => {
      deferredCapabilitiesRefresh?.cancel();
      deferredCapabilitiesRefresh = null;
      channelCapabilitiesAbort?.abort();
      channelCapabilitiesAbort = null;
      // Cookie sessions often have no `accessToken` in the store; `echoFetch` uses credentials either way.
      if (!isAuthenticated || !channelId || !isEchoGraphId(channelId)) {
        liveChannelCapabilities.value = null;
        return;
      }
      deferredCapabilitiesRefresh = scheduleDeferredTask(
        () => {
          deferredCapabilitiesRefresh = null;
          const ac = new AbortController();
          channelCapabilitiesAbort = ac;
          void fetchEchoChannelCapabilities(
            authSession.accessToken ?? '',
            channelId,
            {
              signal: ac.signal,
            },
          )
            .then((caps) => {
              if (activeChannelId.value !== channelId) return;
              liveChannelCapabilities.value = caps;
            })
            .catch((e) => {
              if (ac.signal.aborted) return;
              if (activeChannelId.value !== channelId) return;
              liveChannelCapabilities.value = null;
              reportPrimaryFlowFailure('liveChannelCapabilities', e, {
                channelId,
              });
            })
            .finally(() => {
              if (channelCapabilitiesAbort === ac) {
                channelCapabilitiesAbort = null;
              }
            });
        },
        {
          timeoutMs: 1500,
          fallbackDelayMs: 175,
        },
      );
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    deferredCapabilitiesRefresh?.cancel();
    channelCapabilitiesAbort?.abort();
  });

  return {
    liveChannelCapabilities,
  };
}
