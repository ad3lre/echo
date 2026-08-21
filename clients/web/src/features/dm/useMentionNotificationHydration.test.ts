// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

// Treat every mention message as "not in the local cache" so a stub row has no
// way to self-resolve — isolating the watchdog as the only thing that can clear it.
vi.mock('@/features/chat/domain/channelMessageAuthority', () => ({
  hasChannelMessageInBucket: () => false,
  insertChannelMessageFromHistory: () => {},
}));

import { useMentionNotificationHydration } from './useMentionNotificationHydration';
import type { DmMentionNotificationRow } from './collectDmMentionNotifications';
import {
  applyMentionNotificationHydrationFailures,
  MENTION_NOTIFICATION_FAILED_PREVIEW,
  MENTION_NOTIFICATION_STUB_PREVIEW,
} from './mentionNotificationAuthority';

function stubRow(
  channelId: string,
  messageId: string,
): DmMentionNotificationRow {
  return {
    key: `${channelId}:${messageId}`,
    channelId,
    channelLabel: '',
    messageId,
    authorId: '',
    authorName: '…',
    preview: MENTION_NOTIFICATION_STUB_PREVIEW,
    timestamp: '2026-06-04T00:00:00.000Z',
    mentionKinds: ['user'],
  };
}

describe('useMentionNotificationHydration watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flips a stub that never hydrates to the failed preview within the watchdog window', async () => {
    // Logged out → the prefetch path no-ops, mimicking a wedged/stalled hydrate
    // that never calls markHydrationFailures itself.
    const rows = ref<DmMentionNotificationRow[]>([stubRow('chan-1', 'msg-1')]);
    const scope = effectScope(true);
    const { failedChannelIds } = scope.run(() =>
      useMentionNotificationHydration({ rows }),
    )!;

    // Before the watchdog elapses the row is still a loading stub.
    expect(failedChannelIds.value.has('chan-1')).toBe(false);
    expect(
      applyMentionNotificationHydrationFailures(
        rows.value,
        failedChannelIds.value,
      )[0]!.preview,
    ).toBe(MENTION_NOTIFICATION_STUB_PREVIEW);

    await vi.advanceTimersByTimeAsync(12_000);

    // Watchdog fired: the channel is marked failed, so the row surfaces an
    // actionable message instead of an indefinite spinner.
    expect(failedChannelIds.value.has('chan-1')).toBe(true);
    expect(
      applyMentionNotificationHydrationFailures(
        rows.value,
        failedChannelIds.value,
      )[0]!.preview,
    ).toBe(MENTION_NOTIFICATION_FAILED_PREVIEW);

    scope.stop();
  });

  it('is not starved by reactive churn — fires within the window despite continuous re-triggers', async () => {
    // Reproduces the failure class of the old feed debounce: a hot reactive
    // dependency re-triggering the watch faster than the timeout. The watchdog
    // must NOT reset on each tick, or it could be deferred forever.
    const stub = stubRow('chan-1', 'msg-1');
    const rows = ref<DmMentionNotificationRow[]>([stub]);
    const scope = effectScope(true);
    const { failedChannelIds } = scope.run(() =>
      useMentionNotificationHydration({ rows }),
    )!;

    // Churn every 1s for 11s by changing rowsSignature (a fresh decoy row each
    // time), while the chan-1 stub stays present the whole time.
    for (let i = 1; i <= 11; i += 1) {
      rows.value = [
        stub,
        {
          ...stubRow('chan-2', `decoy-${i}`),
          preview: 'resolved',
          authorName: 'Bo',
        },
      ];
      await vi.advanceTimersByTimeAsync(1_000);
    }
    // ~11s elapsed: still within the 12s window measured from first stub, NOT reset.
    expect(failedChannelIds.value.has('chan-1')).toBe(false);

    await vi.advanceTimersByTimeAsync(1_100);
    // Fired at ~12s from the first stub — churn did not push it out.
    expect(failedChannelIds.value.has('chan-1')).toBe(true);
    // The decoy (non-stub) channel is never marked failed.
    expect(failedChannelIds.value.has('chan-2')).toBe(false);

    scope.stop();
  });

  it('does not fire the watchdog once the stub resolves on its own', async () => {
    const rows = ref<DmMentionNotificationRow[]>([stubRow('chan-1', 'msg-1')]);
    const scope = effectScope(true);
    const { failedChannelIds } = scope.run(() =>
      useMentionNotificationHydration({ rows }),
    )!;

    // The row resolves (e.g. server feed merge landed real content) before the window.
    await vi.advanceTimersByTimeAsync(2_000);
    rows.value = [
      {
        ...stubRow('chan-1', 'msg-1'),
        authorName: 'Ada',
        preview: 'hey there',
      },
    ];
    await vi.advanceTimersByTimeAsync(12_000);

    expect(failedChannelIds.value.has('chan-1')).toBe(false);

    scope.stop();
  });
});
