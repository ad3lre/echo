#!/usr/bin/env node
/**
 * Copy `src-tauri/icons/ios/*` into the Xcode asset catalog used by `gen/apple`.
 * Tauri `icon` writes to `icons/ios`; Xcode reads `gen/apple/Assets.xcassets/AppIcon.appiconset`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src-tauri/icons/ios');
const destDir = path.join(
  root,
  'src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset',
);

if (!fs.existsSync(srcDir)) {
  console.error('[sync-tauri-ios-icons] Missing', srcDir);
  process.exit(1);
}
if (!fs.existsSync(destDir)) {
  console.error(
    '[sync-tauri-ios-icons] Missing',
    destDir,
    '— run npm run tauri:ios:init',
  );
  process.exit(1);
}

let copied = 0;
for (const name of fs.readdirSync(srcDir)) {
  if (!name.endsWith('.png')) continue;
  fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
  copied += 1;
}
console.log(
  `[sync-tauri-ios-icons] Copied ${copied} PNG(s) → AppIcon.appiconset`,
);
