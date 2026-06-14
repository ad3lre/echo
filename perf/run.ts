#!/usr/bin/env node
/**
 * Run production perf scenarios and write aggregated baseline JSON + markdown.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { getPerfEnv } from './lib/env.mjs';
import {
  buildBaselineReport,
  loadScenarioResults,
  writeBaselineMarkdown,
  writeBaselineReport,
} from './lib/report.mjs';

const perfDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(perfDir, '..');

function main(): void {
  const env = getPerfEnv(perfDir);
  const runId = path.basename(env.resultsDir);
  const playwrightBin = path.join(
    repoRoot,
    'node_modules',
    '.bin',
    'playwright',
  );

  const result = spawnSync(
    playwrightBin,
    ['test', '--config', path.join(perfDir, 'playwright.config.mjs')],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PERF_RUN_ID: runId,
        PERF_RESULTS_DIR: env.resultsDir,
      },
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  const scenarios = loadScenarioResults(env.resultsDir);
  if (scenarios.length === 0) {
    console.error('No scenario result files found in', env.resultsDir);
    process.exit(1);
  }

  const report = buildBaselineReport({
    baseUrl: env.baseUrl,
    iterations: env.iterations,
    runId,
    scenarios,
  });

  const jsonPath = writeBaselineReport(env.resultsDir, report);
  const mdPath = writeBaselineMarkdown(env.resultsDir, report);

  const baselinesDir = path.join(perfDir, 'baselines');
  fs.mkdirSync(baselinesDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const baselineCopy = path.join(baselinesDir, `prod-${stamp}.json`);
  fs.copyFileSync(jsonPath, baselineCopy);

  console.log('\nPerf baseline written:');
  console.log('  JSON:', jsonPath);
  console.log('  Markdown:', mdPath);
  console.log('  Baseline copy:', baselineCopy);
}

main();
