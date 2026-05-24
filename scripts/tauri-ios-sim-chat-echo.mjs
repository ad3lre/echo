#!/usr/bin/env node
/**
 * Install Echo on the booted iOS Simulator loading **production** https://chat-echo.com
 * (no local Vite, backend, or font dev deps).
 *
 * Same Xcode archive workaround as `tauri-ios-sim-run.mjs`: install after ** BUILD SUCCEEDED **,
 * then SIGINT Tauri before the broken archive step.
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bundleId = 'com.echo.tauri.ios.dev';
const appBundle = 'Echo.app';
const chatEchoConfig = path.join(
  root,
  'src-tauri/tauri.ios.chat-echo.conf.json',
);

function newestEchoAppPath() {
  const productsDirs = ['Debug-iphonesimulator', 'debug-iphonesimulator'];
  const base = path.join(
    process.env.HOME,
    'Library/Developer/Xcode/DerivedData',
  );
  if (!fs.existsSync(base)) return null;
  let best = null;
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
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
    { encoding: 'utf8' },
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
  const simArg = process.env.ECHO_IOS_SIMULATOR?.trim() || 'iPhone 17';

  console.log(
    '\n[ios:sim:chat-echo] Native shell + WebView → https://chat-echo.com\n',
  );

  const tauriArgs = [
    path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'),
    'ios',
    'dev',
    '-c',
    chatEchoConfig,
    simArg,
  ];

  const tauri = spawn('node', tauriArgs, {
    cwd: root,
    env: {
      ...process.env,
      VITE_ECHO_TAURI: '1',
      VITE_ECHO_IOS: '1',
      CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '2',
      APPLE_DEVELOPMENT_TEAM:
        process.env.APPLE_DEVELOPMENT_TEAM || '7HBQV8236H',
    },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let combined = '';
  let installed = false;

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
          appPath = newestEchoAppPath();
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
        try {
          execFileSync('xcrun', ['simctl', 'uninstall', udid, bundleId], {
            stdio: 'ignore',
          });
        } catch {
          /* not installed */
        }
        execFileSync('xcrun', ['simctl', 'install', udid, appPath], {
          stdio: 'inherit',
        });
        execFileSync('xcrun', ['simctl', 'launch', udid, bundleId], {
          stdio: 'inherit',
        });
        console.log(
          '\nInstalled and launched Echo (loads https://chat-echo.com). Interrupting Tauri to skip archive…\n',
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
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
