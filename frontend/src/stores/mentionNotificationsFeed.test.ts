import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const fetchMock = vi.fn();

vi.mock('@/api/echo/attention', () => ({
  fetchEchoMentionNotifications: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock('@/utils/primaryFlowFailure', () => ({
  reportPrimaryFlowFailure: vi.fn(),
}));

import { useMentionNotificationsFeedStore } from './mentionNotificationsFeed';

/** Flush pending microtasks without advancing the fake clock. */
async function flushMicrotasks(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('mentionNotificationsFeed store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue([]);
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the first feed eagerly — no debounce wait, so attention churn cannot starve it', async () => {
    const store = useMentionNotificationsFeedStore();

    store.scheduleRefresh('tok');

    // Fired synchronously: the request is in flight before any timer advance.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('tok', undefined);

    await flushMicrotasks();
    expect(store.loaded).toBe(true);
  });

  it('does not re-fire eagerly once loaded — subsequent churn is debounced', async () => {
    const store = useMentionNotificationsFeedStore();

    store.scheduleRefresh('tok');
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.loaded).toBe(true);

    // A single post-load trigger waits for the debounce window.
    store.scheduleRefresh('tok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not starve post-load refreshes under continuous sub-debounce churn', async () => {
    const store = useMentionNotificationsFeedStore();

    store.scheduleRefresh('tok');
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();

    // Re-trigger every 100ms (faster than the 400ms debounce) for 2s. Without a
    // max-wait cap the timer would reset on every call and never fire.
    for (let i = 0; i < 20; i += 1) {
      store.scheduleRefresh('tok');
      await vi.advanceTimersByTimeAsync(100);
    }

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('marks loaded on fetch failure so the inbox never waits forever, and retries later', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const store = useMentionNotificationsFeedStore();

    store.scheduleRefresh('tok');
    await flushMicrotasks();

    // Failure still flips loaded → merge falls back to client rows instead of hanging.
    expect(store.loaded).toBe(true);
    expect(store.rows).toEqual([]);

    // A retry is scheduled (30s); once the network recovers it repopulates.
    fetchMock.mockResolvedValueOnce([
      {
        key: 'c1:m1',
        channelId: 'c1',
        channelKind: 'server',
        messageId: 'm1',
        authorId: 'u1',
        authorName: 'Ada',
        content: 'hi @you',
        timestamp: '2026-06-04T00:00:00.000Z',
        mentionKinds: ['user'],
      },
    ]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.rows).toHaveLength(1);
  });

  it('reset() clears loaded/rows and cancels pending timers', async () => {
    const store = useMentionNotificationsFeedStore();
    store.scheduleRefresh('tok');
    await flushMicrotasks();
    expect(store.loaded).toBe(true);

    store.reset();
    expect(store.loaded).toBe(false);
    expect(store.rows).toEqual([]);

    // After reset the next trigger is eager again.
    fetchMock.mockClear();
    store.scheduleRefresh('tok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
