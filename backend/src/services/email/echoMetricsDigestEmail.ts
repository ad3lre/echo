import type { FastifyBaseLogger } from 'fastify';
import { config } from '../../config';
import { getEchoMetricsRegistry } from '../../observability/echoMetrics';
import { sendTransactionalEmail } from './sendMail';
import { buildHotPathHighlights } from './echoMetricsDigestHighlights';

/** Shape of a single metric as returned by prom-client's getMetricsAsJSON(). */
export type MetricJson = {
  name: string;
  help: string;
  type: string;
  values: Array<{
    value: number;
    labels?: Record<string, string | number>;
    metricName?: string;
  }>;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatLabels(labels?: Record<string, string | number>): string {
  if (!labels) return '';
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return '{' + entries.map(([k, v]) => `${k}="${String(v)}"`).join(', ') + '}';
}

/** A value line within a metric: its (sub-)name, labels and numeric value. */
function valueLine(v: MetricJson['values'][number]): string {
  const name = v.metricName ?? '';
  const labels = formatLabels(v.labels);
  const prefix = name && labels ? `${name}${labels}` : name || labels;
  return prefix ? `${prefix} = ${v.value}` : String(v.value);
}

function metricHtmlRow(name: string, value: string): string {
  const cell = 'font-family:monospace;font-size:12px';
  return (
    `<tr><td style="padding:1px 12px 1px 0;${cell}">${name}</td>` +
    `<td style="${cell};text-align:right">${value}</td></tr>`
  );
}

function metricValueHtmlRow(m: MetricJson, v: MetricJson['values'][number]) {
  const label = escapeHtml((v.metricName ?? m.name) + formatLabels(v.labels));
  return metricHtmlRow(label, escapeHtml(String(v.value)));
}

function metricHtmlBlock(m: MetricJson): string {
  const rows = m.values.length
    ? m.values.map((v) => metricValueHtmlRow(m, v)).join('')
    : `<tr><td colspan="2" style="color:#888">(no samples)</td></tr>`;
  return (
    `<h3 style="margin:18px 0 2px 0;font-size:14px"><code>${escapeHtml(
      m.name,
    )}</code> <span style="color:#888;font-weight:normal">(${escapeHtml(
      m.type,
    )})</span></h3>` +
    `<p style="margin:0 0 4px 0;color:#555;font-size:12px">${escapeHtml(
      m.help,
    )}</p>` +
    `<table style="border-collapse:collapse"><tbody>${rows}</tbody></table>`
  );
}

export type MetricsDigest = {
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; content: string; contentType: string }[];
};

/**
 * Builds a human-readable weekly digest of every recorded Echo metric from the
 * prom-client JSON snapshot, plus the raw Prometheus exposition as an
 * attachment. Pure function so it can be unit tested without SMTP or a registry.
 */
export function buildMetricsDigest(
  metrics: MetricJson[],
  promText: string,
  opts: { periodMs: number; generatedAt?: Date } = { periodMs: 0 },
): MetricsDigest {
  const generatedAt = opts.generatedAt ?? new Date();
  const periodDays = opts.periodMs
    ? Math.round(opts.periodMs / (24 * 60 * 60 * 1000))
    : 0;
  const subject = `[Echo Metrics] Weekly digest — ${generatedAt
    .toISOString()
    .slice(0, 10)}`;

  const sorted = [...metrics].sort((a, b) => a.name.localeCompare(b.name));
  const highlights = buildHotPathHighlights(metrics);

  const header =
    `Echo metrics weekly digest\n` +
    `Generated: ${generatedAt.toISOString()}\n` +
    (periodDays ? `Reporting period: last ${periodDays} day(s)\n` : '') +
    `Metric series: ${sorted.length}\n` +
    `\nThese are cumulative counters/gauges/histograms from the running\n` +
    `process registry (process-lifetime totals, not per-period deltas).\n`;

  const textBlocks = sorted.map((m) => {
    const lines = m.values.length
      ? m.values.map((v) => `  ${valueLine(v)}`).join('\n')
      : '  (no samples)';
    return `${m.name} (${m.type})\n  ${m.help}\n${lines}`;
  });
  const text =
    `${header}\n${'='.repeat(60)}\n` +
    `HOT-PATH SLIs\n\n${highlights.text}\n\n` +
    `${'='.repeat(60)}\nALL METRICS\n\n${textBlocks.join('\n\n')}\n`;

  const htmlBlocks = sorted.map(metricHtmlBlock);
  const html =
    `<p><strong>Echo metrics weekly digest</strong></p>` +
    `<p style="color:#555;font-size:12px">Generated ${escapeHtml(
      generatedAt.toISOString(),
    )}${periodDays ? ` · reporting period last ${periodDays} day(s)` : ''} · ${
      sorted.length
    } metric series.<br/>Values are cumulative process-lifetime totals from the live registry.</p>` +
    `<hr/><h2 style="font-size:16px;margin:0 0 4px 0">Hot-path SLIs</h2>` +
    `${highlights.html}` +
    `<hr/><h2 style="font-size:16px;margin:0 0 4px 0">All metrics</h2>${htmlBlocks.join('')}`;

  return {
    subject,
    text,
    html,
    attachments: [
      {
        filename: `echo-metrics-${generatedAt.toISOString().slice(0, 10)}.prom`,
        content: promText,
        contentType: 'text/plain',
      },
    ],
  };
}

/**
 * Snapshots the live metrics registry and emails the digest to
 * {@link config.echoMetricsDigestEmail}. Logs and swallows SMTP errors.
 */
export async function sendMetricsDigestEmail(
  log: FastifyBaseLogger,
): Promise<void> {
  const registry = getEchoMetricsRegistry();
  const [metricsRaw, promText] = await Promise.all([
    registry.getMetricsAsJSON(),
    registry.metrics(),
  ]);
  const metrics = metricsRaw as unknown as MetricJson[];
  const digest = buildMetricsDigest(metrics, promText, {
    periodMs: config.echoMetricsDigestIntervalMs,
  });
  await sendTransactionalEmail(log, {
    to: config.echoMetricsDigestEmail,
    from: config.echoBugReportEmailFrom,
    subject: digest.subject,
    text: digest.text,
    html: digest.html,
    attachments: digest.attachments,
  });
  log.info(
    {
      msg: 'echo_metrics_digest_email_sent',
      to: config.echoMetricsDigestEmail,
      series: metrics.length,
    },
    'Weekly metrics digest email sent',
  );
}
