import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  registerChannelHandlers,
  revalidateRecoveredChannelRooms,
} from '../../sockets/channelHandlers';
import { canUserAccessChannel } from '../../domain/permissions/echoPermissions';
import {
  echoChannelExistsInDb,
  getEchoChannelServerId,
  getEchoStore,
} from '../../domain/echoStore';

vi.mock('../../domain/permissions/echoPermissions', () => ({
  canUserAccessChannel: vi.fn(),
}));

vi.mock('../../domain/echoStore', () => ({
  getEchoStore: vi.fn(),
  echoChannelExistsInDb: vi.fn(),
  getEchoChannelServerId: vi.fn(),
}));

type JoinHandler = (channelId: unknown) => void;

class FakeSocket {
  id = 'socket-test';
  handlers = new Map<string, JoinHandler>();
  joinedRooms: string[] = [];
  emittedEvents: Array<{ event: string; payload: unknown }> = [];

  on(event: string, handler: JoinHandler): void {
    this.handlers.set(event, handler);
  }

  join(room: string): void {
    this.joinedRooms.push(room);
  }

  leave(): void {}

  emit(event: string, payload: unknown): void {
    this.emittedEvents.push({ event, payload });
  }

  triggerJoin(channelId: unknown): void {
    const handler = this.handlers.get('joinChannel');
    if (!handler) throw new Error('joinChannel handler not registered');
    handler(channelId);
  }
}

function createLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('registerChannelHandlers joinChannel hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated join attempts before DB checks', async () => {
    const socket = new FakeSocket();
    const log = createLogger();

    registerChannelHandlers(socket as never, log as never, 'user_guest123', {
      authenticated: false,
    });

    socket.triggerJoin('channel-1');
    await flushAsyncWork();

    expect(socket.joinedRooms).toEqual([]);
    expect(getEchoStore).not.toHaveBeenCalled();
    expect(socket.emittedEvents).toContainEqual({
      event: 'error',
      payload: {
        code: 'UNAUTHENTICATED',
        channelId: 'channel-1',
        detail: 'Authentication is required to join channels.',
      },
    });
  });

  it('fails closed when Echo store pool is unavailable', async () => {
    const socket = new FakeSocket();
    const log = createLogger();

    vi.mocked(getEchoStore).mockResolvedValue({
      enabled: true,
      pool: null,
    } as never);

    registerChannelHandlers(socket as never, log as never, 'auth_user_1', {
      authenticated: true,
    });

    socket.triggerJoin('channel-2');
    await flushAsyncWork();

    expect(socket.joinedRooms).toEqual([]);
    expect(echoChannelExistsInDb).not.toHaveBeenCalled();
    expect(canUserAccessChannel).not.toHaveBeenCalled();
    expect(getEchoChannelServerId).not.toHaveBeenCalled();
    expect(socket.emittedEvents).toContainEqual({
      event: 'error',
      payload: {
        code: 'UNAVAILABLE',
        channelId: 'channel-2',
        detail: 'Channel joins are temporarily unavailable.',
      },
    });
  });

  it('denies join when channel access check fails', async () => {
    const socket = new FakeSocket();
    const log = createLogger();

    vi.mocked(getEchoStore).mockResolvedValue({
      enabled: true,
      pool: {} as never,
    } as never);
    vi.mocked(echoChannelExistsInDb).mockResolvedValue(true);
    vi.mocked(canUserAccessChannel).mockResolvedValue(false);

    registerChannelHandlers(socket as never, log as never, 'auth_user_1', {
      authenticated: true,
    });

    socket.triggerJoin('channel-denied');
    await flushAsyncWork();

    expect(socket.joinedRooms).toEqual([]);
    expect(socket.emittedEvents).toContainEqual({
      event: 'error',
      payload: {
        code: 'FORBIDDEN',
        channelId: 'channel-denied',
        detail: 'You do not have access to this channel.',
      },
    });
  });

  it('denies join when channel does not exist', async () => {
    const socket = new FakeSocket();
    const log = createLogger();

    vi.mocked(getEchoStore).mockResolvedValue({
      enabled: true,
      pool: {} as never,
    } as never);
    vi.mocked(echoChannelExistsInDb).mockResolvedValue(false);

    registerChannelHandlers(socket as never, log as never, 'auth_user_1', {
      authenticated: true,
    });

    socket.triggerJoin('missing-channel');
    await flushAsyncWork();

    expect(socket.joinedRooms).toEqual([]);
    expect(socket.emittedEvents).toContainEqual({
      event: 'error',
      payload: {
        code: 'NOT_FOUND',
        channelId: 'missing-channel',
        detail: 'Channel not found.',
      },
    });
  });
});

describe('revalidateRecoveredChannelRooms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('evicts recovered channel rooms when access is denied', async () => {
    const leftRooms: string[] = [];
    const socket = {
      id: 'socket-recovered',
      recovered: true,
      rooms: new Set(['socket-recovered', 'channel-lost']),
      leave(room: string) {
        leftRooms.push(room);
        this.rooms.delete(room);
      },
    };
    const log = createLogger();

    vi.mocked(getEchoStore).mockResolvedValue({
      enabled: true,
      pool: {} as never,
    } as never);
    vi.mocked(echoChannelExistsInDb).mockResolvedValue(true);
    vi.mocked(canUserAccessChannel).mockResolvedValue(false);

    await revalidateRecoveredChannelRooms(
      socket as never,
      log as never,
      'auth_user_1',
      { authenticated: true },
    );

    expect(leftRooms).toEqual(['channel-lost']);
    expect(socket.rooms.has('channel-lost')).toBe(false);
  });

  it('skips revalidation when socket is not recovered', async () => {
    const leftRooms: string[] = [];
    const socket = {
      id: 'socket-fresh',
      recovered: false,
      rooms: new Set(['socket-fresh', 'channel-ok']),
      leave(room: string) {
        leftRooms.push(room);
      },
    };
    const log = createLogger();

    await revalidateRecoveredChannelRooms(
      socket as never,
      log as never,
      'auth_user_1',
      { authenticated: true },
    );

    expect(leftRooms).toEqual([]);
    expect(getEchoStore).not.toHaveBeenCalled();
  });
});
