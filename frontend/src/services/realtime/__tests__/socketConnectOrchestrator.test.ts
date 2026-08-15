import { describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { executeEchoSocketConnectAttempt } from '../socketConnectOrchestrator';

describe('executeEchoSocketConnectAttempt', () => {
  it('returns immediately when socket transport is off', async () => {
    const importIo = vi.fn();
    await executeEchoSocketConnectAttempt({
      socketOff: () => true,
      startGen: 0,
      getCurrentGeneration: () => 0,
      isSocketConnected: () => false,
      discardDisconnectedSocket: vi.fn(),
      socketIoBase: 'http://localhost',
      importSocketIoClient: importIo,
      afterConnectedSocket: vi.fn(),
    });
    expect(importIo).not.toHaveBeenCalled();
  });

  it('skips import when startGen no longer matches', async () => {
    const importIo = vi.fn();
    await executeEchoSocketConnectAttempt({
      socketOff: () => false,
      startGen: 1,
      getCurrentGeneration: () => 2,
      isSocketConnected: () => false,
      discardDisconnectedSocket: vi.fn(),
      socketIoBase: 'http://localhost',
      importSocketIoClient: importIo,
      afterConnectedSocket: vi.fn(),
    });
    expect(importIo).not.toHaveBeenCalled();
  });

  it('skips when already connected', async () => {
    const discard = vi.fn();
    const importIo = vi.fn();
    await executeEchoSocketConnectAttempt({
      socketOff: () => false,
      startGen: 1,
      getCurrentGeneration: () => 1,
      isSocketConnected: () => true,
      discardDisconnectedSocket: discard,
      socketIoBase: 'http://localhost',
      importSocketIoClient: importIo,
      afterConnectedSocket: vi.fn(),
    });
    expect(discard).not.toHaveBeenCalled();
    expect(importIo).not.toHaveBeenCalled();
  });

  it('aborts after import when generation changed', async () => {
    let gen = 1;
    const mockClient = {} as Socket;
    const io = vi.fn(() => mockClient);
    let resolveImport!: (v: typeof import('socket.io-client')) => void;
    const importPromise = new Promise<typeof import('socket.io-client')>(
      (r) => {
        resolveImport = r;
      },
    );
    const importIo = vi.fn(() => importPromise);
    const after = vi.fn();
    const p = executeEchoSocketConnectAttempt({
      socketOff: () => false,
      startGen: 1,
      getCurrentGeneration: () => gen,
      isSocketConnected: () => false,
      discardDisconnectedSocket: vi.fn(),
      socketIoBase: 'http://localhost',
      importSocketIoClient: importIo,
      afterConnectedSocket: after,
    });
    gen = 2;
    resolveImport!({ io } as unknown as typeof import('socket.io-client'));
    await p;
    expect(io).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it('discards stale socket, imports, io(), then afterConnectedSocket', async () => {
    const discard = vi.fn();
    const mockClient = { id: 'c1' } as Socket;
    const io = vi.fn(() => mockClient);
    const after = vi.fn();
    await executeEchoSocketConnectAttempt({
      socketOff: () => false,
      startGen: 5,
      getCurrentGeneration: () => 5,
      isSocketConnected: () => false,
      discardDisconnectedSocket: discard,
      socketIoBase: 'http://api.test',
      importSocketIoClient: async () =>
        ({ io }) as unknown as typeof import('socket.io-client'),
      afterConnectedSocket: after,
    });
    expect(discard).toHaveBeenCalledTimes(1);
    expect(io).toHaveBeenCalledWith(
      'http://api.test',
      expect.objectContaining({ path: '/socket.io', withCredentials: true }),
    );
    expect(after).toHaveBeenCalledWith(mockClient);
  });

  it('omits auth for non-native (cookie) clients', async () => {
    const io = vi.fn(
      (_base?: string, _opts?: Record<string, unknown>) => ({}) as Socket,
    );
    await executeEchoSocketConnectAttempt({
      socketOff: () => false,
      startGen: 1,
      getCurrentGeneration: () => 1,
      isSocketConnected: () => false,
      discardDisconnectedSocket: vi.fn(),
      socketIoBase: 'http://api.test',
      importSocketIoClient: async () =>
        ({ io }) as unknown as typeof import('socket.io-client'),
      afterConnectedSocket: vi.fn(),
    });
    expect(io.mock.calls[0]?.[1]).not.toHaveProperty('auth');
  });
});
