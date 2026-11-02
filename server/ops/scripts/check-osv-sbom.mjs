#!/usr/bin/env bun
/**
 * OSV vulnerability gate + SBOM / VDR refresh.
 *
 * 1. Ensures pinned Google osv-scanner.
 * 2. Scans bun.lock + Apple Package.resolved against OSV.
 * 3. Writes CycloneDX SBOM + VDR under security/sbom/ (stable timestamps).
 * 4. Fails when any non-allowlisted vulnerability remains (default: all severities).
 *
 * Wired into test:ci:guards → ci:precheck (pre-push) and GitHub/GitLab security jobs.
 *
 *   ECHO_OSV_LEVEL=all|critical|high|moderate|low   fail threshold (default all)
 *   ECHO_SKIP_OSV=1                                 local bypass (ignored when CI=true)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureOsvScanner,
  OSV_SCANNER_VERSION,
} from './ensure-osv-scanner.mjs';
import { defaultSbomPaths, generateEchoSbom } from './generate-echo-sbom.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const IN_CI = process.env.CI === 'true' || process.env.CI === '1';

if (process.env.ECHO_SKIP_OSV === '1') {
  if (IN_CI) {
    console.error(
      '[check:osv] ECHO_SKIP_OSV=1 is ignored when CI=true (bypass not allowed in CI).',
    );
  } else {
    console.log('[check:osv] skipped via ECHO_SKIP_OSV=1');
    process.exit(0);
  }
}

const SEV_ORDER = {
  unknown: 0,
  low: 1,
  moderate: 2,
  medium: 2,
  high: 3,
  critical: 4,
};

const levelRaw = (process.env.ECHO_OSV_LEVEL || 'all').toLowerCase();
const minSev = levelRaw === 'all' ? 0 : (SEV_ORDER[levelRaw] ?? SEV_ORDER.high);

const allowlistPath = join(__dirname, 'osv-allowlist.json');
let allowlist = { advisories: {} };
if (existsSync(allowlistPath)) {
  try {
    allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
  } catch (e) {
    console.error('[check:osv] invalid allowlist JSON:', e.message);
    process.exit(2);
  }
}

function allowlistOk(id) {
  const entry = allowlist.advisories?.[id];
  if (!entry) return false;
  if (!entry.expires || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires)) {
    console.error(
      `[check:osv] allowlist entry for ${id} has no valid "expires" date — rejected.`,
    );
    return false;
  }
  if (entry.expires < new Date().toISOString().slice(0, 10)) {
    console.error(
      `[check:osv] allowlist entry for ${id} EXPIRED on ${entry.expires} — re-evaluate.`,
    );
    return false;
  }
  return true;
}

function readProductVersion() {
  try {
    return readFileSync(join(ROOT, 'VERSION'), 'utf8').trim() || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function cvssSeverity(vuln) {
  const sev = vuln.severity || [];
  for (const s of sev) {
    const score = String(s.score || '');
    // CVSS:3.1/AV:N/... pick letter if present, else parse numeric.
    const m = score.match(/\/([CHML])\//); // not reliable
    void m;
    if (score.includes('CVSS:')) {
      // Extract base score number if embedded as separate field later.
    }
    if (typeof s.score === 'number') {
      if (s.score >= 9) return 'critical';
      if (s.score >= 7) return 'high';
      if (s.score >= 4) return 'medium';
      return 'low';
    }
  }
  // Database_specific / severity from OSV JSON results varies; fall back.
  const db = vuln.database_specific?.severity;
  if (typeof db === 'string') return db.toLowerCase();
  return 'unknown';
}

function collectFindings(osvJson) {
  /** @type {{ id: string, package: string, version: string, severity: string, summary: string }[]} */
  const findings = [];
  for (const result of osvJson.results || []) {
    for (const pkg of result.packages || []) {
      const name = pkg.package?.name || 'unknown';
      const version = pkg.package?.version || '';
      for (const v of pkg.vulnerabilities || []) {
        const id = v.id || (v.aliases || [])[0] || 'UNKNOWN';
        findings.push({
          id,
          package: name,
          version,
          severity: cvssSeverity(v),
          summary: (v.summary || '').slice(0, 200),
          raw: v,
        });
      }
    }
  }
  return findings;
}

function toCycloneVulns(findings) {
  return findings.map((f) => ({
    id: f.id,
    bom_ref: f.id,
    description: f.summary,
    ratings: [
      {
        severity: (f.severity === 'medium'
          ? 'medium'
          : f.severity
        ).toUpperCase(),
        method: 'other',
      },
    ],
    affects: [
      {
        ref: `pkg:npm/${f.package}@${f.version}`,
      },
    ],
  }));
}

