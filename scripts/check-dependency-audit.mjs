#!/usr/bin/env node
/**
 * Dependency vulnerability gate.
 *
 * Fails the build when `npm audit` reports advisories at or above a severity
 * threshold (default: high). Wired into `test:ci:guards` → `ci:precheck`, so it
 * runs in the pre-push hook and blocks vulnerable dependencies from reaching git.
 *
 * Fix a finding by updating the dependency or pinning a patched version via the
 * root `overrides` block, then `npm install`. For a genuinely unfixable advisory
 * (e.g. awaiting an upstream major), add its GHSA id to
 * `scripts/dependency-audit-allowlist.json` with a reason and an expiry date.
 *
 *   ECHO_AUDIT_LEVEL=high|critical|moderate   severity threshold (default high)
 *   ECHO_AUDIT_OMIT_DEV=1                      audit production deps only
 *   ECHO_SKIP_DEP_AUDIT=1                      emergency local bypass (never in CI)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

if (process.env.ECHO_SKIP_DEP_AUDIT === '1') {
  console.log('[check:dep-audit] skipped via ECHO_SKIP_DEP_AUDIT=1');
  process.exit(0);
}

const SEV_ORDER = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const threshold = (process.env.ECHO_AUDIT_LEVEL || 'high').toLowerCase();
const minSev = SEV_ORDER[threshold] ?? 3;

const allowlistPath = path.join(__dirname, 'dependency-audit-allowlist.json');
let allowlist = { advisories: {} };
if (fs.existsSync(allowlistPath)) {
  try {
    allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
  } catch (e) {
    console.error('[check:dep-audit] invalid allowlist JSON:', e.message);
    process.exit(1);
  }
}

function ghsaId(adv) {
  const url = String(adv?.url || '');
  const m = url.match(/GHSA-[0-9a-z-]+/i);
  return m ? m[0] : String(adv?.source ?? '');
}

function isAllowed(id) {
  const entry = allowlist.advisories?.[id];
  if (!entry) return false;
  if (entry.expires && new Date(entry.expires) <= new Date()) {
    console.error(
      `[check:dep-audit] allowlist entry for ${id} EXPIRED on ${entry.expires} — re-evaluate.`,
    );
    return false;
  }
  return true;
}

function runAudit() {
  const omitDev = process.env.ECHO_AUDIT_OMIT_DEV === '1' ? ' --omit=dev' : '';
  const cmd = `npm audit --json${omitDev}`;
  try {
    return JSON.parse(
      execSync(cmd, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 128 * 1024 * 1024,
      }),
    );
  } catch (e) {
    // npm audit exits non-zero when vulnerabilities exist — JSON is still on stdout.
    if (e.stdout) {
      try {
        return JSON.parse(e.stdout);
      } catch {
        /* fall through */
      }
    }
    return null; // registry/network failure
  }
}

const report = runAudit();
if (!report || !report.vulnerabilities) {
  console.warn(
    '[check:dep-audit] WARN: could not run npm audit (offline/registry?). Not blocking.',
  );
  process.exit(0);
}

const offending = [];
let allowedCount = 0;
for (const v of Object.values(report.vulnerabilities)) {
  if ((SEV_ORDER[v.severity] ?? 0) < minSev) continue;
  for (const adv of (v.via || []).filter((x) => typeof x === 'object')) {
    const id = ghsaId(adv);
    if (isAllowed(id)) {
      allowedCount += 1;
      continue;
    }
    offending.push({
      name: v.name,
      severity: v.severity,
      id,
      title: adv.title,
    });
  }
}

if (offending.length === 0) {
  const extra = allowedCount ? ` (${allowedCount} allowlisted)` : '';
  console.log(`[check:dep-audit] ok — no advisories >= ${threshold}${extra}`);
  process.exit(0);
}

console.error(
  `\n[check:dep-audit] ${offending.length} dependency advisory(ies) at or above "${threshold}":\n`,
);
const seen = new Set();
for (const o of offending) {
  const key = o.name + o.id;
  if (seen.has(key)) continue;
  seen.add(key);
  console.error(
    `  ${o.severity.padEnd(8)} ${o.name.padEnd(28)} ${o.id}  ${o.title || ''}`,
  );
}
console.error(
  '\n  Fix: bump the dependency, or pin a patched version in the root "overrides", then `npm install`.',
);
console.error(
  '  Unfixable for now? Add the GHSA id to scripts/dependency-audit-allowlist.json (reason + expires).',
);
console.error('  Emergency local bypass: ECHO_SKIP_DEP_AUDIT=1\n');
process.exit(1);
