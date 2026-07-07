import { CHAT_APP_ORIGIN, MARKETING_SITE_NAME } from '../site';

/** Same default as `bot/src/uptimeMonitor.ts` (`ECHO_UPTIME_URL`). */
const HEALTH_URL = `${CHAT_APP_ORIGIN.replace(/\/$/, '')}/api/v1/health`;

/** Same window as Discord uptime embed (`SPARKLINE_WINDOW`). */
const SPARKLINE_WINDOW = 12;

/** Page refresh; bot default is 5m via `ECHO_UPTIME_POLL_MS`. */
const REFRESH_MS = 30_000;

export type LiveState = 'operational' | 'degraded' | 'down' | 'pending';

type ProbeResult = {
  httpStatus: number;
  latencyMs: number;
  error?: string;
};

type StatusVisual = {
  state: LiveState;
  label: string;
  headline: string;
};

const samples: number[] = [];
let successCount = 0;
let probeCount = 0;
let refreshTimer: number | null = null;
let tickTimer: number | null = null;
let lastCheckedAt: string | null = null;

async function probe(): Promise<ProbeResult> {
  const started = performance.now();
  try {
    const ac = new AbortController();
    const to = window.setTimeout(() => ac.abort(), 15_000);
    const res = await fetch(`${HEALTH_URL}?t=${Date.now()}`, {
      signal: ac.signal,
      redirect: 'manual',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
    });
    window.clearTimeout(to);
    const latencyMs = Math.round(performance.now() - started);
    await res.text().catch(() => {});
    return { httpStatus: res.status, latencyMs };
  } catch (e) {
    const latencyMs = Math.round(performance.now() - started);
    return {
      httpStatus: 0,
      latencyMs,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function isHealthy(result: ProbeResult): boolean {
  return !result.error && result.httpStatus >= 200 && result.httpStatus < 300;
}

function pushSample(ok: boolean, latencyMs: number): void {
  samples.push(ok && Number.isFinite(latencyMs) ? latencyMs : Number.NaN);
  while (samples.length > SPARKLINE_WINDOW) samples.shift();
}

function rollingUptimePct(): number | null {
  if (!samples.length) return null;
  const ok = samples.filter((n) => Number.isFinite(n)).length;
  return (ok / samples.length) * 100;
}

function formatPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

function sparkline(latencies: number[]): string {
  if (!latencies.length) return '—';
  const finite = latencies.filter((n) => Number.isFinite(n));
  if (!finite.length) return '░'.repeat(latencies.length);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const blocks = '▁▂▃▄▅▆▇█';
  return latencies
    .map((v) => {
      if (!Number.isFinite(v)) return '░';
      const t = (v - min) / span;
      const i = Math.min(7, Math.max(0, Math.round(t * 7)));
      return blocks[i]!;
    })
    .join('');
}

function latencyBar(latencyMs: number, maxMs: number): string {
  const capped = Math.min(Math.max(0, latencyMs), maxMs);
  const filled = Math.round((capped / maxMs) * 10);
  const empty = 10 - filled;
  return `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
}

function statusVisual(result: ProbeResult): StatusVisual {
  const { httpStatus, latencyMs, error } = result;
  if (error || httpStatus === 0) {
    return {
      state: 'down',
      label: 'Unreachable',
      headline: `${MARKETING_SITE_NAME} is unreachable`,
    };
  }
  if (httpStatus >= 500) {
    return {
      state: 'down',
      label: 'Server error',
      headline: `${MARKETING_SITE_NAME} returned a server error`,
    };
  }
  if (httpStatus >= 400) {
    return {
      state: 'down',
      label: 'HTTP error',
      headline: `${MARKETING_SITE_NAME} returned an HTTP error`,
    };
  }
  if (httpStatus >= 300) {
    return {
      state: 'degraded',
      label: 'Redirect',
      headline: `${MARKETING_SITE_NAME} returned a redirect`,
    };
  }
  if (latencyMs >= 1500) {
    return {
      state: 'degraded',
      label: 'Degraded',
      headline: `${MARKETING_SITE_NAME} is up but slow`,
    };
  }
  if (latencyMs >= 800) {
    return {
      state: 'degraded',
      label: 'Slow',
      headline: `${MARKETING_SITE_NAME} is up but responding slowly`,
    };
  }
  return {
    state: 'operational',
    label: 'Healthy',
    headline: `${MARKETING_SITE_NAME} is healthy`,
  };
}

function subline(result: ProbeResult, visual: StatusVisual): string {
  if (result.error) {
    return `Network error while probing ${shortEndpoint()}: ${result.error}`;
  }
  const http = result.httpStatus
    ? `HTTP ${result.httpStatus}`
    : 'no HTTP status';
  return `${visual.label} · ${http} · same check as Echo’s Discord uptime monitor`;
}

function shortEndpoint(): string {
  return HEALTH_URL.replace(/^https?:\/\//, '');
}

function formatRelative(iso: string): string {
  const sec = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
  );
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setAggregate(
  root: HTMLElement,
  state: LiveState,
  detail: { headline: string; subline: string; ms: number | null },
) {
  const orb = document.getElementById('status-orb');
  const headline = document.getElementById('status-headline');
  const sublineEl = document.getElementById('status-subline');
  const latency = document.getElementById('status-latency');
  const live = document.getElementById('status-live-badge');

  if (orb) orb.setAttribute('data-state', state);
  if (headline) headline.textContent = detail.headline;
  if (sublineEl) sublineEl.textContent = detail.subline;
  if (latency) {
    latency.textContent =
      detail.ms != null && Number.isFinite(detail.ms) ? `${detail.ms} ms` : '—';
  }
  if (live) {
    live.setAttribute(
      'data-state',
      state === 'pending' ? 'connecting' : 'live',
    );
  }
  root.dataset.liveState = state;
}

function setLastChecked(iso: string) {
  lastCheckedAt = iso;
  const last = document.getElementById('status-last-checked');
  if (!last) return;
  last.setAttribute('datetime', iso);
  last.textContent = `Checked ${formatRelative(iso)}`;
}

function updateRelativeTime() {
  if (!lastCheckedAt) return;
  const last = document.getElementById('status-last-checked');
  if (!last) return;
  last.textContent = `Checked ${formatRelative(lastCheckedAt)}`;
}

function applyProbeResult(root: HTMLElement, result: ProbeResult) {
  const healthy = isHealthy(result);
  probeCount += 1;
  if (healthy) successCount += 1;
  pushSample(healthy, result.latencyMs);

  const visual = statusVisual(result);
  const rollPct = rollingUptimePct();
  const rollLine =
    rollPct === null
      ? '—'
      : `${formatPct(rollPct)} (${samples.length}/${SPARKLINE_WINDOW})`;

  let recordedLine = '—';
  if (probeCount > 0) {
    const lifePct = (successCount / probeCount) * 100;
    recordedLine = `${formatPct(lifePct)} · ${successCount.toLocaleString()}/${probeCount.toLocaleString()} checks`;
  }

  const bar = result.error ? '░░░░░░░░░░' : latencyBar(result.latencyMs, 2000);
  const latencyLine = result.error ? '—' : `${result.latencyMs} ms`;

  setAggregate(root, visual.state, {
    headline: visual.headline,
    subline: subline(result, visual),
    ms: result.error ? null : result.latencyMs,
  });

  setLastChecked(new Date().toISOString());
  setText('status-rolling-uptime', rollLine);
  setText('status-recorded-uptime', recordedLine);
  setText('status-http', result.httpStatus ? String(result.httpStatus) : '—');
  setText('status-endpoint', shortEndpoint());
  setText('status-sparkline', sparkline(samples));
  setText(
    'status-latency-bar',
    result.error ? 'Could not measure latency' : `${bar} ${latencyLine}`,
  );

  const errorEl = document.getElementById('status-error');
  if (errorEl) {
    if (result.error) {
      errorEl.hidden = false;
      errorEl.textContent = result.error;
    } else {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }
}

async function refresh(root: HTMLElement, options?: { showPending?: boolean }) {
  if (options?.showPending) {
    setAggregate(root, 'pending', {
      headline: `Checking ${MARKETING_SITE_NAME}…`,
      subline: `Probing ${shortEndpoint()} (same as Echo bot uptime).`,
      ms: null,
    });
    const last = document.getElementById('status-last-checked');
    if (last) last.textContent = 'Checking…';
  }

  const result = await probe();
  applyProbeResult(root, result);
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
