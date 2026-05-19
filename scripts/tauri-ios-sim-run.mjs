#!/usr/bin/env node
/**
 * Intel-mac / CLI quirk: `tauri ios dev` often does **BUILD SUCCEEDED** then **ARCHIVE FAILED**
 * (https://github.com/tauri-apps/tauri/issues/14453), so the app never reaches the simulator.
 *
 * This script:
 * 1. Starts Vite (same env as normal iOS dev).
 * 2. Runs `tauri ios dev` with `ECHO_PRESTARTED_VITE=1` so Tauri only waits for :8080 (no second Vite).
 * 3. When Xcode prints ** BUILD SUCCEEDED **, installs and launches **Echo** on the booted simulator,
 *    then sends SIGINT to Tauri to skip the failing archive step. Vite keeps running.
 *
 * **Memory:** `tauri ios dev` always builds **Debug** for Xcode (`Echo.debug.dylib`), which is huge;
 * `--release` on this command does **not** switch Xcode to Release (Tauri CLI hardcodes `debug: true`
 * for the mobile runner). For a **Release** simulator install use **`npm run tauri:ios:sim`** (see
 * `tauri-ios-sim-release-build.mjs`). This script is **`npm run tauri:ios:sim:vite`** — Vite HMR +
 * Debug native only.
 *
 * **Compile RAM:** defaults `CARGO_BUILD_JOBS=2` for the Tauri subprocess unless you set
 * `CARGO_BUILD_JOBS` yourself.
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import waitOn from 'wait-on';
import { setTimeout as delay } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bundleId = 'com.echo.tauri.ios.dev';
const appBundle = 'Echo.app';

/** @param {'debug' | 'release'} configuration */
function newestEchoAppPath(configuration) {
  const productsDirs =
    configuration === 'release'
      ? ['Release-iphonesimulator', 'release-iphonesimulator']
      : ['Debug-iphonesimulator', 'debug-iphonesimulator'];
  const base = path.join(
    process.env.HOME,
    'Library/Developer/Xcode/DerivedData',
  );
  if (!fs.existsSync(base)) return null;
  const entries = fs.readdirSync(base, { withFileTypes: true });
  let best = null;
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.startsWith('echo-desktop-')) continue;
    for (const products of productsDirs) {
      const p = path.join(base, e.name, 'Build/Products', products, appBundle);
      if (!fs.existsSync(p)) continue;
      const m = fs.statSync(p).mtimeMs;
      if (!best || m > best.m) best = { p, m };
    }
  }
  return best?.p ?? null;
}

function bootedSimulatorUdid() {
  const out = execFileSync(
    'xcrun',
    ['simctl', 'list', 'devices', 'booted', '-j'],
    {
      encoding: 'utf8',
    },
  );
  const j = JSON.parse(out);
  for (const list of Object.values(j.devices ?? {})) {
    for (const d of list) {
      if (d.state === 'Booted') return d.udid;
    }
  }
  return null;
}

async function main() {
  execFileSync('node', [path.join(root, 'scripts/kill-dev-ports.js')], {
    cwd: root,
    env: { ...process.env, ECHO_FREE_PORTS: '8080' },
    stdio: 'inherit',
  });

  const vite = spawn(
    'node',
    [path.join(root, 'scripts/tauri-ios-dev-frontend.mjs')],
    {
      cwd: root,
      env: {
        ...process.env,
        TAURI_DEV_HOST: process.env.TAURI_DEV_HOST || '127.0.0.1',
        ...(process.env.ECHO_VITE_LOW_MEM === '0'
          ? {}
          : { ECHO_VITE_LOW_MEM: '1' }),
      },
      stdio: 'inherit',
    },
  );
  vite.on('error', (err) => {
    console.error(err);
    process.exit(1);
  });

  await waitOn({
    resources: ['http-get://127.0.0.1:8080'],
    timeout: 120000,
    interval: 250,
  });

  const simArg =
    process.env.ECHO_IOS_SIMULATOR?.trim() || 'iPhone SE (3rd generation)';

  const tauriEnv = {
    ...process.env,
    VITE_ECHO_TAURI: '1',
    ECHO_PRESTARTED_VITE: '1',
    CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '2',
    APPLE_DEVELOPMENT_TEAM: process.env.APPLE_DEVELOPMENT_TEAM || '7HBQV8236H',
  };

  const tauriArgs = [
    path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'),
    'ios',
    'dev',
    simArg,
  ];

  const tauri = spawn('node', tauriArgs, {
    cwd: root,
    env: tauriEnv,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let combined = '';
  let installed = false;
  const productsKind = 'debug';

  const onChunk = (chunk) => {
    const s = chunk.toString();
    process.stdout.write(s);
    combined += s;
    if (installed || !combined.includes('** BUILD SUCCEEDED **')) return;
    installed = true;
    setTimeout(async () => {
      try {
        await delay(2500);
        let appPath = null;
        let udid = null;
        for (let i = 0; i < 30; i++) {
          appPath = newestEchoAppPath(productsKind);
          udid = bootedSimulatorUdid();
          if (appPath && udid) break;
          await delay(500);
        }
        if (!appPath) {
          console.error('Could not find Echo.app under DerivedData.');
          return;
        }
        if (!udid) {
          console.error('No booted simulator.');
          return;
        }
        execFileSync('xcrun', ['simctl', 'install', udid, appPath], {
          stdio: 'inherit',
        });
        execFileSync('xcrun', ['simctl', 'launch', udid, bundleId], {
          stdio: 'inherit',
        });
        console.log(
          '\nInstalled and launched Echo. Interrupting Tauri to skip the broken archive step…\n',
        );
        tauri.kill('SIGINT');
      } catch (e) {
        console.error(e);
      }
    }, 0);
  };

  tauri.stdout.on('data', onChunk);
  tauri.stderr.on('data', onChunk);

  await new Promise((resolve) => {
    tauri.on('exit', resolve);
    tauri.on('error', () => resolve());
  });

  console.log(
    '\nTauri exited. Vite is still running on http://localhost:8080/ — press Ctrl+C to stop.\n',
  );

  await new Promise((resolve) => vite.on('exit', resolve));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
