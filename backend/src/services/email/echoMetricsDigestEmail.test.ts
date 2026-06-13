import assert from 'node:assert/strict';
import { buildMetricsDigest, type MetricJson } from './echoMetricsDigestEmail';

async function run(): Promise<void> {
  const metrics: MetricJson[] = [
    {
      name: 'echo_messages_persisted_total',
      help: 'Echo messages inserted vs duplicate idempotent',
      type: 'counter',
      values: [
        { value: 1200, labels: { result: 'inserted' } },
        { value: 7, labels: { result: 'duplicate' } },
      ],
    },
    {
      name: 'echo_dm_open_total',
      help: 'POST /dm/open outcomes',
      type: 'counter',
      values: [],
    },
  ];
  const promText = '# HELP echo_messages_persisted_total ...\n';

  const digest = buildMetricsDigest(metrics, promText, {
    periodMs: 7 * 24 * 60 * 60 * 1000,
    generatedAt: new Date('2026-06-13T00:00:00Z'),
  });

  assert.match(digest.subject, /Echo Metrics.*Weekly digest.*2026-06-13/);
  // Both metrics present, sorted by name (dm_open before messages_persisted).
  assert.ok(digest.text.indexOf('echo_dm_open_total') > -1);
  assert.ok(
    digest.text.indexOf('echo_dm_open_total') <
      digest.text.indexOf('echo_messages_persisted_total'),
  );
  // Label breakdown and values rendered.
  assert.match(
    digest.text,
    /result="inserted"\) = 1200|result="inserted"} = 1200/,
  );
  assert.match(digest.text, /\(no samples\)/);
  assert.match(digest.text, /Reporting period: last 7 day\(s\)/);
  assert.match(digest.html, /echo_messages_persisted_total/);
  assert.match(digest.html, /1200/);
  // Raw exposition attached as .prom.
  assert.equal(digest.attachments.length, 1);
  assert.match(
    digest.attachments[0]?.filename ?? '',
    /^echo-metrics-.*\.prom$/,
  );
  assert.equal(digest.attachments[0]?.content, promText);

  console.log('echoMetricsDigestEmail: ok');
}

void run();
