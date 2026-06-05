import type { Socket } from 'socket.io-client';
import { echoSocketIoManagerOptions } from './socketIoSessionWire';
import {
  getNativeAccessToken,
  isNativeBearerClient,
} from '@/services/auth/nativeAuthToken';

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

  const client = io(opts.socketIoBase, {
    ...echoSocketIoManagerOptions(),
    ...(isNativeBearerClient()
      ? {
          // Callback form (not a static object): Socket.IO invokes this on EVERY
          // (re)connect handshake. Native access tokens are short-lived (~15 min) and
          // rotate, so a frozen `auth: { token }` captured here would replay a stale
          // token on Manager auto-reconnect → permanent 401 loop. Reading the token
          // afresh per handshake lets the connect_error→refresh→retry cycle self-heal.
          auth: (cb: (data: Record<string, unknown>) => void) => {
            const token = getNativeAccessToken();
            cb(token ? { token } : {});
          },
        }
      : {}),
  });
  opts.afterConnectedSocket(client);
}
