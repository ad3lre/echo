#!/usr/bin/env node
/** Copy Echo launch logo into the iOS asset catalog (LaunchLogo.imageset). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'frontend/public/icons/pwa-512.png');
const destDir = path.join(
  root,
  'src-tauri/gen/apple/Assets.xcassets/LaunchLogo.imageset',
);

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, 'LaunchLogo.png'));
fs.writeFileSync(
  path.join(destDir, 'Contents.json'),
  `${JSON.stringify(
    {
      images: [
        {
          filename: 'LaunchLogo.png',
          idiom: 'universal',
          scale: '1x',
        },
        {
          idiom: 'universal',
          scale: '2x',
        },
        {
          idiom: 'universal',
          scale: '3x',
        },
      ],
      info: { author: 'xcode', version: 1 },
    },
    null,
    2,
  )}\n`,
);
console.log('[sync-tauri-ios-launch-logo] Updated LaunchLogo.imageset');
