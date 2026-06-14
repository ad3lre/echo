#!/usr/bin/env node
/**
 * Compare two perf baseline JSON files and flag regressions above a threshold.
 */
import fs from 'node:fs';
import path from 'node:path';

const THRESHOLD_PCT = Number.parseFloat(
  process.env.PERF_COMPARE_THRESHOLD ?? '10',
);

function usage(): never {
  console.error(
    'Usage: node --import tsx perf/compare.ts <baseline-a.json> <baseline-b.json>',
  );
  process.exit(1);
}

type Baseline = {
  scenarios: Record<string, Record<string, { median: number; p95: number }>>;
};

function load(file: string): Baseline {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Baseline;
}

function main(): void {
  const aPath = process.argv[2];
  const bPath = process.argv[3];
  if (!aPath || !bPath) usage();

  const before = load(path.resolve(aPath));
  const after = load(path.resolve(bPath));
  let regressions = 0;

  console.log(
    `Comparing median timings (${path.basename(aPath)} → ${path.basename(bPath)})`,
  );
  console.log(`Regression threshold: ${THRESHOLD_PCT}%\n`);

  for (const [scenario, metrics] of Object.entries(after.scenarios)) {
    const prevScenario = before.scenarios[scenario];
    if (!prevScenario) continue;
    console.log(`## ${scenario}`);
    for (const [metric, stats] of Object.entries(metrics)) {
      const prev = prevScenario[metric];
      if (!prev) continue;
      const delta = stats.median - prev.median;
      const pct = prev.median > 0 ? (delta / prev.median) * 100 : 0;
      const flag = pct > THRESHOLD_PCT ? ' REGRESSION' : '';
      if (flag) regressions += 1;
      console.log(
        `  ${metric}: ${prev.median}ms → ${stats.median}ms (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)${flag}`,
      );
    }
    console.log('');
  }

  if (regressions > 0) {
    console.error(
      `${regressions} metric(s) exceeded ${THRESHOLD_PCT}% regression threshold.`,
    );
    process.exit(1);
  }

  console.log('No regressions above threshold.');
}

main();
