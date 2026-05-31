#!/usr/bin/env node
/**
 * Runs `tauri ios build` via the repo-local CLI with Echo-specific guardrails:
 * - clear preflight failures for common local iOS setup issues
 * - automatic Xcode asset-catalog sync for app icons + launch logo
 * - conservative default Rust parallelism for laptop/simulator builds
 *
 * Passthrough: arguments after `--` are forwarded (e.g. `-- --ci`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tauriCliJs = path.join(
  repoRoot,
  'node_modules',
  '@tauri-apps',
  'cli',
  'tauri.js',
);
const appleProject = path.join(
  repoRoot,
  'src-tauri',
  'gen',
  'apple',
  'echo-desktop.xcodeproj',
);
const appleDir = path.join(repoRoot, 'src-tauri', 'gen', 'apple');
const appleProjectYaml = path.join(appleDir, 'project.yml');
const applePbxproj = path.join(appleProject, 'project.pbxproj');
const appleInfoPlist = path.join(appleDir, 'echo-desktop_iOS', 'Info.plist');
const appleEntitlements = path.join(
  appleDir,
  'echo-desktop_iOS',
  'echo-desktop_iOS.entitlements',
);

const TAURI_TO_RUST_TARGET = new Map([
  ['aarch64', 'aarch64-apple-ios'],
  ['aarch64-sim', 'aarch64-apple-ios-sim'],
  ['x86_64', 'x86_64-apple-ios'],
]);

function hasHelpOrVersionArg(args) {
  return args.some((arg) => ['-h', '--help', '-V', '--version'].includes(arg));
}

function stripLocalArgs(args) {
  return args.filter((arg) => arg !== '--doctor');
}

function hasDoctorArg(args) {
  return args.includes('--doctor');
}

function runChecked(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: options.stdio ?? 'pipe',
    encoding: 'utf8',
    shell: false,
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
  });
  return result;
}

function commandAvailable(cmd, args = ['--version']) {
  const result = runChecked(cmd, args);
  return !result.error && result.status === 0;
}

function parseIosTargets(args) {
  const targets = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '-t' || arg === '--target') {
      for (let j = i + 1; j < args.length && !args[j].startsWith('-'); j += 1) {
        targets.push(args[j]);
        i = j;
      }
      continue;
    }
    if (arg.startsWith('--target=')) {
      targets.push(arg.slice('--target='.length));
      continue;
    }
    if (arg.startsWith('-t=')) {
      targets.push(arg.slice('-t='.length));
    }
  }
  return targets.length > 0 ? [...new Set(targets)] : ['aarch64'];
}

function installedRustTargets() {
  const result = runChecked('rustup', ['target', 'list', '--installed']);
  if (result.error || result.status !== 0) return null;
  return new Set(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

function formatList(items) {
  return items.map((item) => `  - ${item}`).join('\n');
}

function readTextIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function assertGeneratedIosProjectHealth(problems, hints) {
  if (!fs.existsSync(appleProject)) return;

  const projectYaml = readTextIfExists(appleProjectYaml);
  const pbxproj = readTextIfExists(applePbxproj);
  if (
    projectYaml.includes('${FORCE_COLOR}') ||
    pbxproj.includes(' 0 ${ARCHS')
  ) {
    problems.push(
      'Generated iOS Xcode Rust build script still passes the stale FORCE_COLOR/0 architecture argument.',
    );
    hints.push(
      'Remove ${FORCE_COLOR} / the extra 0 before ${ARCHS:?} in src-tauri/gen/apple/project.yml and project.pbxproj.',
    );
  }

  const entitlements = readTextIfExists(appleEntitlements);
  if (!entitlements.includes('webcredentials:chat-echo.com')) {
    problems.push(
      'iOS entitlements are missing webcredentials:chat-echo.com, so platform passkeys cannot work.',
    );
    hints.push(
      'Add com.apple.developer.associated-domains with webcredentials:chat-echo.com to src-tauri/gen/apple/echo-desktop_iOS/echo-desktop_iOS.entitlements.',
    );
  }

  const infoPlist = readTextIfExists(appleInfoPlist);
  if (!infoPlist.includes('CADisableMinimumFrameDurationOnPhone')) {
    problems.push(
      'Generated iOS Info.plist is missing CADisableMinimumFrameDurationOnPhone.',
    );
    hints.push(
      'Sync src-tauri/Info.ios.plist into src-tauri/gen/apple/echo-desktop_iOS/Info.plist before building.',
    );
  }
  if (infoPlist.includes('<string>fetch</string>')) {
    problems.push(
      'Generated iOS Info.plist declares UIBackgroundModes fetch without a native background-fetch integration.',
    );
    hints.push(
      'Keep UIBackgroundModes to audio unless a real background-fetch handler is shipped.',
    );
  }
}

function assertIosBuildEnvironment(args) {
  const problems = [];
  const hints = [];
  const targets = parseIosTargets(args);
  const needsSimulatorSdk = targets.some(
    (target) => target === 'aarch64-sim' || target === 'x86_64',
  );

  if (process.platform !== 'darwin') {
    problems.push('iOS builds require macOS with Xcode installed.');
  }

  if (!fs.existsSync(tauriCliJs)) {
    problems.push(`Missing @tauri-apps/cli at ${tauriCliJs}.`);
    hints.push('Run npm ci from the repo root.');
  }

  if (!fs.existsSync(appleProject)) {
    problems.push(`Missing generated Xcode project at ${appleProject}.`);
    hints.push('Run npm run tauri:ios:init once, then retry the build.');
  }
  assertGeneratedIosProjectHealth(problems, hints);

  if (process.platform === 'darwin') {
    if (!commandAvailable('xcrun', ['--find', 'xcodebuild'])) {
      problems.push('xcrun cannot find xcodebuild.');
      hints.push(
        'Install/open Xcode, then run sudo xcode-select -s /Applications/Xcode.app/Contents/Developer.',
      );
    }
    if (!commandAvailable('xcrun', ['--sdk', 'iphoneos', '--show-sdk-path'])) {
      problems.push('Xcode iPhoneOS SDK is not available.');
    }
    if (
      needsSimulatorSdk &&
      !commandAvailable('xcrun', [
        '--sdk',
        'iphonesimulator',
        '--show-sdk-path',
      ])
    ) {
      problems.push('Xcode iPhoneSimulator SDK is not available.');
    }
  }

  const installed = installedRustTargets();
  if (installed) {
    const missingRustTargets = targets
      .map((target) => TAURI_TO_RUST_TARGET.get(target))
      .filter((target) => target && !installed.has(target));
    if (missingRustTargets.length > 0) {
      problems.push(
        `Missing Rust target(s):\n${formatList(missingRustTargets)}`,
      );
      hints.push(`Run rustup target add ${missingRustTargets.join(' ')}.`);
    }
  } else {
    hints.push(
      'Could not inspect rustup targets; if the build fails, run rustup target list --installed.',
    );
  }

  if (problems.length > 0) {
    console.error(
      [
        '',
        '[tauri-ios-build] iOS build preflight failed:',
        formatList(problems),
        hints.length ? '\nHelpful next step(s):' : '',
        hints.length ? formatList([...new Set(hints)]) : '',
        '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
    process.exit(1);
  }

  console.log(
    `[tauri-ios-build] Preflight OK (${os.platform()} ${os.arch()}, target=${targets.join(', ')})`,
  );
}

function runAssetSync() {
  if (process.env.ECHO_TAURI_IOS_SKIP_ASSET_SYNC === '1') {
    console.log(
      '[tauri-ios-build] Asset sync skipped by ECHO_TAURI_IOS_SKIP_ASSET_SYNC=1',
    );
    return;
  }
  for (const script of [
    'scripts/sync-tauri-ios-icons.mjs',
    'scripts/sync-tauri-ios-launch-logo.mjs',
    'scripts/sync-tauri-ios-entitlements.mjs',
  ]) {
    const scriptPath = path.join(repoRoot, script);
    if (!fs.existsSync(scriptPath)) {
      console.error(`[tauri-ios-build] Missing ${script}`);
      process.exit(1);
    }
    try {
      execFileSync(process.execPath, [scriptPath], {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
      });
    } catch (error) {
      console.error(`[tauri-ios-build] ${script} failed.`);
      if (error instanceof Error && error.message) {
        console.error(error.message);
      }
      process.exit(1);
    }
  }
}

if (!fs.existsSync(tauriCliJs)) {
  console.error(
    '[tauri-ios-build] Missing @tauri-apps/cli at',
    tauriCliJs,
    '— run npm ci from the repo root.',
  );
  process.exit(1);
}

const dash = process.argv.indexOf('--');
/** Forward `npm run … -- --flags` (no `--` in argv) and `node script -- --flags`. */
const rawPassthrough =
  dash >= 0 ? process.argv.slice(dash + 1) : process.argv.slice(2);
const passthrough = stripLocalArgs(rawPassthrough);

if (!hasHelpOrVersionArg(rawPassthrough)) {
  runAssetSync();
  assertIosBuildEnvironment(passthrough);
}

if (hasDoctorArg(rawPassthrough)) {
  console.log('[tauri-ios-build] Doctor completed without starting a build.');
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [tauriCliJs, 'ios', 'build', ...passthrough],
  {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      VITE_ECHO_TAURI: '1',
      VITE_ECHO_IOS: '1',
      ECHO_TAURI_IOS: '1',
      CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '2',
    },
    cwd: repoRoot,
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
