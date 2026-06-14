/**
 * Client-side perf harness for production baseline runs.
 * Enabled via `?perfHarness=1` or `localStorage.echo_perf_harness=1`.
 * Exposes `window.__echoPerf` for Playwright to read timings — no server ingest.
 */

export type PerfHarnessMilestone =
  | 'boot_spinner_visible'
  | 'boot_vue_mounted'
  | 'boot_gate_dismissed'
  | 'boot_shell_visible'
  | 'boot_workspace_settled'
  | 'boot_chat_ready'
  | 'chat_switch_start'
  | 'chat_switch_fetch_start'
  | 'chat_switch_fetch_end'
  | 'chat_switch_merge_done'
  | 'chat_switch_ui_rendered'
  | 'chat_switch_first_message_visible'
  | 'vc_connect_start'
  | 'vc_connected';

export type PerfHarnessReport = {
  milestones: Record<string, number>;
  events: Array<{
    name: string;
    ms: number;
    context?: Record<string, unknown>;
  }>;
  measures: Array<{ name: string; durationMs: number }>;
  meta: {
    url: string;
    userAgent: string;
    recordedAt: string;
    scenarioOriginMs: number;
  };
};

type EchoPerfWindow = Window & {
  __echoPerf?: {
    getReport: () => PerfHarnessReport;
    reset: () => void;
    isEnabled: () => boolean;
    markScenarioStart: () => void;
  };
};

let enabled = false;
let scenarioOriginMs = 0;
const milestones = new Map<string, number>();
const events: PerfHarnessReport['events'] = [];
let bootObserversInstalled = false;
let vcConnectStartedAtMs: number | null = null;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function relMs(atMs?: number): number {
  const t = atMs ?? nowMs();
  return Math.max(0, Math.round(t - scenarioOriginMs));
}

export function isPerfHarnessEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (enabled) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('perfHarness') === '1') return true;
    return localStorage.getItem('echo_perf_harness') === '1';
  } catch {
    return false;
  }
}

function markOnce(name: PerfHarnessMilestone, atMs?: number): void {
  if (!enabled) return;
  if (milestones.has(name)) return;
  const ms = relMs(atMs);
  milestones.set(name, ms);
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(`echo-perf:${name}`);
  }
  events.push({ name, ms });
}

export function resetPerfHarnessScenario(): void {
  if (!enabled) return;
  milestones.clear();
  events.length = 0;
  vcConnectStartedAtMs = null;
  scenarioOriginMs = nowMs();
  if (typeof performance !== 'undefined' && performance.clearMarks) {
    for (const name of [
      'boot_spinner_visible',
      'boot_vue_mounted',
      'boot_gate_dismissed',
      'boot_shell_visible',
      'boot_workspace_settled',
      'boot_chat_ready',
      'chat_switch_start',
      'chat_switch_fetch_start',
      'chat_switch_fetch_end',
      'chat_switch_merge_done',
      'chat_switch_ui_rendered',
      'chat_switch_first_message_visible',
      'vc_connect_start',
      'vc_connected',
    ] as const) {
      try {
        performance.clearMarks(`echo-perf:${name}`);
      } catch {
        /* ignore */
      }
    }
  }
}

export function getPerfHarnessReport(): PerfHarnessReport {
  const measureEntries =
    typeof performance !== 'undefined'
      ? performance
          .getEntriesByType('measure')
          .map((e) => ({ name: e.name, durationMs: Math.round(e.duration) }))
      : [];
  return {
    milestones: Object.fromEntries(milestones.entries()),
    events: [...events],
    measures: measureEntries,
    meta: {
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      recordedAt: new Date().toISOString(),
      scenarioOriginMs,
    },
  };
}

export function perfHarnessMarkBootWorkspaceSettled(): void {
  markOnce('boot_workspace_settled');
}

export function perfHarnessMarkBootChatReady(context?: {
  channelId?: string | null;
}): void {
  markOnce('boot_chat_ready');
  if (context && events.length > 0) {
    const last = events[events.length - 1];
    if (last?.name === 'boot_chat_ready') {
      last.context = { ...(context ?? {}) };
    }
  }
}

