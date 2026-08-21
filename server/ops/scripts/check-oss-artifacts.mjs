/**
 * Fail CI if forbidden paths are tracked (defense in depth beyond .gitignore).
 * Run from repo root: node server/ops/scripts/check-oss-artifacts.mjs
 */
import { spawnSync } from 'node:child_process';

const r = spawnSync('git', ['ls-files', '-z'], { encoding: 'buffer' });
if (r.status !== 0) {
  const err = (r.stderr?.toString('utf8') || r.error?.message || '').trim();
  console.error(
    'check-oss-artifacts: git ls-files failed' + (err ? `: ${err}` : ''),
  );
  if (r.error?.code === 'ENOENT') {
    console.error(
      'check-oss-artifacts: `git` is not installed or not on PATH (CI images need git).',
    );
  }
  process.exit(1);
}

const files = r.stdout.toString('utf8').split('\0').filter(Boolean);
const bad = new Set();

const trackedAiOrIdePrefixes = [
  '.cursor/',
  '.claude/',
  '.windsurf/',
  '.continue/',
  '.specstory/',
  '.agent/',
  '.fleet/',
  '.zed/',
];

function isTrackedSecretsEnvFile(f) {
  const base = f.split('/').pop() ?? f;
  if (base === '.env.example' || base.endsWith('.env.example')) return false;
  return base === '.env' || /\/\.env$/.test(f);
}

const generatedOrDumpBasenames = new Set([
  'console-log.json',
  'lint-warnings.json',
  'vitest_out.txt',
  'vitest_report.json',
]);

for (const f of files) {
  if (f.endsWith('.har')) bad.add(f);
  if (f.includes('/echo-local-uploads/')) bad.add(f);
  if (f.startsWith('artifacts/')) bad.add(f);
  if (f === 'docs/overview/tree.md') bad.add(f);
  if (generatedOrDumpBasenames.has(f.split('/').pop() ?? '')) bad.add(f);
  for (const p of trackedAiOrIdePrefixes) {
    if (f === p.slice(0, -1) || f.startsWith(p)) bad.add(f);
  }
  if (f.startsWith('bot/exports/') && !f.endsWith('.gitkeep')) bad.add(f);
  if (/^logs\/[^/]+\.json$/.test(f)) bad.add(f);
  if (isTrackedSecretsEnvFile(f)) bad.add(f);
  if (/^\.aider/.test(f) || f === '.aider.chat.history.md') bad.add(f);
  if (f.endsWith('.code-workspace')) bad.add(f);
}

if (bad.size > 0) {
  console.error(
    'check-oss-artifacts: tracked files must not include HARs, scanner dumps under logs/, artifacts/, generated tree.md, lint/vitest/console dumps, AI/IDE local dirs, .env (non-example), .code-workspace, Aider state, Discord exports, or local uploads:\n' +
      [...bad].sort().join('\n'),
  );
  process.exit(1);
}

console.log('check-oss-artifacts: ok');
