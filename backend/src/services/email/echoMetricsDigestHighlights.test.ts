import assert from 'node:assert/strict';
import {
  buildHotPathHighlights,
  type MetricSnapshot,
} from './echoMetricsDigestHighlights';

async function run(): Promise<void> {
  const metrics: MetricSnapshot[] = [
    {
      name: 'echo_permission_fold_duration_seconds',
      type: 'histogram',
      values: [
        {
          value: 100,
          labels: { mode: 'single', le: '0.01' },
          metricName: 'echo_permission_fold_duration_seconds_bucket',
        },
        {
          value: 200,
          labels: { mode: 'single' },
          metricName: 'echo_permission_fold_duration_seconds_count',
        },
        {
          value: 0.4,
          labels: { mode: 'single' },
          metricName: 'echo_permission_fold_duration_seconds_sum',
        },
      ],
    },
    {
      name: 'echo_message_send_db_queries',
      type: 'histogram',
      values: [
        {
          value: 50,
          labels: { transport: 'socket' },
          metricName: 'echo_message_send_db_queries_count',
        },
        {
          value: 300,
          labels: { transport: 'socket' },
          metricName: 'echo_message_send_db_queries_sum',
        },
      ],
    },
    {
      name: 'echo_hot_cache_access_total',
      type: 'counter',
      values: [
        { value: 990, labels: { cache: 'permission_fold', outcome: 'hit' } },
        { value: 10, labels: { cache: 'permission_fold', outcome: 'miss' } },
      ],
    },
    {
      name: 'echo_server_aggregate_cold_load_total',
      type: 'counter',
      values: [{ value: 42 }],
    },
  ];

  const { text, html } = buildHotPathHighlights(metrics);

  // Permission fold avg: 0.4s / 200 = 0.002s = 2.00 ms.
  assert.match(text, /Permission fold latency/);
  assert.match(text, /mode="single": avg 2\.00 ms over 200 obs/);
  // DB queries avg: 300 / 50 = 6.00 queries.
  assert.match(text, /avg 6\.00 queries over 50 obs/);
  // Cache hit rate: 990 / 1000 = 99.0%.
  assert.match(text, /permission_fold: 99\.0% hit \(990 hit \/ 10 miss\)/);
  // Cold loads total.
  assert.match(text, /cold loads: 42/);
  // Latency families with no samples degrade gracefully.
  assert.match(text, /Gateway event fanout latency\n {2}\(no samples\)/);

  assert.match(html, /Permission fold latency/);
  assert.match(html, /99\.0% hit/);
  assert.ok(!html.includes('<script'));

  console.log('echoMetricsDigestHighlights: ok');
}

void run();
