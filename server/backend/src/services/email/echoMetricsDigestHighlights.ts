/**
 * Curated "hot-path SLI" summary for the weekly metrics digest.
 *
 * The digest lists every registered series verbatim; this module pulls the
 * {@link ../../observability/echoHotPathMetrics} layer to the top and renders it
 * as derived, human-readable numbers (average latencies, cache hit rates) rather
 * than raw cumulative buckets, so the email leads with the signals we tune for.
 */

/** Minimal structural view of a prom-client metric snapshot (avoids a cycle). */
export type MetricSnapshot = {
  name: string;
  type: string;
  values: Array<{
    value: number;
    labels?: Record<string, string | number>;
    metricName?: string;
  }>;
};

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function fmtAvgMs(sum: number, count: number): string {
  if (count <= 0) return 'n/a';
  return `${((sum / count) * 1000).toFixed(2)} ms`;
}

function fmtAvg(sum: number, count: number): string {
  if (count <= 0) return 'n/a';
  return (sum / count).toFixed(2);
}

function fmtPct(part: number, total: number): string {
  if (total <= 0) return 'n/a';
  return `${((part / total) * 100).toFixed(1)}%`;
}

/** Stable `key="val", …` for a label set, excluding the histogram `le` bound. */
function labelKey(labels?: Record<string, string | number>): string {
  if (!labels) return '';
  const entries = Object.entries(labels)
    .filter(([k]) => k !== 'le')
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}="${v}"`).join(', ');
}

type Aggregate = { count: number; sum: number };

/** Group a histogram's `_count`/`_sum` series by label set (ignoring buckets). */
function histogramAggregates(
  m: MetricSnapshot | undefined,
): Array<{ key: string; count: number; sum: number }> {
  if (!m) return [];
  const groups = new Map<string, Aggregate>();
  for (const v of m.values) {
    const mn = v.metricName ?? '';
    const isCount = mn.endsWith('_count');
    const isSum = mn.endsWith('_sum');
    if (!isCount && !isSum) continue;
    const key = labelKey(v.labels);
    const g = groups.get(key) ?? { count: 0, sum: 0 };
    if (isCount) g.count = v.value;
    else g.sum = v.value;
    groups.set(key, g);
  }
  return [...groups.entries()].map(([key, g]) => ({ key, ...g }));
}

type HistogramSpec = { name: string; title: string; unit: 'ms' | 'count' };

const HOT_PATH_HISTOGRAMS: HistogramSpec[] = [
  {
    name: 'echo_permission_fold_duration_seconds',
    title: 'Permission fold latency',
    unit: 'ms',
  },
  {
    name: 'echo_message_send_duration_seconds',
    title: 'Message send latency',
    unit: 'ms',
  },
  {
    name: 'echo_gateway_fanout_duration_seconds',
    title: 'Gateway event fanout latency',
    unit: 'ms',
  },
  {
    name: 'echo_message_send_db_queries',
    title: 'DB queries per message send',
    unit: 'count',
  },
];

type Line = { title: string; rows: string[] };

function histogramLine(
  spec: HistogramSpec,
  m: MetricSnapshot | undefined,
): Line {
  const aggs = histogramAggregates(m);
  if (aggs.length === 0) return { title: spec.title, rows: ['(no samples)'] };
  const rows = aggs.map((a) => {
    const avg =
      spec.unit === 'ms'
        ? `avg ${fmtAvgMs(a.sum, a.count)}`
        : `avg ${fmtAvg(a.sum, a.count)} queries`;
    const label = a.key ? `${a.key}: ` : '';
    return `${label}${avg} over ${fmtInt(a.count)} obs`;
  });
  return { title: spec.title, rows };
}

function cacheHitLine(m: MetricSnapshot | undefined): Line {
  if (!m) return { title: 'Cache hit rates', rows: ['(no samples)'] };
  const byCache = new Map<string, { hit: number; miss: number }>();
  for (const v of m.values) {
    const cache = String(v.labels?.cache ?? 'unknown');
    const outcome = String(v.labels?.outcome ?? '');
    const e = byCache.get(cache) ?? { hit: 0, miss: 0 };
    if (outcome === 'hit') e.hit += v.value;
    else if (outcome === 'miss') e.miss += v.value;
    byCache.set(cache, e);
  }
  if (byCache.size === 0)
    return { title: 'Cache hit rates', rows: ['(no samples)'] };
  const rows = [...byCache.entries()].map(([cache, e]) => {
    const total = e.hit + e.miss;
    return `${cache}: ${fmtPct(e.hit, total)} hit (${fmtInt(e.hit)} hit / ${fmtInt(e.miss)} miss)`;
  });
  return { title: 'Cache hit rates', rows };
}

function coldLoadLine(m: MetricSnapshot | undefined): Line {
  const total = (m?.values ?? []).reduce((s, v) => s + v.value, 0);
  return {
    title: 'Cold aggregate load frequency',
    rows: [`server permission aggregate cold loads: ${fmtInt(total)}`],
  };
}

/** Build the hot-path SLI summary as text + HTML blocks for the digest. */
export function buildHotPathHighlights(metrics: MetricSnapshot[]): {
  text: string;
  html: string;
} {
  const byName = new Map(metrics.map((m) => [m.name, m]));
  const lines: Line[] = [
    ...HOT_PATH_HISTOGRAMS.map((spec) =>
      histogramLine(spec, byName.get(spec.name)),
    ),
    cacheHitLine(byName.get('echo_hot_cache_access_total')),
    coldLoadLine(byName.get('echo_server_aggregate_cold_load_total')),
  ];

  const text = lines
    .map((l) => `${l.title}\n${l.rows.map((r) => `  ${r}`).join('\n')}`)
    .join('\n\n');

  const html = lines
    .map((l) => {
      const items = l.rows.map((r) => `<li>${escapeHtml(r)}</li>`).join('');
      return (
        `<h3 style="margin:14px 0 2px 0;font-size:14px">${escapeHtml(l.title)}</h3>` +
        `<ul style="margin:0 0 8px 18px;padding:0;font-size:13px">${items}</ul>`
      );
    })
    .join('');

  return { text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
