import { onScopeDispose, watch, type Ref } from 'vue';
import {
  postBootStallAlert,
  type BootStallAlertKind,
} from '@/api/echo/bootStallAlert';
import {
  APP_BOOT_GATE_SETTLED_STALL_MS,
  APP_BOOT_GATE_STALL_GRACE_MS,
  resolveAppLayoutChunkStallMs,
} from '@/config/appLoadUi';

const SESSION_REPORT_KEY = 'echo_boot_stall_alert_sent';

type NetworkInformationLike = {
  rtt?: number;
  downlink?: number;
  effectiveType?: string;
  saveData?: boolean;
};

type BootStallWatcherDeps = {
  showBootGate: Ref<boolean>;
  initialLoadSettled: Ref<boolean>;
  showAppLayout: Ref<boolean>;
  appLayoutResolved: Ref<boolean>;
  bootGateTimeoutMs: number;
  hasSession: boolean;
};

function readConnectionMeta(): Record<string, unknown> | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike;
    mozConnection?: NetworkInformationLike;
    webkitConnection?: NetworkInformationLike;
  };
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn) return undefined;
  return {
    effectiveType: conn.effectiveType,
    downlink: conn.downlink,
    rtt: conn.rtt,
    saveData: conn.saveData,
  };
}

function bootStallAlertsEnabled(): boolean {
  if (import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  return true;
}

function alreadyReportedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_REPORT_KEY) === '1';
  } catch {
    return false;
  }
}

function markReportedThisSession(): void {
  try {
    sessionStorage.setItem(SESSION_REPORT_KEY, '1');
  } catch {
    /* ignore */
  }
}

function createStallReporter(
  deps: BootStallWatcherDeps,
  mountedAt: number,
  isReported: () => boolean,
  markReported: () => void,
): (kind: BootStallAlertKind, timing: Record<string, unknown>) => void {
  return (kind, timing) => {
    if (isReported() || alreadyReportedThisSession()) return;
    markReported();
    markReportedThisSession();
    postBootStallAlert({
      kind,
      client: {
        userAgent:
          typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        mode: import.meta.env.MODE,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        connection: readConnectionMeta(),
      },
      timing: {
        msSinceMount: Date.now() - mountedAt,
        ...timing,
      },
      state: {
        initialLoadSettled: deps.initialLoadSettled.value,
        showBootGate: deps.showBootGate.value,
        appLayoutResolved: deps.appLayoutResolved.value,
        showAppLayout: deps.showAppLayout.value,
        hasSession: deps.hasSession,
      },
    });
  };
}

function watchSettledGateStall(
  deps: BootStallWatcherDeps,
  report: (kind: BootStallAlertKind, timing: Record<string, unknown>) => void,
): { stop: () => void; clearTimer: () => void } {
  let settledStallTimer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => {
    if (settledStallTimer !== undefined) {
      clearTimeout(settledStallTimer);
      settledStallTimer = undefined;
    }
  };
  const stop = watch(
    () =>
      deps.showAppLayout.value &&
      deps.showBootGate.value &&
      deps.initialLoadSettled.value,
    (anomaly) => {
      clearTimer();
      if (!anomaly) return;
      settledStallTimer = setTimeout(() => {
        if (
          deps.showAppLayout.value &&
          deps.showBootGate.value &&
          deps.initialLoadSettled.value
        ) {
          report('boot_gate_settled_still_visible', {
            stallThresholdMs: APP_BOOT_GATE_SETTLED_STALL_MS,
          });
        }
      }, APP_BOOT_GATE_SETTLED_STALL_MS);
    },
    { immediate: true },
  );
  return { stop, clearTimer };
}

function watchLayoutChunkStall(
  deps: BootStallWatcherDeps,
  report: (kind: BootStallAlertKind, timing: Record<string, unknown>) => void,
  mountedAt: number,
): { stop: () => void; clearTimer: () => void } {
  let layoutStallTimer: ReturnType<typeof setTimeout> | undefined;
  let gateDismissedAt: number | undefined;
  const clearTimer = () => {
    if (layoutStallTimer !== undefined) {
      clearTimeout(layoutStallTimer);
      layoutStallTimer = undefined;
    }
  };
  const stop = watch(
    () =>
      deps.showAppLayout.value &&
      !deps.showBootGate.value &&
      !deps.appLayoutResolved.value,
    (stalled) => {
      clearTimer();
      if (!stalled) {
        gateDismissedAt = undefined;
        return;
      }
      if (gateDismissedAt === undefined) {
        gateDismissedAt = Date.now();
      }
      const layoutDelayMs = resolveAppLayoutChunkStallMs();
      layoutStallTimer = setTimeout(() => {
        const stillStalled =
          deps.showAppLayout.value &&
          !deps.showBootGate.value &&
          !deps.appLayoutResolved.value;
        if (!stillStalled) return;
        const msSinceGateDismiss =
          gateDismissedAt !== undefined
            ? Date.now() - gateDismissedAt
            : undefined;
        report('app_layout_chunk_stall', {
          stallThresholdMs: layoutDelayMs,
          msSinceGateDismiss,
          msSinceMount: Date.now() - mountedAt,
        });
      }, layoutDelayMs);
    },
    { immediate: true },
  );
  return { stop, clearTimer };
}

/**
 * Watches boot-gate and AppLayout async-load stalls. On detection, sends one
 * email per browser session to bugs@chat-echo.com via the public alert API.
 */
export function useAppBootStallWatcher(deps: BootStallWatcherDeps): void {
  if (!bootStallAlertsEnabled()) return;
  if (alreadyReportedThisSession()) return;

  const mountedAt = Date.now();
  let reported = false;
  const report = createStallReporter(
    deps,
    mountedAt,
    () => reported,
    () => {
      reported = true;
    },
  );

  const settledWatch = watchSettledGateStall(deps, report);
  const layoutWatch = watchLayoutChunkStall(deps, report, mountedAt);

  const safetyDelayMs = deps.bootGateTimeoutMs + APP_BOOT_GATE_STALL_GRACE_MS;
  const safetyTimer = setTimeout(() => {
    if (deps.showAppLayout.value && deps.showBootGate.value) {
      report('boot_gate_past_safety_timeout', {
        stallThresholdMs: safetyDelayMs,
      });
    }
  }, safetyDelayMs);

  onScopeDispose(() => {
    settledWatch.stop();
    layoutWatch.stop();
    settledWatch.clearTimer();
    layoutWatch.clearTimer();
    clearTimeout(safetyTimer);
  });
}
