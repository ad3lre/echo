import { defineStore } from 'pinia';
import { ref } from 'vue';
import type {
  EchoChannelNotificationOverride,
  EchoServerNotificationLevel,
} from '@shared/types';
import {
  isEchoChannelSnoozed,
  resolveEffectiveChannelNotificationLevel,
} from '@shared/attentionPing';
import {
  fetchEchoChannelNotificationOverrides,
  putEchoChannelNotificationOverride,
} from '@/api/echo/attention';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';

/**
 * Per-channel notification overrides + snooze. Mirrors the server state and
 * applies optimistic updates so muting feels instant; the server remains the
 * source of truth for badges / the mention inbox.
 */
export const useChannelNotificationOverridesStore = defineStore(
  'channelNotificationOverrides',
  () => {
    const overridesByChannelId = ref<
      Record<string, EchoChannelNotificationOverride>
    >({});
    const loaded = ref(false);

    async function refresh(token: string): Promise<void> {
      const t = token.trim();
      if (!t) return;
      try {
        overridesByChannelId.value =
          await fetchEchoChannelNotificationOverrides(t);
        loaded.value = true;
      } catch (e) {
        reportPrimaryFlowFailure(
          'fetchEchoChannelNotificationOverrides',
          e,
          {},
          { showBanner: false },
        );
      }
    }

    function applyLocal(
      channelId: string,
      next: EchoChannelNotificationOverride | null,
    ): void {
      const map = { ...overridesByChannelId.value };
      if (
        !next ||
        (next.level == null && (!next.mutedUntil || next.mutedUntil === null))
      ) {
        delete map[channelId];
      } else {
        map[channelId] = next;
      }
      overridesByChannelId.value = map;
    }

    /** Persist an override (optimistic). Pass nulls to clear fields. */
    async function setOverride(
      token: string,
      channelId: string,
      override: EchoChannelNotificationOverride,
    ): Promise<void> {
      const t = token.trim();
      const cid = channelId.trim();
      if (!t || !cid) return;
      const previous = overridesByChannelId.value[cid] ?? null;
      const merged: EchoChannelNotificationOverride = {
        ...previous,
        ...override,
      };
      applyLocal(cid, merged);
      try {
        await putEchoChannelNotificationOverride(t, cid, override);
      } catch (e) {
        applyLocal(cid, previous);
        reportPrimaryFlowFailure(
          'putEchoChannelNotificationOverride',
          e,
          {},
          { showBanner: false },
        );
      }
    }

    /** Snooze until `untilMs` (epoch ms) or unmute when null. */
    function muteChannel(
      token: string,
      channelId: string,
      untilMs: number | null,
    ): Promise<void> {
      return setOverride(token, channelId, {
        mutedUntil: untilMs == null ? null : new Date(untilMs).toISOString(),
      });
    }

    function clearOverride(token: string, channelId: string): Promise<void> {
      return setOverride(token, channelId, { level: null, mutedUntil: null });
    }

    function isSnoozed(channelId: string, nowMs = Date.now()): boolean {
      return isEchoChannelSnoozed(overridesByChannelId.value[channelId], nowMs);
    }

    function effectiveLevel(
      channelId: string,
      serverLevel: EchoServerNotificationLevel,
      nowMs = Date.now(),
    ): EchoServerNotificationLevel {
      return resolveEffectiveChannelNotificationLevel(
        serverLevel,
        overridesByChannelId.value[channelId],
        nowMs,
      );
    }

    function reset(): void {
      overridesByChannelId.value = {};
      loaded.value = false;
    }

    return {
      overridesByChannelId,
      loaded,
      refresh,
      setOverride,
      muteChannel,
      clearOverride,
      isSnoozed,
      effectiveLevel,
      reset,
    };
  },
);
