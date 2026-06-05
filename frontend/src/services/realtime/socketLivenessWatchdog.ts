/**
 * Application-level liveness watchdog for the realtime Socket.IO client.
 *
 * Engine.IO's own ping/pong (see `pingInterval`/`pingTimeout` on the server) detects a dead
 * transport within ~45s, but a socket can become a "zombie" — `socket.connected === true`,
 * Engine.IO happily exchanging transport frames — while the Socket.IO session is effectively
 * dead (e.g. the server replica lost the session, or a proxy keeps long-polling alive after a
 * silent half-open). In that state no `disconnect` ever fires, so the Manager never reconnects.
 *
 * This watchdog actively probes the *application* layer: while the socket is connected and the
 * tab is visible, it emits an acked `client:ping` on an interval. Consecutive missed acks force
 * a clean recycle (teardown + reconnect). It only runs while visible — background timer
 * throttling would otherwise produce false positives, and the window-resume path already
 * recovers on return to foreground.
 *
 * The core is transport-agnostic and pure (inject `probe`/`recycle`/timers) so it is unit
 * testable without a real socket.
 */

export const SOCKET_LIVENESS_PROBE_INTERVAL_MS = 25_000;
export const SOCKET_LIVENESS_PROBE_TIMEOUT_MS = 10_000;
/** Consecutive missed probes before forcing a recycle (~2 intervals of grace). */
export const SOCKET_LIVENESS_MAX_STRIKES = 2;

export type SocketLivenessWatchdogDeps = {
  /** True while `io.socket?.connected`. */
  isConnected: () => boolean;
  /** True while the document is visible (probing is paused when hidden). */
  isVisible: () => boolean;
  /**
   * Emit the liveness probe. Resolves `true` if the server acked within `timeoutMs`,
   * `false` on timeout / no socket.
   */
  probe: (timeoutMs: number) => Promise<boolean>;
  /** Force a clean reconnect (teardown + connect). Called after {@link maxStrikes} misses. */
  recycle: () => void;
  /** Optional diagnostics sink. */
  onDiag?: (event: string, meta: Record<string, unknown>) => void;
  probeIntervalMs?: number;
  probeTimeoutMs?: number;
  maxStrikes?: number;
  setIntervalFn?: (
    fn: () => void,
    ms: number,
  ) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void;
};

export type SocketLivenessWatchdog = {
  start: () => void;
  stop: () => void;
  /** Run a single probe cycle now. Exposed for tests and never relied on externally. */
  tick: () => Promise<void>;
};

export function createSocketLivenessWatchdog(
  deps: SocketLivenessWatchdogDeps,
): SocketLivenessWatchdog {
  const probeIntervalMs =
    deps.probeIntervalMs ?? SOCKET_LIVENESS_PROBE_INTERVAL_MS;
  const probeTimeoutMs =
    deps.probeTimeoutMs ?? SOCKET_LIVENESS_PROBE_TIMEOUT_MS;
  const maxStrikes = deps.maxStrikes ?? SOCKET_LIVENESS_MAX_STRIKES;
  type IntervalId = ReturnType<typeof setInterval>;
  const setIntervalFn: (fn: () => void, ms: number) => IntervalId =
    deps.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms) as IntervalId);
  const clearIntervalFn: (id: IntervalId) => void =
    deps.clearIntervalFn ?? ((id) => clearInterval(id));

  let timer: IntervalId | null = null;
  let strikes = 0;
  let probing = false;

  async function tick(): Promise<void> {
    // Never overlap probes; a slow ack must not stack strikes.
    if (probing) return;
    if (!deps.isVisible() || !deps.isConnected()) {
      strikes = 0;
      return;
    }
    probing = true;
    try {
      const ok = await deps.probe(probeTimeoutMs);
      // The socket may have dropped during the probe; let the Manager handle that and
      // do not also count a strike (avoids double-recovery races).
      if (!deps.isConnected()) {
        strikes = 0;
        return;
      }
      if (ok) {
        if (strikes > 0) deps.onDiag?.('liveness_recovered', { strikes });
        strikes = 0;
        return;
      }
      strikes += 1;
      deps.onDiag?.('liveness_probe_missed', { strikes, maxStrikes });
      if (strikes >= maxStrikes) {
        strikes = 0;
        deps.onDiag?.('liveness_recycle', {});
        deps.recycle();
      }
    } finally {
      probing = false;
    }
  }

  function start(): void {
    if (timer) return;
    timer = setIntervalFn(() => {
      void tick();
    }, probeIntervalMs);
  }

  function stop(): void {
    if (timer) {
      clearIntervalFn(timer);
      timer = null;
    }
    strikes = 0;
    probing = false;
  }

  return { start, stop, tick };
}