let bin;
try {
  bin = await ensureOsvScanner();
} catch (e) {
  if (IN_CI) {
    console.error('[check:osv] FAIL: could not ensure osv-scanner:', e.message);
    process.exit(1);
  }
  console.error(
    '[check:osv] WARN: could not ensure osv-scanner (offline?). Not blocking (local only).',
  );
  console.error(String(e.message || e));
  process.exit(0);
}

const args = ['scan', 'source', '--lockfile=bun.lock', '--format=json'];
if (existsSync(join(ROOT, 'clients/apple/Package.resolved'))) {
  args.push('--lockfile=clients/apple/Package.resolved');
}

let osvJson = { results: [] };
let scanFailed = false;
try {
  const out = execFileSync(bin, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  osvJson = JSON.parse(out || '{"results":[]}');
} catch (e) {
  // osv-scanner exits non-zero when vulnerabilities are found; JSON still on stdout.
  const stdout = e.stdout?.toString?.() || '';
  const stderr = e.stderr?.toString?.() || '';
  if (stdout.trim()) {
    try {
      osvJson = JSON.parse(stdout);
    } catch {
      scanFailed = true;
      console.error('[check:osv] FAIL: could not parse osv-scanner JSON');
      console.error(stderr.slice(0, 2000));
      process.exit(1);
    }
  } else if (IN_CI) {
    console.error(
      '[check:osv] FAIL: osv-scanner failed and CI=true — refusing to pass.',
    );
    console.error(stderr.slice(0, 2000));
    process.exit(1);
  } else {
    console.error(
      '[check:osv] WARN: osv-scanner failed (offline?). Not blocking (local only).',
    );
    console.error(stderr.slice(0, 1000));
    process.exit(0);
  }
  void scanFailed;
}

const findings = collectFindings(osvJson);
const offending = findings.filter((f) => {
  if (allowlistOk(f.id)) return false;
  const sev = SEV_ORDER[f.severity] ?? 0;
  return sev >= minSev;
});

const version = readProductVersion();
const { dir, cdx, vdr } = defaultSbomPaths();
mkdirSync(dir, { recursive: true });

const bom = await generateEchoSbom({
  vulnerabilities: toCycloneVulns(findings),
});
if (bom.metadata) bom.metadata.timestamp = '1970-01-01T00:00:00.000Z';
writeFileSync(cdx, `${JSON.stringify(bom, null, 2)}\n`);

/** @type {Record<string, unknown>} */
const vdrDoc = {
  document: {
    title: 'Echo Vulnerability Disclosure Report',
    product: 'echo',
    version,
    // Stable timestamp so committed VDR diffs stay lockfile/OSV-driven.
    timestamp: '1970-01-01T00:00:00.000Z',
    tool: `osv-scanner@${OSV_SCANNER_VERSION}`,
    spec: 'Echo VDR (OSV-backed; accompanies CycloneDX SBOM)',
  },
  status: offending.length === 0 ? 'clean' : 'vulnerabilities_present',
  vulnerabilityCount: findings.length,
  blockingCount: offending.length,
  vulnerabilities: findings.map((f) => ({
    id: f.id,
    package: f.package,
    version: f.version,
    severity: f.severity,
    summary: f.summary,
    status: allowlistOk(f.id) ? 'accepted_risk' : 'known_affected',
    allowlist: allowlist.advisories?.[f.id] || null,
    refs: [`https://osv.dev/${f.id}`],
  })),
};
writeFileSync(vdr, `${JSON.stringify(vdrDoc, null, 2)}\n`);

console.log(`[check:osv] SBOM ${bom.components.length} components → ${cdx}`);
console.log(`[check:osv] VDR → ${vdr} (status=${vdrDoc.status})`);

if (offending.length === 0) {
  const extra =
    findings.length > 0
      ? ` (${findings.length} allowlisted/below-threshold)`
      : '';
  console.log(
    `[check:osv] ok — no blocking advisories (level=${levelRaw})${extra}`,
  );
  process.exit(0);
}

console.error(
  `[check:osv] FAIL — ${offending.length} advisories at/above level=${levelRaw}:`,
);
for (const f of offending) {
  console.error(
    `  - ${f.id}  ${f.package}@${f.version}  [${f.severity}]  ${f.summary}`,
  );
}
console.error(
  '[check:osv] Fix via dependency update / root overrides + bun install, or allowlist with expiry in server/ops/scripts/osv-allowlist.json.',
);
process.exit(1);
