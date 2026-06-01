#!/usr/bin/env node
/**
 * Install **Echo** on the booted iOS Simulator using a real **Release** native build.
 *
 * **Why this exists:** `tauri ios dev` always builds **Debug** for Xcode (`Echo.debug.dylib`).
 *
 * **Pitfall:** `newestEchoAppPath` must not pick an **empty** `release-iphonesimulator/Echo.app`
 * (left behind when a Release build is interrupted); that would leave the simulator running an
 * **older Debug** install and you still crash with `Echo.debug.dylib`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const appleDir = path.join(root, 'src-tauri/gen/apple');
const bundleId = 'com.echo.tauri.ios.dev';
const appBundle = 'Echo.app';

function iosSimRustTarget() {
  const a = os.arch();
  if (a === 'arm64') return 'aarch64-sim';
  if (a === 'x64') return 'x86_64';
  return 'aarch64-sim';
}

function bundleExecutableName(appPath) {
  const plist = path.join(appPath, 'Info.plist');
  if (!fs.existsSync(plist)) return null;
  try {
    const xml = execFileSync(
      '/usr/bin/plutil',
      ['-convert', 'json', '-o', '-', plist],
      { encoding: 'utf8' },
    );
    const j = JSON.parse(xml);
    const exe = j.CFBundleExecutable;
    return typeof exe === 'string' ? exe : null;
  } catch {
    return 'Echo';
  }
}

/**
 * A usable simulator .app: has plist + main executable, and is not the Debug dylib stub layout.
 */
function isValidReleaseSimulatorBundle(appPath) {
  if (!fs.existsSync(appPath)) return false;
  if (!fs.statSync(appPath).isDirectory()) return false;
  if (!fs.existsSync(path.join(appPath, 'Info.plist'))) return false;
  const exe = bundleExecutableName(appPath) || 'Echo';
  const exePath = path.join(appPath, exe);
  if (!fs.existsSync(exePath)) return false;
  // Debug configuration uses a tiny stub `Echo` + huge `Echo.debug.dylib`.
  if (fs.existsSync(path.join(appPath, 'Echo.debug.dylib'))) return false;
  return true;
}

