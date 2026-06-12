import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import {
  registerEchoSocketComposableEffects,
  type EchoSocketVueEffectHooks,
} from '../echoSocketComposableEffects';
import { createEchoSocketIoState } from '../echoSocketSessionLifecycle';
import * as sessionLifecycle from '../echoSocketSessionLifecycle';

describe('registerEchoSocketComposableEffects', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('mount runs mountWindowAndIdle only when authenticated; unmount runs dispose; channel watch forwards to apply helper', () => {
    const mountFns: (() => void)[] = [];
    const unmountFns: (() => void)[] = [];
    const watchCalls: Array<{
      source: unknown;
      cb: (next: unknown, prev?: unknown) => void;
    }> = [];

    const vue: EchoSocketVueEffectHooks = {
      onMounted: ((fn: () => void) => {
        mountFns.push(fn);
      }) as EchoSocketVueEffectHooks['onMounted'],
      onUnmounted: ((fn: () => void) => {
        unmountFns.push(fn);
      }) as EchoSocketVueEffectHooks['onUnmounted'],
      watch: ((
        source: unknown,
        cb: (next: unknown, prev?: unknown) => void,
      ) => {
        watchCalls.push({ source, cb });
      }) as EchoSocketVueEffectHooks['watch'],
    };

    const activeChannelId = ref('c0');
    const io = createEchoSocketIoState();
    const mountWindowAndIdle = vi.fn();
    const disposeSocketComposable = vi.fn();
    const teardownSocket = vi.fn();
    const connectSocket = vi.fn(() => Promise.resolve());

    registerEchoSocketComposableEffects(vue, {
      activeChannelId,
      getAuthKey: () => [true, 't0'] as const,
      io,
      socketOff: () => false,
      connectSocket,
      teardownSocket,
      mountWindowAndIdle,
      disposeSocketComposable,
    });

    expect(mountFns).toHaveLength(1);
    expect(unmountFns).toHaveLength(1);
    expect(watchCalls).toHaveLength(2);

    mountFns[0]!();
    expect(mountWindowAndIdle).toHaveBeenCalledTimes(1);

    const applySpy = vi.spyOn(
      sessionLifecycle,
      'applyEchoSocketActiveChannelChange',
    );
    watchCalls[0]!.cb('c9');
    expect(applySpy).toHaveBeenCalledWith(io, 'c9');

    unmountFns[0]!();
    expect(disposeSocketComposable).toHaveBeenCalledTimes(1);
  });

  it('mount skips mountWindowAndIdle when unauthenticated', () => {
    const mountFns: (() => void)[] = [];
    const vue: EchoSocketVueEffectHooks = {
      onMounted: ((fn: () => void) => {
        mountFns.push(fn);
      }) as EchoSocketVueEffectHooks['onMounted'],
      onUnmounted: (() => {}) as EchoSocketVueEffectHooks['onUnmounted'],
      watch: ((
        _source: unknown,
        _cb: (next: unknown, prev?: unknown) => void,
      ) => {}) as EchoSocketVueEffectHooks['watch'],
    };
    const mountWindowAndIdle = vi.fn();

    registerEchoSocketComposableEffects(vue, {
      activeChannelId: ref('c0'),
      getAuthKey: () => [false, null] as const,
      io: createEchoSocketIoState(),
      socketOff: () => false,
      connectSocket: vi.fn(() => Promise.resolve()),
      teardownSocket: vi.fn(),
      mountWindowAndIdle,
      disposeSocketComposable: vi.fn(),
    });

    mountFns[0]!();
    expect(mountWindowAndIdle).not.toHaveBeenCalled();
  });

  it('auth watch recycles when token changes', () => {
    const watchCalls: Array<{
      cb: (next: unknown, prev?: unknown) => void;
    }> = [];

    const vue: EchoSocketVueEffectHooks = {
      onMounted: (() => {}) as EchoSocketVueEffectHooks['onMounted'],
      onUnmounted: (() => {}) as EchoSocketVueEffectHooks['onUnmounted'],
      watch: ((
        _source: unknown,
        cb: (next: unknown, prev?: unknown) => void,
      ) => {
        watchCalls.push({ cb });
      }) as EchoSocketVueEffectHooks['watch'],
    };

    const teardownSocket = vi.fn();
    const connectSocket = vi.fn(() => Promise.resolve());

    registerEchoSocketComposableEffects(vue, {
      activeChannelId: ref('c1'),
      getAuthKey: () => [true, 't1'] as const,
      io: createEchoSocketIoState(),
      socketOff: () => false,
      connectSocket,
      teardownSocket,
      mountWindowAndIdle: () => {},
      disposeSocketComposable: () => {},
    });

    const authCb = watchCalls[1]!.cb;
    authCb([true, 't2'], [true, 't1']);
    expect(teardownSocket).toHaveBeenCalledTimes(1);
    expect(connectSocket).toHaveBeenCalledTimes(1);
  });

  it('auth watch skips when socketOff', () => {
    const watchCalls: Array<{
      cb: (next: unknown, prev?: unknown) => void;
    }> = [];

    const vue: EchoSocketVueEffectHooks = {
      onMounted: (() => {}) as EchoSocketVueEffectHooks['onMounted'],
      onUnmounted: (() => {}) as EchoSocketVueEffectHooks['onUnmounted'],
      watch: ((
        _source: unknown,
        cb: (next: unknown, prev?: unknown) => void,
      ) => {
        watchCalls.push({ cb });
      }) as EchoSocketVueEffectHooks['watch'],
    };

    const teardownSocket = vi.fn();
    const connectSocket = vi.fn(() => Promise.resolve());

    registerEchoSocketComposableEffects(vue, {
      activeChannelId: ref('c1'),
      getAuthKey: () => [true, 't2'] as const,
      io: createEchoSocketIoState(),
      socketOff: () => true,
      connectSocket,
      teardownSocket,
      mountWindowAndIdle: () => {},
      disposeSocketComposable: () => {},
    });

    watchCalls[1]!.cb([true, 't2'], [true, 't1']);
    expect(teardownSocket).not.toHaveBeenCalled();
    expect(connectSocket).not.toHaveBeenCalled();
  });

  it('auth watch disposes and does not reconnect when auth becomes false', () => {
    const watchCalls: Array<{
      cb: (next: unknown, prev?: unknown) => void;
    }> = [];

    const vue: EchoSocketVueEffectHooks = {
      onMounted: (() => {}) as EchoSocketVueEffectHooks['onMounted'],
      onUnmounted: (() => {}) as EchoSocketVueEffectHooks['onUnmounted'],
      watch: ((
        _source: unknown,
        cb: (next: unknown, prev?: unknown) => void,
      ) => {
        watchCalls.push({ cb });
      }) as EchoSocketVueEffectHooks['watch'],
    };

    const teardownSocket = vi.fn();
    const connectSocket = vi.fn(() => Promise.resolve());
    const disposeSocketComposable = vi.fn();

    registerEchoSocketComposableEffects(vue, {
      activeChannelId: ref('c1'),
      getAuthKey: () => [true, 't2'] as const,
      io: createEchoSocketIoState(),
      socketOff: () => false,
      connectSocket,
      teardownSocket,
      mountWindowAndIdle: vi.fn(),
      disposeSocketComposable,
    });

    watchCalls[1]!.cb([false, null], [true, 't2']);
    expect(teardownSocket).toHaveBeenCalledTimes(1);
    expect(disposeSocketComposable).toHaveBeenCalledTimes(1);
    expect(connectSocket).not.toHaveBeenCalled();
  });

  it('auth watch skips when auth tuple unchanged', () => {
    const watchCalls: Array<{
      cb: (next: unknown, prev?: unknown) => void;
    }> = [];

    const vue: EchoSocketVueEffectHooks = {
      onMounted: (() => {}) as EchoSocketVueEffectHooks['onMounted'],
      onUnmounted: (() => {}) as EchoSocketVueEffectHooks['onUnmounted'],
      watch: ((
        _source: unknown,
        cb: (next: unknown, prev?: unknown) => void,
      ) => {
        watchCalls.push({ cb });
      }) as EchoSocketVueEffectHooks['watch'],
    };

    const teardownSocket = vi.fn();
    const connectSocket = vi.fn(() => Promise.resolve());
    const same = [true, 't1'] as const;

    registerEchoSocketComposableEffects(vue, {
      activeChannelId: ref('c1'),
      getAuthKey: () => same,
      io: createEchoSocketIoState(),
      socketOff: () => false,
      connectSocket,
      teardownSocket,
      mountWindowAndIdle: () => {},
      disposeSocketComposable: () => {},
    });

    watchCalls[1]!.cb(same, same);
    expect(teardownSocket).not.toHaveBeenCalled();
    expect(connectSocket).not.toHaveBeenCalled();
  });

  it('auth watch recycles on authStateGeneration bump with null token (cookie-mode rotation)', () => {
    const watchCalls: Array<{
      cb: (next: unknown, prev?: unknown) => void;
    }> = [];

    const vue: EchoSocketVueEffectHooks = {
      onMounted: (() => {}) as EchoSocketVueEffectHooks['onMounted'],
      onUnmounted: (() => {}) as EchoSocketVueEffectHooks['onUnmounted'],
      watch: ((
        _source: unknown,
        cb: (next: unknown, prev?: unknown) => void,
      ) => {
        watchCalls.push({ cb });
      }) as EchoSocketVueEffectHooks['watch'],
    };

    const teardownSocket = vi.fn();
    const connectSocket = vi.fn(() => Promise.resolve());

    registerEchoSocketComposableEffects(vue, {
      activeChannelId: ref('c1'),
      getAuthKey: () => [true, null, 2] as const,
      io: createEchoSocketIoState(),
      socketOff: () => false,
      connectSocket,
      teardownSocket,
      mountWindowAndIdle: () => {},
      disposeSocketComposable: () => {},
    });

    /* Guest upgrade in cookie mode: isAuthenticated + accessToken unchanged
     * (true/null), only the generation counter moved. */
    watchCalls[1]!.cb([true, null, 2], [true, null, 1]);
    expect(teardownSocket).toHaveBeenCalledTimes(1);
    expect(connectSocket).toHaveBeenCalledTimes(1);
  });
});
