/**
 * After this many ms on the AppLayout chunk loader, show “still loading” hints (network, first visit, etc.).
 *
 * Default 8 s balances early feedback with not alarming users on a healthy slow first visit.
 * First-visit on 4G LTE can still take 15–22 s to download + parse the full shell graph;
 * `resolveAppLayoutLoadHintMs()` stretches this further on 2G/3G or Save-Data.
 */
export const APP_LAYOUT_LOAD_HINT_MS = 8_000;

/** If the dynamic import has not settled by then, show the load error UI (user can retry). */
export const APP_LAYOUT_LOAD_TIMEOUT_MS = 30_000;

/**
 * Hard cap on how long the `App.vue` boot gate holds its full-screen splash for a
 * no-session cold start. Now set to 3s for fast reveal with progressive loading.
 * The app shell with skeleton states shows while data hydrates in background.
 */
export const APP_BOOT_GATE_TIMEOUT_MS = 3_000;

/** Progressive boot gate: reveal the app shell with skeletons after this delay. */
export const APP_BOOT_GATE_FAST_REVEAL_MS = 600;

/** Boot gate still visible this long after workspace settled → report stall (gate race). */
export const APP_BOOT_GATE_SETTLED_STALL_MS = 1_500;

/** Extra grace after {@link APP_BOOT_GATE_TIMEOUT_MS} before reporting a gate timeout stall. */
export const APP_BOOT_GATE_STALL_GRACE_MS = 2_000;

/** Extra grace after the slow-load hint before reporting an AppLayout chunk stall. */
export const APP_LAYOUT_CHUNK_STALL_GRACE_MS = 7_000;

/**
 * AppLayout async chunk unresolved this long after the boot gate dismisses → report stall.
 * Hint + grace (~15 s on fast 4G) stays below the 30 s error timeout while avoiding
 * alerts during healthy first-visit downloads that routinely exceed 10 s.
 */
export function resolveAppLayoutChunkStallMs(): number {
  return resolveAppLayoutLoadHintMs() + APP_LAYOUT_CHUNK_STALL_GRACE_MS;
}

type NetworkInformationLike = {
  /** Round-trip time in ms (browser estimate). */
  rtt?: number;
  /** Downlink Mbps (browser estimate). */
  downlink?: number;
  /** Connection effective type. */
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g' | string;
  /** Data-Saver on. */
  saveData?: boolean;
};

/**
 * Connection-aware version of {@link APP_LAYOUT_LOAD_HINT_MS}.
 *
 * Rules:
 * - Save-Data or slow-2g/2g: 20 s (slow mobile).
 * - 3g or downlink < 1.5 Mbps or rtt > 400 ms: 15 s.
 * - Fast / unknown: return the default (8 s).
 *
 * Safe to call before Vue mounts; returns the default on non-browser targets.
 */
export function resolveAppLayoutLoadHintMs(): number {
  if (typeof navigator === 'undefined') return APP_LAYOUT_LOAD_HINT_MS;
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike;
    mozConnection?: NetworkInformationLike;
    webkitConnection?: NetworkInformationLike;
  };
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn) return APP_LAYOUT_LOAD_HINT_MS;
  if (conn.saveData) return 20_000;
  const type = conn.effectiveType;
  if (type === 'slow-2g' || type === '2g') return 20_000;
  if (type === '3g') return 15_000;
  if (
    typeof conn.downlink === 'number' &&
    conn.downlink > 0 &&
    conn.downlink < 1.5
  ) {
    return 15_000;
  }
  if (typeof conn.rtt === 'number' && conn.rtt > 400) return 15_000;
  return APP_LAYOUT_LOAD_HINT_MS;
}
