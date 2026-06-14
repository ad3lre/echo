import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** @param {number[]} sorted @param {number} p */
export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const weight = idx - lo;
  return Math.round(sorted[lo] * (1 - weight) + sorted[hi] * weight);
}

/** @param {number[]} values */
export function summarize(values) {
  const samples = values
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (samples.length === 0) {
    return { median: 0, p95: 0, min: 0, max: 0, stdev: 0, samples: [] };
  }
  const median = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const min = samples[0];
  const max = samples[samples.length - 1];
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance =
    samples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / samples.length;
  return {
    median,
    p95,
    min,
    max,
    stdev: Math.round(Math.sqrt(variance)),
    samples,
  };
}

/** @param {Array<Record<string, number>>} rows @param {string[]} keys */
export function summarizeMetricMap(rows, keys) {
  const out = {};
  for (const key of keys) {
    out[key] = summarize(rows.map((row) => row[key]).filter((v) => v != null));
  }
  return out;
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

/** @param {string} resultsDir @param {{ scenario: string, rawSamples: Array<Record<string, number>>, stats: Record<string, ReturnType<typeof summarize>> }} result */
export function writeScenarioResult(resultsDir, result) {
  fs.mkdirSync(resultsDir, { recursive: true });
  const file = path.join(resultsDir, `${result.scenario}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
}

/** @param {string} resultsDir */
export function loadScenarioResults(resultsDir) {
  if (!fs.existsSync(resultsDir)) return [];
  return fs
    .readdirSync(resultsDir)
    .filter(
      (f) =>
        f.endsWith('.json') &&
        f !== 'baseline.json' &&
        !f.startsWith('playwright'),
    )
    .map((f) => {
      const raw = fs.readFileSync(path.join(resultsDir, f), 'utf8');
      return JSON.parse(raw);
    });
}

/** @param {{ baseUrl: string, iterations: number, runId: string, scenarios: ReturnType<typeof loadScenarioResults> }} params */
export function buildBaselineReport(params) {
  const scenarios = {};
  for (const row of params.scenarios) {
    scenarios[row.scenario] = row.stats;
  }
  return {
    meta: {
      baseUrl: params.baseUrl,
      gitSha: gitSha(),
      iterations: params.iterations,
      recordedAt: new Date().toISOString(),
      runId: params.runId,
    },
    scenarios,
  };
}

/** @param {string} resultsDir @param {ReturnType<typeof buildBaselineReport>} report */
export function writeBaselineReport(resultsDir, report) {
  fs.mkdirSync(resultsDir, { recursive: true });
  const file = path.join(resultsDir, 'baseline.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  return file;
}

/** @param {ReturnType<typeof buildBaselineReport>} report */
export function formatBaselineMarkdown(report) {
  const lines = [
    '# Echo production perf baseline',
    '',
    `- Base URL: ${report.meta.baseUrl}`,
    `- Git SHA: ${report.meta.gitSha}`,
    `- Recorded: ${report.meta.recordedAt}`,
    `- Iterations: ${report.meta.iterations}`,
    '',
  ];

  for (const [scenario, metrics] of Object.entries(report.scenarios)) {
    lines.push(`## ${scenario}`, '');
    lines.push('| Metric | Median (ms) | P95 (ms) | Min | Max |');
    lines.push('| --- | ---: | ---: | ---: | ---: |');
    for (const [name, stats] of Object.entries(metrics)) {
      lines.push(
        `| ${name} | ${stats.median} | ${stats.p95} | ${stats.min} | ${stats.max} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** @param {string} resultsDir @param {ReturnType<typeof buildBaselineReport>} report */
export function writeBaselineMarkdown(resultsDir, report) {
  const file = path.join(resultsDir, 'baseline.md');
  fs.writeFileSync(file, formatBaselineMarkdown(report));
  return file;
}
