import { describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import * as socketInbound from '../socketInbound';
import {
  bootstrapEchoSocketAdapterSession,
  echoSocketIoManagerOptions,
  teardownEchoSocketClientSession,
} from '../socketIoSessionWire';

describe('echoSocketIoManagerOptions', () => {
  it('uses polling-first transports in dev and websocket-first otherwise', () => {
    const opts = echoSocketIoManagerOptions();
    expect(opts.path).toBe('/socket.io');
    expect(opts.withCredentials).toBe(true);
    expect(opts.reconnectionAttempts).toBe(Number.POSITIVE_INFINITY);
    if (import.meta.env.DEV) {
      expect(opts.transports[0]).toBe('polling');
    } else {
      expect(opts.transports[0]).toBe('websocket');
    }
  });
});

describe('teardownEchoSocketClientSession', () => {
  it('detaches inbound, sets disconnected, clears refs in order', () => {
    const detachSpy = vi.spyOn(socketInbound, 'detachEchoSocketInbound');
    const disconnect = vi.fn();
    const sock = { disconnect, off: vi.fn() } as unknown as Socket;
    const order: string[] = [];
    teardownEchoSocketClientSession({
      socket: sock,
      inboundListeners: {} as socketInbound.EchoSocketInboundListeners,
      beforeDisconnect: () => order.push('before'),
      afterDisconnect: () => order.push('after'),
    });
    expect(detachSpy).toHaveBeenCalledWith(sock, expect.anything());
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['before', 'after']);
  });
});

describe('bootstrapEchoSocketAdapterSession', () => {
  it('attaches inbound handlers and returns adapter', () => {
    const attachSpy = vi.spyOn(socketInbound, 'attachEchoSocketInbound');
    const emit = vi.fn();
    const rawSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit,
    } as unknown as Socket;
    const adapter = bootstrapEchoSocketAdapterSession({
      rawSocket,
      inboundListeners: {
        onMessage: vi.fn(),
        onMessageFailed: vi.fn(),
        onMessageAck: vi.fn(),
        onMessageUpdated: vi.fn(),
        onMessageEmbeds: vi.fn(),
        onMessageMediaMirror: vi.fn(),
        onMessageDeleted: vi.fn(),
        onMessageReactions: vi.fn(),
        onMessagePins: vi.fn(),
        onSocketConnected: vi.fn(),
        onDisconnectIo: vi.fn(),
        onConnectError: vi.fn(),
        onSocketError: vi.fn(),
        onDmActivityIo: vi.fn(),
        onDmCallIo: vi.fn(),
        onDmThreadActivityIo: vi.fn(),
        onReadStateUpdateIo: vi.fn(),
        onAttentionUpdateIo: vi.fn(),
        onPresenceIo: vi.fn(),
        onEchoWorkspaceEventIo: vi.fn(),
        onPollUpdated: vi.fn(),
        onPollVoteFailed: vi.fn(),
        onChannelTypingIo: vi.fn(),
        onDeployCountdownIo: vi.fn(),
      },
    });
    expect(adapter).toBeDefined();
    expect(attachSpy).toHaveBeenCalledWith(rawSocket, expect.anything());
    expect(emit).not.toHaveBeenCalledWith('joinChannel', expect.anything());
  });
});
