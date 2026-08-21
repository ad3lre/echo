#!/usr/bin/env node
/**
 * CI guard: Echo REST route modules must not introduce new raw `pool.query(` calls.
 * Grandfathered files are listed in scripts/echo-routes-sql-allowlist.json (shrink-only).
 * Prefer DALs / echoStore helpers for new DB access.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const ECHO_ROUTES_DIR = join(
  ROOT,
  'server',
  'backend',
  'src',
  'api',
  'routes',
  'echo',
);
const ECHO_AGGREGATOR = join(
  ROOT,
  'server',
  'backend',
  'src',
  'api',
  'routes',
  'echo.ts',
);
const ALLOWLIST_PATH = join(__dirname, 'echo-routes-sql-allowlist.json');

const POOL_QUERY_RE = /\bpool\.query\s*\(/g;

function walkTs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTs(p, out);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

function loadAllowlist() {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  if (!Array.isArray(raw.files)) {
    console.error(
      'check-echo-no-sql-in-routes: allowlist must have a "files" array',
    );
    process.exit(1);
  }
  return new Set(raw.files.map((f) => String(f).replace(/\\/g, '/')));
}

const allowlist = loadAllowlist();
const files = walkTs(ECHO_ROUTES_DIR);
if (existsSync(ECHO_AGGREGATOR)) files.push(ECHO_AGGREGATOR);

const offenders = [];
const unusedAllow = new Set(allowlist);

for (const abs of files) {
  const rel = relative(ROOT, abs).replace(/\\/g, '/');
  const text = readFileSync(abs, 'utf8');
  POOL_QUERY_RE.lastIndex = 0;
  if (!POOL_QUERY_RE.test(text)) continue;
  unusedAllow.delete(rel);
  if (allowlist.has(rel)) continue;
  const lines = [];
  POOL_QUERY_RE.lastIndex = 0;
  let m;
  while ((m = POOL_QUERY_RE.exec(text))) {
    lines.push(text.slice(0, m.index).split('\n').length);
  }
  offenders.push({ rel, lines });
}

if (unusedAllow.size) {
  console.error(
    'check-echo-no-sql-in-routes: stale allowlist entries (file has no pool.query or missing):',
  );
  for (const rel of [...unusedAllow].sort()) console.error(`  ${rel}`);
  process.exit(1);
}

if (offenders.length) {
  console.error(
    'check-echo-no-sql-in-routes: new raw pool.query in Echo routes (move to DAL or add to allowlist only when grandfathering):',
  );
  for (const o of offenders) {
    console.error(`  ${o.rel}  (lines ${o.lines.join(', ')})`);
  }
  process.exit(1);
}

console.log(
  `check-echo-no-sql-in-routes: OK (${allowlist.size} grandfathered file(s))`,
);