export function perfHarnessRecordChatSwitch(params: {
  event:
    | 'chat_switch_start'
    | 'chat_switch_fetch_start'
    | 'chat_switch_fetch_end'
    | 'chat_switch_merge_done'
    | 'chat_switch_ui_rendered'
    | 'chat_switch_first_message_visible';
  durationMs?: number;
  context?: Record<string, unknown>;
}): void {
  if (!enabled) return;
  const ms =
    params.durationMs != null
      ? Math.max(0, Math.round(params.durationMs))
      : relMs();
  milestones.set(params.event, ms);
  events.push({
    name: params.event,
    ms,
    context: params.context,
  });
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(`echo-perf:${params.event}`);
  }
}

export function perfHarnessRecordVcState(
  state: 'idle' | 'connecting' | 'connected' | 'error',
  prev?: 'idle' | 'connecting' | 'connected' | 'error',
): void {
  if (!enabled) return;
  if (state === 'connecting' && prev !== 'connecting' && prev !== 'connected') {
    vcConnectStartedAtMs = nowMs();
    markOnce('vc_connect_start', vcConnectStartedAtMs);
  }
  if (state === 'connected' && prev !== 'connected') {
    const at = nowMs();
    markOnce('vc_connected', at);
    if (vcConnectStartedAtMs != null) {
      const connectMs = Math.max(0, Math.round(at - vcConnectStartedAtMs));
      milestones.set('vc_connect_duration', connectMs);
      events.push({
        name: 'vc_connect_duration',
        ms: connectMs,
      });
    }
  }
  if (state === 'idle' || state === 'error') {
    vcConnectStartedAtMs = null;
  }
}

function isElementVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function tryMarkBootShellVisible(): void {
  if (milestones.has('boot_shell_visible')) return;
  const layout = document.querySelector('[data-cy=app-layout]');
  if (!layout || !isElementVisible(layout)) return;
  const gate = document.querySelector('.echo-boot-gate');
  if (gate && isElementVisible(gate)) return;
  markOnce('boot_shell_visible');
}

function tryMarkBootChatReadyFromDom(): void {
  if (milestones.has('boot_chat_ready')) return;
  const list = document.querySelector('[data-cy=message-list]');
  if (!list || !isElementVisible(list)) return;
  const skeletonGone =
    document.querySelector('[data-cy=chat-skeleton-gone]') != null;
  if (!skeletonGone) return;
  perfHarnessMarkBootChatReady();
}

function installBootDomObservers(): void {
  if (bootObserversInstalled || typeof document === 'undefined') return;
  bootObserversInstalled = true;

  if (document.querySelector('.echo-boot-spinner')) {
    markOnce('boot_spinner_visible');
  }

  const app = document.getElementById('app');
  if (app?.hasAttribute('data-echo-mounted')) {
    markOnce('boot_vue_mounted');
  }

  const observer = new MutationObserver(() => {
    const appEl = document.getElementById('app');
    if (appEl?.hasAttribute('data-echo-mounted')) {
      markOnce('boot_vue_mounted');
    }
    const gate = document.querySelector('.echo-boot-gate');
    if (!gate || !isElementVisible(gate)) {
      markOnce('boot_gate_dismissed');
    }
    tryMarkBootShellVisible();
    tryMarkBootChatReadyFromDom();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-echo-mounted', 'class', 'style', 'data-cy'],
  });

  tryMarkBootShellVisible();
  tryMarkBootChatReadyFromDom();
}

export function initPerfHarness(): void {
  if (typeof window === 'undefined') return;
  enabled = isPerfHarnessEnabled();
  if (!enabled) return;

  scenarioOriginMs = nowMs();
  installBootDomObservers();

  const w = window as EchoPerfWindow;
  w.__echoPerf = {
    getReport: getPerfHarnessReport,
    reset: resetPerfHarnessScenario,
    isEnabled: () => enabled,
    markScenarioStart: resetPerfHarnessScenario,
  };
}