function newestValidReleaseEchoAppPath() {
  const productsDirs = ['release-iphonesimulator', 'Release-iphonesimulator'];
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
      if (!isValidReleaseSimulatorBundle(p)) continue;
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

function simDestinationForXcodebuild() {
  const name = process.env.ECHO_IOS_SIMULATOR?.trim() || 'iPhone 17';
  const ver = process.env.ECHO_IOS_SIMULATOR_OS?.trim();
  return ver
    ? `platform=iOS Simulator,name=${name},OS=${ver}`
    : `platform=iOS Simulator,name=${name}`;
}

function xcodeDestinationForBootedSimulator(udid) {
  return udid
    ? `platform=iOS Simulator,id=${udid}`
    : simDestinationForXcodebuild();
}

function removeGeneratedPath(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function filterKnownTauriBuildNoise(text) {
  const chunks = text.split(/(?<=\n)/);
  let skippingDestinationWarning = false;
  return chunks
    .filter((chunk) => {
      const line = chunk.trimEnd();
      if (
        line.includes(
          '--- xcodebuild: WARNING: Using the first of multiple matching destinations:',
        )
      ) {
        skippingDestinationWarning = true;
        return false;
      }
      if (skippingDestinationWarning) {
        if (line.trim().startsWith('{ platform:')) return false;
        skippingDestinationWarning = false;
      }
      if (
        line.includes('failed to rename app') &&
        line.includes(
          'build/echo-desktop_iOS.xcarchive/Products/Applications/Echo.app: Directory not empty',
        )
      ) {
        return false;
      }
      return true;
    })
    .join('');
}

function writeFilteredBuildOutput(output) {
  if (typeof output !== 'string' || output.length === 0) return;
  process.stdout.write(filterKnownTauriBuildNoise(output));
}

function hasKnownSimulatorArchiveRenameFailure(text) {
  return (
    typeof text === 'string' &&
    text.includes('failed to rename app') &&
    text.includes(
      'build/echo-desktop_iOS.xcarchive/Products/Applications/Echo.app: Directory not empty',
    )
  );
}

function xcodebuildReleaseSim(arch, udid) {
  const dest = xcodeDestinationForBootedSimulator(udid);
  const derived = path.join(os.tmpdir(), `echo-ios-sim-dd-${Date.now()}`);
  console.log(
    `\n[ios:sim:release] Fallback: xcodebuild Release (arch=${arch}) → ${derived}\n`,
  );
  const r = spawnSync(
    'xcodebuild',
    [
      '-project',
      'echo-desktop.xcodeproj',
      '-scheme',
      'echo-desktop_iOS',
      '-configuration',
      'release',
      '-sdk',
      'iphonesimulator',
      '-destination',
      dest,
      '-derivedDataPath',
      derived,
      `ARCHS=${arch}`,
      'ONLY_ACTIVE_ARCH=YES',
      'build',
    ],
    { cwd: appleDir, env: { ...process.env }, stdio: 'inherit' },
  );
  if (r.status !== 0) return null;
  const appPath = path.join(
    derived,
    'Build/Products/release-iphonesimulator',
    appBundle,
  );
  return isValidReleaseSimulatorBundle(appPath) ? appPath : null;
}

function main() {
  const target = process.env.ECHO_IOS_RUST_TARGET?.trim() || iosSimRustTarget();
  const arch = target === 'x86_64' ? 'x86_64' : 'arm64';
  const udid = bootedSimulatorUdid();
  if (!udid) {
    console.error(
      'No booted iOS Simulator. Open Simulator.app, start a device (e.g. iPhone SE), then retry.',
    );
    process.exit(1);
  }

  const tauriJs = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');
  /**
   * The Echo Tauri shell **requires** `VITE_API_URL` at build time — `config.ts`'s
   * `resolveApiBase()` throws when it is missing. That throw runs at module import
   * (`export const API_BASE = resolveApiBase()`), i.e. **before** `bootstrap()`'s
   * `.catch()` fatal fallback can attach, so a build without it boots to a permanent
   * blank screen with no error UI. Bake a default (overridable) so this release sim
   * bundle actually launches into the app. Mirrors `tauri:ios:build:chat-echo`.
   */
  const apiUrl = process.env.VITE_API_URL?.trim() || 'https://chat-echo.com';
  const socketUrl = process.env.VITE_SOCKET_IO_URL?.trim() || apiUrl;
  const env = {
    ...process.env,
    VITE_ECHO_TAURI: '1',
    VITE_ECHO_IOS: '1',
    ECHO_TAURI_IOS: '1',
    VITE_API_URL: apiUrl,
    VITE_SOCKET_IO_URL: socketUrl,
    CI: process.env.CI || '1',
    APPLE_DEVELOPMENT_TEAM: process.env.APPLE_DEVELOPMENT_TEAM || '7HBQV8236H',
    CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '2',
  };

  const skipTauri = process.env.ECHO_IOS_SKIP_TAURI_BUILD === '1';

  if (!skipTauri) {
    console.log(
      `\n[ios:sim:release] tauri ios build (Rust target: ${target})…\n`,
    );
    removeGeneratedPath(
      path.join(appleDir, 'build/echo-desktop_iOS.xcarchive'),
    );
    const build = spawnSync(
      'node',
      [tauriJs, 'ios', 'build', '-t', target, '--ci'],
      {
        cwd: root,
        env,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const rawBuildOutput = `${build.stdout ?? ''}\n${build.stderr ?? ''}`;
    const knownRenameFailure =
      hasKnownSimulatorArchiveRenameFailure(rawBuildOutput);
    writeFilteredBuildOutput(build.stdout);
    writeFilteredBuildOutput(build.stderr);
    if (build.status !== 0 && !knownRenameFailure) {
      console.warn(
        '\n[ios:sim:release] tauri ios build exited non-zero (often **archive** fails on Intel while the **simulator** build already succeeded). Looking for release-iphonesimulator/Echo.app…\n',
      );
    }
  }

  let appPath = newestValidReleaseEchoAppPath();
  if (!appPath) {
    for (let i = 0; i < 30; i++) {
      appPath = newestValidReleaseEchoAppPath();
      if (appPath) break;
      try {
        execFileSync('sleep', ['0.5'], { stdio: 'ignore' });
      } catch {
        /* ignore */
      }
    }
  }

  if (!appPath) {
    console.log(
      '\n[ios:sim:release] Building frontend (dist) for Tauri iOS before xcodebuild…\n',
    );
    const fe = spawnSync('npm', ['run', 'build', '-w', 'frontend'], {
      cwd: root,
      env: {
        ...process.env,
        VITE_ECHO_TAURI: '1',
        VITE_ECHO_IOS: '1',
        ECHO_TAURI_IOS: '1',
        VITE_API_URL: apiUrl,
        VITE_SOCKET_IO_URL: socketUrl,
      },
      stdio: 'inherit',
      shell: true,
    });
    if (fe.status !== 0) process.exit(fe.status ?? 1);
    appPath = xcodebuildReleaseSim(arch, udid);
  }

  if (!appPath) {
    console.error(
      [
        'No valid Release simulator Echo.app found (complete bundle, no Echo.debug.dylib).',
        'Options:',
        '  • Ensure frontend is built: npm run build -w frontend (with ECHO_TAURI_IOS=1 via tauri hooks)',
        '  • Set ECHO_IOS_SIMULATOR / ECHO_IOS_SIMULATOR_OS to match a booted sim (see simctl list)',
        '  • ECHO_IOS_SKIP_TAURI_BUILD=1 to only run xcodebuild fallback',
      ].join('\n'),
    );
    process.exit(1);
  }

  console.log('\n[ios:sim:release] Installing:', appPath, '\n');
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
  console.log('\n[ios:sim:release] Done.\n');
}

main();
