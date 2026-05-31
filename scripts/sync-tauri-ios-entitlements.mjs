#!/usr/bin/env node
/**
 * Merge hand-managed iOS entitlements into the Tauri-generated file.
 *
 * Tauri's `ios build` / `ios dev` regenerates
 *   src-tauri/gen/apple/echo-desktop_iOS/echo-desktop_iOS.entitlements
 * from its own plugin config, stripping keys it doesn't know about
 * (e.g. `com.apple.developer.associated-domains` for passkeys and universal
 * links).
 *
 * This script reads the source-of-truth template
 *   src-tauri/Entitlements.ios.plist
 * and merges its top-level keys *into* the generated entitlements so the
 * build gets everything it needs.
 *
 * The script is idempotent: running it twice produces the same file.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const templatePlist = path.join(root, 'src-tauri', 'Entitlements.ios.plist');
const generatedPlist = path.join(
  root,
  'src-tauri',
  'gen',
  'apple',
  'echo-desktop_iOS',
  'echo-desktop_iOS.entitlements',
);

/**
 * Parse a plist file to a JS object via plutil (macOS only).
 */
function readPlist(file) {
  const json = execFileSync(
    '/usr/bin/plutil',
    ['-convert', 'json', '-o', '-', file],
    { encoding: 'utf8' },
  );
  return JSON.parse(json);
}

/**
 * Write a JS object back as XML plist.
 */
function writePlist(file, obj) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
  execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', file, tmp]);
  fs.unlinkSync(tmp);
}

if (!fs.existsSync(templatePlist)) {
  console.log(
    '[sync-tauri-ios-entitlements] No template at',
    templatePlist,
    '— skipping.',
  );
  process.exit(0);
}

if (!fs.existsSync(generatedPlist)) {
  console.log(
    '[sync-tauri-ios-entitlements] Generated entitlements not found at',
    generatedPlist,
    '— skipping (run tauri ios init first).',
  );
  process.exit(0);
}

const template = readPlist(templatePlist);
const generated = readPlist(generatedPlist);

// Shallow merge: template keys win.
const merged = { ...generated, ...template };

// Only write if something changed.
const generatedBefore = fs.readFileSync(generatedPlist, 'utf8');
writePlist(generatedPlist, merged);
const generatedAfter = fs.readFileSync(generatedPlist, 'utf8');

if (generatedBefore === generatedAfter) {
  console.log('[sync-tauri-ios-entitlements] Entitlements already up to date.');
} else {
  const keys = Object.keys(template);
  console.log(
    `[sync-tauri-ios-entitlements] Merged ${keys.length} key(s) into entitlements: ${keys.join(', ')}`,
  );
}
