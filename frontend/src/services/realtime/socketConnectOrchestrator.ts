import type { Socket } from 'socket.io-client';
import { echoSocketIoManagerOptions } from './socketIoSessionWire';

/**
 * One attempt to create a fresh Socket.IO client: guards, discard stale instance,
 * dynamic import, `io()`, then caller wires adapter + inbound (see `useSocket` `connectSocket`).
 */
export async function executeEchoSocketConnectAttempt(opts: {
  socketOff: () => boolean;
  startGen: number;
  getCurrentGeneration: () => number;
  isSocketConnected: () => boolean;
  discardDisconnectedSocket: () => void;
  socketIoBase: string;
  importSocketIoClient: () => Promise<typeof import('socket.io-client')>;
  afterConnectedSocket: (client: Socket) => void;
}): Promise<void> {
  if (opts.socketOff()) return;
  if (opts.startGen !== opts.getCurrentGeneration()) return;
  if (opts.isSocketConnected()) return;
  opts.discardDisconnectedSocket();

  const { io } = await opts.importSocketIoClient();
  if (opts.socketOff()) return;
  if (opts.startGen !== opts.getCurrentGeneration()) return;

  const client = io(opts.socketIoBase, echoSocketIoManagerOptions());
  opts.afterConnectedSocket(client);
}
