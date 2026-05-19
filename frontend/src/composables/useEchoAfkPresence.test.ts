/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, computed, nextTick } from 'vue';
import { effectScope } from 'vue';
import {
  useEchoAfkPresence,
  ECHO_AFK_IDLE_AFTER_MS,
} from '@/composables/useEchoAfkPresence';
import { selectSelfPresence } from '@/services/domain/presence';

describe('useEchoAfkPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets idle after AFK window when status was online', async () => {
    const enabled = ref(true);
    const status = ref<'online' | 'idle' | 'do_not_disturb' | 'offline'>(
      'online',
    );
    const setStatus = vi.fn((s: string) => {
      status.value = s as typeof status.value;
    });

    const scope = effectScope();
    scope.run(() => {
      useEchoAfkPresence({
        enabled: computed(() => enabled.value),
        getStatus: () => status.value,
        setStatus: setStatus as (
          s: 'online' | 'idle' | 'do_not_disturb' | 'offline',
        ) => void,
      });
    });

    await nextTick();
    expect(setStatus).not.toHaveBeenCalled();

    vi.advanceTimersByTime(ECHO_AFK_IDLE_AFTER_MS + 50);
    await nextTick();

    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith('idle');

    scope.stop();
  });

  it('returns to online on pointer activity after AFK idle', async () => {
    const enabled = ref(true);
    const status = ref<'online' | 'idle' | 'do_not_disturb' | 'offline'>(
      'online',
    );
    const setStatus = vi.fn((s: string) => {
      status.value = s as typeof status.value;
    });

    const scope = effectScope();
    scope.run(() => {
      useEchoAfkPresence({
        enabled: computed(() => enabled.value),
        getStatus: () => status.value,
        setStatus: setStatus as (
          s: 'online' | 'idle' | 'do_not_disturb' | 'offline',
        ) => void,
      });
    });

    await nextTick();
    vi.advanceTimersByTime(ECHO_AFK_IDLE_AFTER_MS + 10);
    await nextTick();
    expect(status.value).toBe('idle');
    setStatus.mockClear();

    window.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();

    expect(setStatus).toHaveBeenCalledWith('online');

    scope.stop();
  });

  it('returns to online when session status is stale-online but echo map is still idle', async () => {
    const enabled = ref(true);
    const sessionStatus = ref<'online' | 'idle' | 'do_not_disturb' | 'offline'>(
      'online',
    );
    const authoritativeByUserId = ref<Record<string, string | undefined>>({});
    const selfId = 'user-self';
    const setStatus = vi.fn((s: string) => {
      sessionStatus.value = s as typeof sessionStatus.value;
    });

    const scope = effectScope();
    scope.run(() => {
      useEchoAfkPresence({
        enabled: computed(() => enabled.value),
        getStatus: () =>
          selectSelfPresence({
            userId: selfId,
            authoritativeStatusesByUserId: authoritativeByUserId.value,
            sessionStatus: sessionStatus.value,
          }).status,
        setStatus: setStatus as (
          s: 'online' | 'idle' | 'do_not_disturb' | 'offline',
        ) => void,
      });
    });

    await nextTick();
    vi.advanceTimersByTime(ECHO_AFK_IDLE_AFTER_MS + 10);
    await nextTick();
    expect(sessionStatus.value).toBe('idle');
    authoritativeByUserId.value = { [selfId]: 'idle' };
    await nextTick();
    // Stale auth PATCH: session flips to online while Echo presence row is still idle.
    sessionStatus.value = 'online';
    await nextTick();

    setStatus.mockClear();
    window.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();

    expect(setStatus).toHaveBeenCalledWith('online');

    scope.stop();
  });

  it('returns to online on activity when echo map still shows online after auto-idle', async () => {
    const enabled = ref(true);
    const sessionStatus = ref<'online' | 'idle' | 'do_not_disturb' | 'offline'>(
      'online',
    );
    const authoritativeByUserId = ref<Record<string, string | undefined>>({
      'user-self': 'online',
    });
    const selfId = 'user-self';
    const setStatus = vi.fn((s: string) => {
      sessionStatus.value = s as typeof sessionStatus.value;
      if (s === 'idle') {
        authoritativeByUserId.value = { [selfId]: 'online' };
      }
    });

    const scope = effectScope();
    scope.run(() => {
      useEchoAfkPresence({
        enabled: computed(() => enabled.value),
        getStatus: () =>
          selectSelfPresence({
            userId: selfId,
            authoritativeStatusesByUserId: authoritativeByUserId.value,
            sessionStatus: sessionStatus.value,
          }).status,
        setStatus: setStatus as (
          s: 'online' | 'idle' | 'do_not_disturb' | 'offline',
        ) => void,
      });
    });

    await nextTick();
    vi.advanceTimersByTime(ECHO_AFK_IDLE_AFTER_MS + 10);
    await nextTick();
    expect(sessionStatus.value).toBe('idle');

    setStatus.mockClear();
    window.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();

    expect(setStatus).toHaveBeenCalledWith('online');

    scope.stop();
  });

  it('does not return to online on activity after manual idle', async () => {
    const enabled = ref(true);
    const status = ref<'online' | 'idle' | 'do_not_disturb' | 'offline'>(
      'idle',
    );
    const setStatus = vi.fn((s: string) => {
      status.value = s as typeof status.value;
    });

    const scope = effectScope();
    scope.run(() => {
      useEchoAfkPresence({
        enabled: computed(() => enabled.value),
        getStatus: () => status.value,
        setStatus: setStatus as (
          s: 'online' | 'idle' | 'do_not_disturb' | 'offline',
        ) => void,
      });
    });

    await nextTick();
    setStatus.mockClear();
    window.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();

    expect(setStatus).not.toHaveBeenCalled();

    scope.stop();
  });

  it('does not auto-idle when not online', async () => {
    const enabled = ref(true);
    const status = ref<'online' | 'idle' | 'do_not_disturb' | 'offline'>(
      'do_not_disturb',
    );
    const setStatus = vi.fn();

    const scope = effectScope();
    scope.run(() => {
      useEchoAfkPresence({
        enabled: computed(() => enabled.value),
        getStatus: () => status.value,
        setStatus,
      });
    });

    await nextTick();
    vi.advanceTimersByTime(ECHO_AFK_IDLE_AFTER_MS + 50);
    await nextTick();

    expect(setStatus).not.toHaveBeenCalled();

    scope.stop();
  });
});
