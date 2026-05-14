#!/usr/bin/env node
/**
 * Runs `tauri build`, passing `--no-sign` unless release signing is explicitly enabled.
 *
 * Enable signing: set ECHO_TAURI_SIGN to 1, true, or yes (see docs/operations/desktop-windows.md).
 * You must still configure Tauri bundle signing (e.g. bundle.windows.certificateThumbprint) and
 * install/import certificates on the build host (or use CI secrets + import step).
 *
 * Optional: **ECHO_TAURI_UPDATER_ENDPOINTS** — comma-separated HTTPS template URLs for
 * `plugins.updater.endpoints` (e.g. `https://chat-echo.com/desktop/tauri-updates/{{target}}/{{arch}}/{{current_version}}`).
 * The script patches `src-tauri/tauri.conf.json` in place for the build, then restores the original.
 *
 * Optional: **ECHO_TAURI_CREATE_UPDATER_ARTIFACTS** — set to `1` / `true` / `yes` to set
 * `bundle.createUpdaterArtifacts` to `true` for this build (release jobs that publish `.sig`
 * bundles). The script **exits non-zero** unless **TAURI_SIGNING_PRIVATE_KEY** (or `_PATH`) is set.
 *
 * **ECHO_TAURI_UPDATER_ENDPOINTS** entries must each be a valid **https:** URL or the script exits
 * non-zero (avoids accidental `http://` in release config).
 *
 * Passthrough: arguments after the first `--` are appended to `tauri build` (e.g. `--no-bundle`
 * `-- --profile release-fast` for quick iteration builds).
 *
 * Uses the repo-local **@tauri-apps/cli** (`node_modules/@tauri-apps/cli/tauri.js`), not a global
 * `tauri` on PATH.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tauriConfPath = path.join(repoRoot, 'src-tauri', 'tauri.conf.json');
const tauriConfTempPath = `${tauriConfPath}.tmp`;

const tauriCliJs = path.join(
  repoRoot,
  'node_modules',
  '@tauri-apps',
  'cli',
  'tauri.js',
);

let tauriConfBackup = null;
let signalHandlersInstalled = false;

function shouldSign() {
  const v = (process.env.ECHO_TAURI_SIGN || '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  return false;
}

const rawEndpoints = (process.env.ECHO_TAURI_UPDATER_ENDPOINTS || '').trim();

function shouldCreateUpdaterArtifacts() {
  const v = (process.env.ECHO_TAURI_CREATE_UPDATER_ARTIFACTS || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function assertMinisignWhenUpdaterArtifacts() {
  if (!shouldCreateUpdaterArtifacts()) return;
  const key = (process.env.TAURI_SIGNING_PRIVATE_KEY || '').trim();
  const keyPath = (process.env.TAURI_SIGNING_PRIVATE_KEY_PATH || '').trim();
  if (!key && !keyPath) {
    console.error(
      '[tauri-build] ECHO_TAURI_CREATE_UPDATER_ARTIFACTS requires TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH (minisign).',
    );
    process.exit(1);
  }
}

function assertHttpsUpdaterEndpoints(raw) {
  if (!raw) return;
  const endpoints = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const ep of endpoints) {
    let u;
    try {
      u = new URL(ep);
    } catch {
      console.error(
        '[tauri-build] ECHO_TAURI_UPDATER_ENDPOINTS: not a valid URL:',
        ep,
      );
      process.exit(1);
    }
    if (u.protocol !== 'https:') {
      console.error(
        '[tauri-build] ECHO_TAURI_UPDATER_ENDPOINTS must use https:// — got:',
        ep,
      );
      process.exit(1);
    }
  }
}

assertMinisignWhenUpdaterArtifacts();
assertHttpsUpdaterEndpoints(rawEndpoints);

/** Replace tauri.conf.json atomically to avoid torn writes on crash mid-serialize. */
function writeTauriConfAtomic(contents) {
  fs.writeFileSync(tauriConfTempPath, contents, 'utf8');
  fs.renameSync(tauriConfTempPath, tauriConfPath);
}

function restoreTauriConf() {
  if (tauriConfBackup !== null) {
    try {
      writeTauriConfAtomic(tauriConfBackup);
      console.warn('[tauri-build] Restored src-tauri/tauri.conf.json');
    } catch (e) {
      console.error(
        '[tauri-build] Failed to restore tauri.conf.json — fix manually',
        e,
      );
    }
    tauriConfBackup = null;
  }
}

function installSignalHandlersOnce() {
  if (signalHandlersInstalled) return;
  signalHandlersInstalled = true;
  const onSignal = () => {
    restoreTauriConf();
  };
  try {
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  } catch {
    /* ignore platforms without these signals */
  }
}

if (rawEndpoints || shouldCreateUpdaterArtifacts()) {
  if (tauriConfBackup === null) {
    tauriConfBackup = fs.readFileSync(tauriConfPath, 'utf8');
  }
  installSignalHandlersOnce();
  const conf = JSON.parse(tauriConfBackup);
  if (rawEndpoints) {
    const endpoints = rawEndpoints
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (endpoints.length) {
      conf.plugins = conf.plugins || {};
      conf.plugins.updater = conf.plugins.updater || {};
      conf.plugins.updater.endpoints = endpoints;
      console.warn(
        '[tauri-build] Patched plugins.updater.endpoints from ECHO_TAURI_UPDATER_ENDPOINTS',
      );
    }
  }
  if (shouldCreateUpdaterArtifacts()) {
    conf.bundle = conf.bundle || {};
    conf.bundle.createUpdaterArtifacts = true;
    console.warn(
      '[tauri-build] Patched bundle.createUpdaterArtifacts=true (ECHO_TAURI_CREATE_UPDATER_ARTIFACTS)',
    );
  }
  writeTauriConfAtomic(`${JSON.stringify(conf, null, 2)}\n`);
}

if (!fs.existsSync(tauriCliJs)) {
  console.error(
    '[tauri-build] Missing @tauri-apps/cli at',
    tauriCliJs,
    '— run npm ci from the repo root.',
  );
  restoreTauriConf();
  process.exit(1);
}

const sign = shouldSign();
const argv = ['build'];
if (!sign) argv.push('--no-sign');

const dash = process.argv.indexOf('--');
const passthrough = dash >= 0 ? process.argv.slice(dash) : [];

let result;
try {
  result = spawnSync(process.execPath, [tauriCliJs, ...argv, ...passthrough], {
    stdio: 'inherit',
    shell: false,
    env: process.env,
    cwd: repoRoot,
  });
} finally {
  restoreTauriConf();
  // Best-effort: remove stale temp if rename failed mid-flight
  try {
    if (fs.existsSync(tauriConfTempPath)) fs.unlinkSync(tauriConfTempPath);
  } catch {
    /* ignore */
  }
}

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
