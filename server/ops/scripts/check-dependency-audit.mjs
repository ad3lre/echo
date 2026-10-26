#!/usr/bin/env bun
/**
 * Dependency vulnerability gate.
 *
 * Fails the build when `bun audit` reports advisories at or above a severity
 * threshold (default: high). Wired into `test:ci:guards` → `ci:precheck`, so it
 * runs in the pre-push hook and blocks vulnerable dependencies from reaching git.
 *
 * Fix a finding by updating the dependency or pinning a patched version via the
 * root `overrides` block, then `bun install`. For a genuinely unfixable advisory
 * (e.g. awaiting an upstream major), add its GHSA id to
 * `server/ops/scripts/dependency-audit-allowlist.json` with a reason and an expiry date.
 *
 *   ECHO_AUDIT_LEVEL=high|critical|moderate   severity threshold (default high)
 *   ECHO_SKIP_DEP_AUDIT=1                      emergency local bypass (ignored when CI=true)
 *
 * Every allowlist entry MUST carry a future `expires` date (YYYY-MM-DD).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../../..');

const IN_CI = process.env.CI === 'true' || process.env.CI === '1';

if (process.env.ECHO_SKIP_DEP_AUDIT === '1') {
  if (IN_CI) {
    console.error(
      '[check:dep-audit] ECHO_SKIP_DEP_AUDIT=1 is ignored when CI=true (bypass not allowed in CI).',
    );
  } else {
    console.log('[check:dep-audit] skipped via ECHO_SKIP_DEP_AUDIT=1');
    process.exit(0);
  }
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
  if (m) return m[0];
  if (adv?.id != null) return String(adv.id);
  return '';
}

function isAllowed(id) {
  const entry = allowlist.advisories?.[id];
  if (!entry) return false;
  if (!entry.expires || Number.isNaN(new Date(entry.expires).getTime())) {
    console.error(
      `[check:dep-audit] allowlist entry for ${id} has no valid "expires" date — rejected.`,
    );
    return false;
  }
  if (new Date(entry.expires) <= new Date()) {
    console.error(
      `[check:dep-audit] allowlist entry for ${id} EXPIRED on ${entry.expires} — re-evaluate.`,
    );
    return false;
  }
  return true;
}

function runAudit() {
  try {
    return JSON.parse(
      execSync('bun audit --json', {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 128 * 1024 * 1024,
      }),
    );
  } catch (e) {
    // bun audit exits non-zero when vulnerabilities exist — JSON is still on stdout.
    if (e.stdout) {
      try {
        return JSON.parse(e.stdout);
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

const report = runAudit();
if (!report || typeof report !== 'object') {
  if (IN_CI) {
    console.error(
      '[check:dep-audit] FAIL: could not run bun audit (offline/registry?) and CI=true — refusing to pass.',
    );
    process.exit(1);
  }
  console.warn(
    '[check:dep-audit] WARN: could not run bun audit (offline/registry?). Not blocking (local only).',
  );
  process.exit(0);
}

const offending = [];
let allowedCount = 0;
for (const [name, advisories] of Object.entries(report)) {
  if (!Array.isArray(advisories)) continue;
  for (const adv of advisories) {
    if ((SEV_ORDER[adv.severity] ?? 0) < minSev) continue;
    const id = ghsaId(adv);
    if (isAllowed(id)) {
      allowedCount += 1;
      continue;
    }
    offending.push({
      name,
      severity: adv.severity,
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
  `[check:dep-audit] FAIL — ${offending.length} advisories >= ${threshold}:`,
);
for (const o of offending) {
  console.error(`  - ${o.severity} ${o.name} ${o.id} ${o.title || ''}`.trim());
}
console.error(
  '[check:dep-audit] Fix via dependency update / root overrides + bun install, or allowlist with expiry.',
);
process.exit(1);
