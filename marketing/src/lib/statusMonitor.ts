import { CHAT_APP_ORIGIN } from '../site';

const API_ORIGIN = CHAT_APP_ORIGIN.replace(/\/$/, '');
const STATUS_API_URL = `${API_ORIGIN}/api/v1/status`;
const HEALTH_API_URL = `${API_ORIGIN}/api/v1/health`;
const REFRESH_MS = 30_000;

const COMPONENT_IDS = ['web', 'api', 'database', 'realtime'] as const;

export type LiveState = 'operational' | 'degraded' | 'down' | 'pending' | 'unknown';

type ServerDayState =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage'
  | 'no_data';

type ServerComponent = {
  id: string;
  name: string;
  description: string;
  status: ServerDayState;
  latencyMs: number | null;
  uptimePercent: number | null;
  history: ServerDayState[];
};

type ServerStatusPayload = {
  updatedAt: string;
  overall: ServerDayState | 'pending';
  historyDays: number;
  probeIntervalSec: number;
  components: ServerComponent[];
  incidents: unknown[];
};

type FetchFailure = 'network' | 'not_found' | 'server' | 'bad_payload';

function toLiveState(status: ServerDayState | 'pending'): LiveState {
  if (status === 'operational') return 'operational';
  if (status === 'degraded') return 'degraded';
  if (status === 'no_data' || status === 'pending') return 'pending';
  return 'down';
}

function historyBarClass(day: ServerDayState): string {
  if (day === 'operational') return 'status-bar--ok';
  if (day === 'degraded') return 'status-bar--degraded';
  if (day === 'no_data') return 'status-bar--pending';
  return 'status-bar--bad';
}

