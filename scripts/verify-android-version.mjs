#!/usr/bin/env node
/**
 * Ensures Android release metadata stays aligned: root package.json,
 * src-tauri/tauri.android.conf.json, and src-tauri/Cargo.toml versions match.
 * Run in CI before Android builds; bump bundle.android.versionCode in
 * tauri.android.conf.json for each Play Store upload (monotonic integer).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function cargoVersion(cargoPath) {
  const text = readText(cargoPath);
  const m = /^version\s*=\s*"([^"]+)"/m.exec(text);
  if (!m) {
    throw new Error(`No version = "..." in ${cargoPath}`);
  }
  return m[1];
}

function regexMatch(label, text, regex) {
  const m = regex.exec(text);
  if (!m) {
    throw new Error(`No ${label} found`);
  }
  return m[1];
}

const pkg = readJson(path.join(root, 'package.json')).version;
const androidConf = readJson(
  path.join(root, 'src-tauri', 'tauri.android.conf.json'),
);
const cargo = cargoVersion(path.join(root, 'src-tauri', 'Cargo.toml'));
const androidGradle = readText(
  path.join(root, 'src-tauri', 'gen', 'android', 'app', 'build.gradle.kts'),
);
const androidWorkflow = readText(
  path.join(root, '.github', 'workflows', 'echo-android-ci.yml'),
);

const androidVer = androidConf.version;
const code = androidConf.bundle?.android?.versionCode;
const gradleNdk = regexMatch(
  'Android Gradle ndkVersion',
  androidGradle,
  /\bndkVersion\s*=\s*"([^"]+)"/,
);
const workflowNdk = regexMatch(
  'GitHub Actions ANDROID_NDK_VERSION',
  androidWorkflow,
  /^\s*ANDROID_NDK_VERSION:\s*['"]?([^'"\s]+)['"]?\s*$/m,
);

const errs = [];
if (pkg !== androidVer) {
  errs.push(
    `package.json version "${pkg}" !== tauri.android.conf.json version "${androidVer}"`,
  );
}
if (pkg !== cargo) {
  errs.push(
    `package.json version "${pkg}" !== src-tauri/Cargo.toml version "${cargo}"`,
  );
}
if (typeof code !== 'number' || code < 1 || !Number.isInteger(code)) {
  errs.push(
    `tauri.android.conf.json bundle.android.versionCode must be a positive integer (got ${JSON.stringify(code)})`,
  );
}
if (gradleNdk !== workflowNdk) {
  errs.push(
    `src-tauri/gen/android/app/build.gradle.kts ndkVersion "${gradleNdk}" !== .github/workflows/echo-android-ci.yml ANDROID_NDK_VERSION "${workflowNdk}"`,
  );
}
if (!androidWorkflow.includes('ndk;${{ env.ANDROID_NDK_VERSION }}')) {
  errs.push(
    '.github/workflows/echo-android-ci.yml setup-android packages must install ndk;${{ env.ANDROID_NDK_VERSION }}',
  );
}

if (errs.length) {
  console.error('[verify-android-version] Version alignment failed:\n');
  for (const e of errs) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `[verify-android-version] OK - app version ${pkg}, versionCode ${code}, NDK ${gradleNdk}`,
);
