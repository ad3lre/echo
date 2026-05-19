import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';

const socketTransportMock = vi.hoisted(() => ({
  SOCKET_DISABLED: true,
}));

vi.mock('@/services/realtime/socketTransport', () => socketTransportMock);

import { createEchoSocketRealtimeWiring } from '../echoSocketRealtimeWiring';

describe('createEchoSocketRealtimeWiring', () => {
  beforeEach(() => {
    socketTransportMock.SOCKET_DISABLED = true;
  });

  afterEach(() => {
    socketTransportMock.SOCKET_DISABLED = true;
  });

  it('returns io, lifecycle handles, and the domain-provided port', () => {
    const activeChannelId = ref('ch1');
    const port = {
      sendMessage: vi.fn(),
    } as unknown as import('../echoRealtimePort').EchoRealtimePort;
    const inboundListeners =
      {} as unknown as import('../socketInbound').EchoSocketInboundListeners;

    const createDomain = vi.fn(() => ({
      port,
      inboundListeners,
    }));

    const w = createEchoSocketRealtimeWiring({ activeChannelId, createDomain });

    expect(w.io.socket).toBeNull();
    expect(w.io.adapter).toBeNull();
    expect(w.socketOff()).toBe(true);

    expect(typeof w.connectSocket).toBe('function');
    expect(typeof w.teardownSocket).toBe('function');
    expect(typeof w.disposeSocketComposable).toBe('function');
    expect(typeof w.mountWindowAndIdle).toBe('function');

    expect(w.port).toBe(port);
    expect(createDomain).toHaveBeenCalledTimes(1);
    expect(createDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        io: w.io,
        socketOff: expect.any(Function),
        tryEmitRealtime: expect.any(Function),
        getSocketConnected: expect.any(Function),
        activeChannelId,
      }),
    );
  });

  it('connectSocket resolves immediately when socket transport is disabled', async () => {
    const w = createEchoSocketRealtimeWiring({
      activeChannelId: ref('c'),
      createDomain: () =>
        ({
          port: {} as unknown as import('../echoRealtimePort').EchoRealtimePort,
          inboundListeners:
            {} as unknown as import('../socketInbound').EchoSocketInboundListeners,
        }) as const,
    });
    await expect(w.connectSocket()).resolves.toBeUndefined();
  });

  it('mountWindowAndIdle is a no-op when transport is disabled', () => {
    const w = createEchoSocketRealtimeWiring({
      activeChannelId: ref('c'),
      createDomain: () =>
        ({
          port: {} as unknown as import('../echoRealtimePort').EchoRealtimePort,
          inboundListeners:
            {} as unknown as import('../socketInbound').EchoSocketInboundListeners,
        }) as const,
    });
    expect(() => w.mountWindowAndIdle()).not.toThrow();
  });
});