function formatRelative(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function pillLabel(state: LiveState): string {
  if (state === 'operational') return 'Operational';
  if (state === 'degraded') return 'Degraded';
  if (state === 'down') return 'Outage';
  if (state === 'unknown') return 'Unknown';
  return 'No data';
}

function aggregateCopy(state: LiveState): { headline: string; subline: string } {
  switch (state) {
    case 'operational':
      return {
        headline: 'All systems operational',
        subline:
          'Fleet-wide monitors from Echo infrastructure show every component healthy.',
      };
    case 'degraded':
      return {
        headline: 'Degraded performance',
        subline: 'Some components are slow or partially impaired. We are investigating.',
      };
    case 'down':
      return {
        headline: 'Service disruption',
        subline: 'One or more components are failing checks from our monitoring fleet.',
      };
    case 'unknown':
      return {
        headline: 'Limited status available',
        subline:
          'The API health check passed, but fleet-wide metrics are not published yet.',
      };
    default:
      return {
        headline: 'Loading status…',
        subline: 'Fetching the latest fleet-wide health snapshot.',
      };
  }
}

function failureCopy(reason: FetchFailure, apiHealthy: boolean): { headline: string; subline: string } {
  if (reason === 'not_found') {
    if (apiHealthy) {
      return {
        headline: 'Fleet metrics not published yet',
        subline:
          'chat-echo.com is responding, but the public status feed has not been deployed. History bars will appear after the next backend release.',
      };
    }
    return {
      headline: 'Status feed unavailable',
      subline:
        'The public status API is not available on this deployment yet. Try again after the next release.',
    };
  }
  if (reason === 'network') {
    return {
      headline: 'Could not reach status API',
      subline: 'Your browser could not load chat-echo.com. Check your connection and try again.',
    };
  }
  if (apiHealthy) {
    return {
      headline: 'Could not load fleet metrics',
      subline:
        'The API health check passed, but the detailed status response was invalid or unavailable.',
    };
  }
  return {
    headline: 'Could not load status',
    subline: 'The status API returned an error. Try again in a moment.',
  };
}

function setServiceRow(id: string, state: LiveState, ms: number | null) {
  const pill = document.getElementById(`status-pill-${id}`);
  const latency = document.getElementById(`status-latency-${id}`);
  const row = document.getElementById(`status-row-${id}`);
  if (pill) {
    pill.setAttribute('data-state', state);
    pill.textContent = pillLabel(state);
  }
  if (latency) {
    latency.textContent =
      ms != null && Number.isFinite(ms) ? `${ms} ms` : '—';
  }
  if (row) row.setAttribute('data-state', state);
}

function setAllServiceRows(state: LiveState, latencyMs: number | null = null) {
  for (const id of COMPONENT_IDS) {
    setServiceRow(id, state, latencyMs);
  }
}

function clearServiceHistories(message: string) {
  for (const id of COMPONENT_IDS) {
    const spark = document.getElementById(`status-spark-${id}`);
    if (spark) spark.innerHTML = '';
    const foot = document.getElementById(`status-uptime-${id}`);
    if (foot) foot.textContent = message;
  }
}

function renderHistory(id: string, history: ServerDayState[], uptimePercent: number | null, historyDays: number) {
  const el = document.getElementById(`status-spark-${id}`);
  if (!el) return;
  el.innerHTML = '';
  for (const day of history) {
    const bar = document.createElement('span');
    bar.className = `status-bar ${historyBarClass(day)}`;
    bar.title = day.replace(/_/g, ' ');
    el.appendChild(bar);
  }

  const foot = document.getElementById(`status-uptime-${id}`);
  if (!foot) return;
  if (uptimePercent != null) {
    foot.textContent = `${uptimePercent.toFixed(2)}% uptime over the past ${historyDays} days.`;
  } else {
    foot.textContent = `Collecting the past ${historyDays} days of fleet data…`;
  }
}

function setAggregate(
  root: HTMLElement,
  state: LiveState,
  detail: { headline: string; subline: string; ms: number | null },
) {
  const orb = document.getElementById('status-orb');
  const headline = document.getElementById('status-headline');
  const subline = document.getElementById('status-subline');
  const latency = document.getElementById('status-latency');
  const live = document.getElementById('status-live-badge');

  if (orb) orb.setAttribute('data-state', state);
  if (headline) headline.textContent = detail.headline;
  if (subline) subline.textContent = detail.subline;
  if (latency) {
    latency.textContent =
      detail.ms != null && Number.isFinite(detail.ms) ? `${detail.ms} ms` : '—';
  }
  if (live) {
    live.setAttribute(
      'data-state',
      state === 'pending' ? 'connecting' : state === 'unknown' ? 'connecting' : 'live',
    );
  }
  root.dataset.liveState = state;
}

function setLastChecked(iso: string, prefix = 'Updated') {
  const last = document.getElementById('status-last-checked');
  if (!last) return;
  last.setAttribute('datetime', iso);
  last.textContent = `${prefix} ${formatRelative(iso)}`;
}

function medianLatency(components: ServerComponent[]): number | null {
  const values = components
    .map((c) => c.latencyMs)
    .filter((m): m is number => m != null && Number.isFinite(m));
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function applyPayload(root: HTMLElement, payload: ServerStatusPayload) {
  const overall = toLiveState(payload.overall);
  setAggregate(root, overall, {
    ...aggregateCopy(overall),
    ms: medianLatency(payload.components) ?? null,
  });

  setLastChecked(payload.updatedAt);

  const interval = document.getElementById('status-probe-interval');
  if (interval) interval.textContent = `${payload.probeIntervalSec}s`;

  const historyLabel = document.getElementById('status-history-label');
  if (historyLabel) historyLabel.textContent = `${payload.historyDays} days`;

  for (const comp of payload.components) {
    const live = toLiveState(comp.status);
    setServiceRow(comp.id, live, comp.latencyMs);
    renderHistory(comp.id, comp.history, comp.uptimePercent, payload.historyDays);

    const desc = document.getElementById(`status-desc-${comp.id}`);
    if (desc) desc.textContent = comp.description;
  }
}

function applyHealthFallback(
  root: HTMLElement,
  healthLatencyMs: number | null,
  detail?: { headline: string; subline: string; ms?: number | null },
) {
  const now = new Date().toISOString();
  setAggregate(root, 'unknown', {
    ...(detail ?? aggregateCopy('unknown')),
    ms: detail?.ms ?? healthLatencyMs,
  });
  setLastChecked(now);

  const interval = document.getElementById('status-probe-interval');
  if (interval) interval.textContent = '—';

  for (const id of COMPONENT_IDS) {
    const live: LiveState = id === 'api' ? 'operational' : 'unknown';
    setServiceRow(id, live, id === 'api' ? healthLatencyMs : null);
    clearServiceHistories(
      id === 'api'
        ? 'API health check only—90-day history will appear when fleet probes are live.'
        : 'No probe data until the public status feed is deployed.',
    );
  }
}

function applyFetchFailure(
  root: HTMLElement,
  reason: FetchFailure,
  apiHealthy: boolean,
) {
  if (apiHealthy) {
    applyHealthFallback(root, null, { ...failureCopy(reason, true), ms: null });
    return;
  }

  const now = new Date().toISOString();
  setAggregate(root, 'down', { ...failureCopy(reason, false), ms: null });
  setLastChecked(now, 'Checked');
  setAllServiceRows('unknown');
  clearServiceHistories('Status unavailable—fleet probes could not be loaded.');
}

async function fetchJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const res = await fetch(`${url}?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function fetchStatusPayload():
  Promise<{ payload: ServerStatusPayload } | { failure: FetchFailure }> {
  const result = await fetchJson<ServerStatusPayload>(STATUS_API_URL);
  if (result.ok) {
    if (!Array.isArray(result.data.components)) {
      return { failure: 'bad_payload' };
    }
    return { payload: result.data };
  }
  if (result.status === 404) return { failure: 'not_found' };
  if (result.status === 0) return { failure: 'network' };
  return { failure: 'server' };
}

async function fetchApiHealthy(): Promise<boolean> {
  const result = await fetchJson<{ status?: string }>(HEALTH_API_URL);
  return result.ok && result.data.status === 'ok';
}

let refreshTimer: number | null = null;
let tickTimer: number | null = null;
let lastCheckedAt: string | null = null;

function updateRelativeTime() {
  if (!lastCheckedAt) return;
  const last = document.getElementById('status-last-checked');
  if (!last) return;
  const prefix = last.textContent?.startsWith('Checked') ? 'Checked' : 'Updated';
  last.textContent = `${prefix} ${formatRelative(lastCheckedAt)}`;
}

async function refresh(root: HTMLElement, options?: { showPending?: boolean }) {
  if (options?.showPending) {
    setAggregate(root, 'pending', { ...aggregateCopy('pending'), ms: null });
    const last = document.getElementById('status-last-checked');
    if (last) last.textContent = 'Checking…';
  }

  const [statusResult, apiHealthy] = await Promise.all([
    fetchStatusPayload(),
    fetchApiHealthy(),
  ]);

  if ('payload' in statusResult) {
    lastCheckedAt = statusResult.payload.updatedAt;
    applyPayload(root, statusResult.payload);
    return;
  }

  lastCheckedAt = new Date().toISOString();
  applyFetchFailure(root, statusResult.failure, apiHealthy);
}

export function bootStatusMonitor() {
  const root = document.getElementById('status-summary');
  if (!(root instanceof HTMLElement)) return;

  void refresh(root, { showPending: true });

  if (refreshTimer != null) window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(() => {
    void refresh(root);
  }, REFRESH_MS);

  if (tickTimer != null) window.clearInterval(tickTimer);
  tickTimer = window.setInterval(updateRelativeTime, 1000);

  document.getElementById('status-refresh')?.addEventListener('click', () => {
    void refresh(root, { showPending: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh(root);
  });
}
