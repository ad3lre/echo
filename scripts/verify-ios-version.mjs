#!/usr/bin/env node
/**
 * Ensures iOS release metadata stays aligned: root package.json,
 * src-tauri/tauri.ios.conf.json, and src-tauri/Cargo.toml versions match.
 * Run before iOS App Store / TestFlight builds when you bump app version.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function cargoVersion(cargoPath) {
  const text = fs.readFileSync(cargoPath, 'utf8');
  const m = /^version\s*=\s*"([^"]+)"/m.exec(text);
  if (!m) {
    throw new Error(`No version = "..." in ${cargoPath}`);
  }
  return m[1];
}

const pkg = readJson(path.join(root, 'package.json')).version;
const iosConf = readJson(path.join(root, 'src-tauri', 'tauri.ios.conf.json'));
const cargo = cargoVersion(path.join(root, 'src-tauri', 'Cargo.toml'));

const iosVer = iosConf.version;

const errs = [];
if (pkg !== iosVer) {
  errs.push(
    `package.json version "${pkg}" !== tauri.ios.conf.json version "${iosVer}"`,
  );
}
if (pkg !== cargo) {
  errs.push(
    `package.json version "${pkg}" !== src-tauri/Cargo.toml version "${cargo}"`,
  );
}

if (errs.length) {
  console.error('[verify-ios-version] Version alignment failed:\n');
  for (const e of errs) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`[verify-ios-version] OK — app version ${pkg}`);
