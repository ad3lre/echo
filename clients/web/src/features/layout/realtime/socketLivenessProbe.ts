import type { Socket } from 'socket.io-client';

/**
 * Emit an acked `client:ping` and resolve `true` only if the server acks within `timeoutMs`.
 * Resolves `false` on timeout, transport error, or when there is no connected socket.
 *
 * Uses Socket.IO's per-emit `.timeout(ms)` so the ack callback receives a leading error arg
 * when the deadline passes.
 */
export function probeSocketLiveness(
  socket: Socket | null,
  timeoutMs: number,
): Promise<boolean> {
  if (!socket || !socket.connected) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      socket.timeout(timeoutMs).emit('client:ping', (err: unknown) => {
        done(!err);
      });
    } catch {
      done(false);
    }
  });
}
