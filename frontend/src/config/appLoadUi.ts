/**
 * After this many ms on the AppLayout chunk loader, show “still loading” hints (network, first visit, etc.).
 *
 * Default 22 s is tuned for mobile cold starts:
 * - first-visit on 4G LTE typically takes 15–22 s to download + parse the Vue bundle,
 * - iOS Safari spends extra time waking a backgrounded renderer / hydrating a PWA,
 * - earlier thresholds (12 s) were scaring users whose load was still perfectly healthy.
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
