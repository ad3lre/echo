/**
 * Feature flags for scroll-feel experiments (A/B/C). Defaults enable all optimizations.
 * Bisect via localStorage, e.g. `echo_scroll_exp_a=0`.
 */

export type MessageListScrollExperimentFlags = {
  /** Experiment A: defer ordinary compensation during gestures; anchor reconcile at settle. */
  compensationAnchorReconcile: boolean;
  /** Experiment B: bounded resize measurement deferral during gestures. */
  resizeMeasureDefer: boolean;
  /** Experiment C: stable moderate overscan (no idle↔fast transition mid-gesture). */
  stableModerateOverscan: boolean;
  /** Stable overscan value when experiment C is on (10 | 20 | 40). */
  stableOverscanPx: number;
  /** Single mount measure (no sync + rAF duplicate). */
  singleMountMeasure: boolean;
};

const LS_PREFIX = 'echo_scroll_exp_';

function readBool(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
  } catch {
    /* ignore */
  }
  return defaultValue;
}

function readStableOverscan(): number {
  if (typeof window === 'undefined') return 20;
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}stable_overscan`);
    const n = raw != null ? Number(raw) : NaN;
    if (n === 10 || n === 20 || n === 40) return n;
  } catch {
    /* ignore */
  }
  return 20;
}

export function getMessageListScrollExperimentFlags(): MessageListScrollExperimentFlags {
  return {
    compensationAnchorReconcile: readBool('a', true),
    resizeMeasureDefer: readBool('b', true),
    stableModerateOverscan: readBool('c', true),
    stableOverscanPx: readStableOverscan(),
    singleMountMeasure: readBool('single_measure', true),
  };
}

export function resetMessageListScrollExperimentFlagsForTests(): void {
  if (typeof window === 'undefined') return;
  for (const key of ['a', 'b', 'c', 'single_measure', 'stable_overscan']) {
    try {
      localStorage.removeItem(`${LS_PREFIX}${key}`);
    } catch {
      /* ignore */
    }
  }
}
