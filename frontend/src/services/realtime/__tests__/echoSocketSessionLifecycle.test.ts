import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { EchoSocketAdapter } from '@/services/adapters/socketAdapter';
import {
  applyEchoSocketActiveChannelChange,
  createEchoSocketSessionLifecycle,
  createEchoSocketIoState,
  shouldRecycleEchoSocketOnAuthChange,
} from '../echoSocketSessionLifecycle';

const connectAttemptMock = vi.hoisted(() => vi.fn());
const bootstrapMock = vi.hoisted(() => vi.fn());

vi.mock('../socketConnectOrchestrator', () => ({
  executeEchoSocketConnectAttempt: connectAttemptMock,
}));

vi.mock('../socketIoSessionWire', async () => {
  const actual = await vi.importActual<typeof import('../socketIoSessionWire')>(
    '../socketIoSessionWire',
  );
  return {
    ...actual,
    bootstrapEchoSocketAdapterSession: bootstrapMock,
  };
});

describe('createEchoSocketSessionLifecycle', () => {
  beforeEach(() => {
    connectAttemptMock.mockReset();
    bootstrapMock.mockReset();
    bootstrapMock.mockReturnValue({ emit: vi.fn() });
  });

  it('defers onAfterConnected until the socket connect event fires', async () => {
    const io = createEchoSocketIoState();
    const activeChannelId = ref('channel-1');
    const onAfterConnected = vi.fn();
    const connectHandlers: Array<() => void> = [];
    const fakeSocket = {
      connected: false,
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'connect') {
          connectHandlers.push(handler);
        }
      }),
      disconnect: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };

    connectAttemptMock.mockImplementation(async (opts) => {
      opts.afterConnectedSocket(fakeSocket as never);
    });

    const lifecycle = createEchoSocketSessionLifecycle({
      io,
      socketOff: () => false,
      socketIoBase: 'http://localhost:8080',
      getInboundListeners: () => ({}) as never,
      tryEmitRealtime: vi.fn() as never,
      activeChannelId,
      onAfterConnected,
    });

    await lifecycle.connectSocket();

    expect(onAfterConnected).not.toHaveBeenCalled();
    expect(connectHandlers).toHaveLength(1);

    fakeSocket.connected = true;
    connectHandlers[0]();

    expect(onAfterConnected).toHaveBeenCalledWith({
      activeChannelId: 'channel-1',
      rawSocketEmitJoinChannel: expect.any(Function),
      recovered: false,
    });
  });
});

function stubAdapter(emit: ReturnType<typeof vi.fn>): EchoSocketAdapter {
  return { emit, sendMessage: vi.fn() } as unknown as EchoSocketAdapter;
}

describe('shouldRecycleEchoSocketOnAuthChange', () => {
  it('returns true when prev is undefined (initial auth watch fire)', () => {
    expect(shouldRecycleEchoSocketOnAuthChange([true, 't'], undefined)).toBe(
      true,
    );
  });

  it('returns false when authenticated flag and token are unchanged', () => {
    const tuple = [true, 'same'] as const;
    expect(shouldRecycleEchoSocketOnAuthChange(tuple, tuple)).toBe(false);
  });

  it('returns true when access token changes', () => {
    expect(
      shouldRecycleEchoSocketOnAuthChange([true, 't2'], [true, 't1']),
    ).toBe(true);
  });

  it('returns true when isAuthenticated flips', () => {
    expect(shouldRecycleEchoSocketOnAuthChange([false, 't'], [true, 't'])).toBe(
      true,
    );
  });

  it('treats null and undefined token as distinct from string', () => {
    expect(
      shouldRecycleEchoSocketOnAuthChange([true, null], [true, undefined]),
    ).toBe(true);
  });
});

describe('applyEchoSocketActiveChannelChange', () => {
  it('no-ops when socket is missing or not connected', () => {
    const io = createEchoSocketIoState();
    const emit = vi.fn();
    io.adapter = stubAdapter(emit);

    applyEchoSocketActiveChannelChange(io, 'next');
    expect(emit).not.toHaveBeenCalled();

    io.socket = { connected: false } as import('socket.io-client').Socket;
    applyEchoSocketActiveChannelChange(io, 'next');
    expect(emit).not.toHaveBeenCalled();
  });

  it('joins channel and sets lastChannelId when no previous channel', () => {
    const io = createEchoSocketIoState();
    const emit = vi.fn();
    io.adapter = stubAdapter(emit);
    io.socket = {
      connected: true,
    } as unknown as import('socket.io-client').Socket;

    applyEchoSocketActiveChannelChange(io, 'ch-b');

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('joinChannel', 'ch-b');
    expect(io.lastChannelId).toBe('ch-b');
  });

  it('emits leave then join when switching channels', () => {
    const io = createEchoSocketIoState();
    const emit = vi.fn();
    io.adapter = stubAdapter(emit);
    io.socket = {
      connected: true,
    } as unknown as import('socket.io-client').Socket;
    io.lastChannelId = 'ch-a';

    applyEchoSocketActiveChannelChange(io, 'ch-b');

    expect(emit).toHaveBeenNthCalledWith(1, 'leaveChannel', 'ch-a');
    expect(emit).toHaveBeenNthCalledWith(2, 'joinChannel', 'ch-b');
    expect(io.lastChannelId).toBe('ch-b');
  });

  it('clears lastChannelId when next id is empty without join', () => {
    const io = createEchoSocketIoState();
    const emit = vi.fn();
    io.adapter = stubAdapter(emit);
    io.socket = {
      connected: true,
    } as unknown as import('socket.io-client').Socket;
    io.lastChannelId = 'ch-a';

    applyEchoSocketActiveChannelChange(io, '');

    expect(emit).toHaveBeenNthCalledWith(1, 'leaveChannel', 'ch-a');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(io.lastChannelId).toBeNull();
  });

  it('skips leave when next id equals last channel but still emits join', () => {
    const io = createEchoSocketIoState();
    const emit = vi.fn();
    io.adapter = stubAdapter(emit);
    io.socket = {
      connected: true,
    } as unknown as import('socket.io-client').Socket;
    io.lastChannelId = 'ch-a';

    applyEchoSocketActiveChannelChange(io, 'ch-a');

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('joinChannel', 'ch-a');
    expect(io.lastChannelId).toBe('ch-a');
  });
});
