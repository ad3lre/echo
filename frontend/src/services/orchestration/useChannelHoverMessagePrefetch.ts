import { onScopeDispose, watch, type Ref } from 'vue';
import { useAuthSessionStore } from '@/stores/authSession';
import { prefetchChannelMessagesFirstPage } from '@/services/orchestration/echoWorkspaceChannelPrefetch';

const HOVER_PREFETCH_DELAY_MS = 120;

/**
 * Prefetch the first history page when the user hovers a guild text channel so
 * channel switches often hit the in-memory cache immediately.
 */
export function useChannelHoverMessagePrefetch(opts: {
  hoveredChannelId: Ref<string | null>;
  activeChannelId: Ref<string>;
  isPrefetchableTextChannel: (channelId: string) => boolean;
}): void {
  const auth = useAuthSessionStore();
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingChannelId = '';

  function clearHoverTimer(): void {
    if (hoverTimer != null) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    pendingChannelId = '';
  }

  function schedulePrefetch(channelId: string): void {
    clearHoverTimer();
    pendingChannelId = channelId;
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      const cid = pendingChannelId;
      pendingChannelId = '';
      if (!cid || cid === opts.activeChannelId.value.trim()) return;
      if (!opts.isPrefetchableTextChannel(cid)) return;
      const token = auth.accessToken?.trim() ?? '';
      if (!token || !auth.isAuthenticated) return;
      void prefetchChannelMessagesFirstPage(token, cid, {
        flow: 'prefetchChannelHover',
      });
    }, HOVER_PREFETCH_DELAY_MS);
  }

  watch(
    () => opts.hoveredChannelId.value,
    (channelId) => {
      const cid = channelId?.trim() ?? '';
      if (!cid) {
        clearHoverTimer();
        return;
      }
      schedulePrefetch(cid);
    },
  );

  watch(
    () => opts.activeChannelId.value,
    (channelId) => {
      const cid = channelId.trim();
      if (cid && pendingChannelId === cid) clearHoverTimer();
    },
  );

  onScopeDispose(clearHoverTimer);
}
