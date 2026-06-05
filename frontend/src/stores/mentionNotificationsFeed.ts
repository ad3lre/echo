import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { EchoMentionNotificationRow } from '@shared/types';
import { fetchEchoMentionNotifications } from '@/api/echo/attention';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';

const REFRESH_DEBOUNCE_MS = 400;
// Upper bound on how long the debounced path may keep deferring a refresh. The
// controller re-triggers `scheduleRefresh` on every `channelAttentionByChannelId`
// change; in an active workspace that map churns faster than the debounce window,
// which would otherwise reset the timer forever and starve the very first load.
const REFRESH_DEBOUNCE_MAX_WAIT_MS = 1_500;
const REFRESH_RETRY_DELAY_MS = 30_000;

/**
 * Caches the server-authoritative mention inbox feed (`GET /attention/mentions`).
 * Refreshes are coalesced so bursts of attention updates trigger at most one
 * in-flight fetch; a queued refresh runs once the current one settles.
 */
export const useMentionNotificationsFeedStore = defineStore(
  'mentionNotificationsFeed',
  () => {
    const rows = ref<EchoMentionNotificationRow[]>([]);
    const loaded = ref(false);
    const loading = ref(false);

    let inFlight: Promise<void> | null = null;
    let queued = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let debounceMaxDeadline = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function clearRetry(): void {
      if (retryTimer != null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    }

    async function runRefresh(token: string, limit?: number): Promise<void> {
      const trimmed = token.trim();
      if (!trimmed) return;
      loading.value = true;
      clearRetry();
      try {
        rows.value = await fetchEchoMentionNotifications(trimmed, limit);
        loaded.value = true;
      } catch (e) {
        reportPrimaryFlowFailure(
          'fetchEchoMentionNotifications',
          e,
          {},
          { showBanner: false },
        );
        // Mark as loaded so the UI doesn't wait indefinitely on a failed fetch.
        // The merge will fall back to hydrated client rows. Schedule a retry so
        // stubs resolve once the network recovers.
        loaded.value = true;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void refresh(trimmed, limit);
        }, REFRESH_RETRY_DELAY_MS);
      } finally {
        loading.value = false;
      }
    }

    function refresh(token: string, limit?: number): Promise<void> {
      if (inFlight) {
        queued = true;
        return inFlight;
      }
      inFlight = runRefresh(token, limit).finally(() => {
        inFlight = null;
        if (queued) {
          queued = false;
          void refresh(token, limit);
        }
      });
      return inFlight;
    }

    /**
     * Refresh trigger for the inbox feed. The first load after login/reset fires
     * immediately: the server feed is self-contained (it does not read the client
     * attention snapshot), so there is nothing to wait for, and debouncing the
     * first load lets attention churn reset the timer forever — leaving the inbox
     * stuck on "Loading mention…" stubs. Later (churn-driven) refreshes are
     * debounced, with a max-wait cap so continuous churn cannot starve the timer.
     */
    function scheduleRefresh(token: string, limit?: number): void {
      const trimmed = token.trim();
      if (!trimmed) return;

      if (!loaded.value && !inFlight) {
        if (debounceTimer != null) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        debounceMaxDeadline = 0;
        void refresh(trimmed, limit);
        return;
      }

      const now = Date.now();
      if (debounceTimer == null) {
        debounceMaxDeadline = now + REFRESH_DEBOUNCE_MAX_WAIT_MS;
      } else {
        clearTimeout(debounceTimer);
      }
      const wait = Math.max(
        0,
        Math.min(REFRESH_DEBOUNCE_MS, debounceMaxDeadline - now),
      );
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        debounceMaxDeadline = 0;
        void refresh(trimmed, limit);
      }, wait);
    }

    function reset(): void {
      if (debounceTimer != null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      debounceMaxDeadline = 0;
      clearRetry();
      rows.value = [];
      loaded.value = false;
      loading.value = false;
      queued = false;
    }

    return { rows, loaded, loading, refresh, scheduleRefresh, reset };
  },
);
