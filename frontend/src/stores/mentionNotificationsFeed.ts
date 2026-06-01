import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { EchoMentionNotificationRow } from '@shared/types';
import { fetchEchoMentionNotifications } from '@/api/echo/attention';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';

const REFRESH_DEBOUNCE_MS = 400;

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

    async function runRefresh(token: string, limit?: number): Promise<void> {
      const trimmed = token.trim();
      if (!trimmed) return;
      loading.value = true;
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

    /** Debounced refresh for chatty triggers (attention snapshot churn). */
    function scheduleRefresh(token: string, limit?: number): void {
      if (!token.trim()) return;
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refresh(token, limit);
      }, REFRESH_DEBOUNCE_MS);
    }

    function reset(): void {
      if (debounceTimer != null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      rows.value = [];
      loaded.value = false;
      loading.value = false;
      queued = false;
    }

    return { rows, loaded, loading, refresh, scheduleRefresh, reset };
  },
);
