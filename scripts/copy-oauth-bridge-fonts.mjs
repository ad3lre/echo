#!/usr/bin/env node
/**
 * Copies Inter woff2 files from @fontsource/inter into frontend/public/fonts so
 * oauth-desktop-bridge.html matches the SPA typography without a CDN.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const FILES = [
  'inter-latin-400-normal.woff2',
  'inter-latin-600-normal.woff2',
  'inter-latin-700-normal.woff2',
];

function findInterFilesDir() {
  const candidates = [
    path.join(repoRoot, 'node_modules', '@fontsource', 'inter', 'files'),
    path.join(
      repoRoot,
      'frontend',
      'node_modules',
      '@fontsource',
      'inter',
      'files',
    ),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const srcDir = findInterFilesDir();
const outDir = path.join(repoRoot, 'frontend', 'public', 'fonts');

if (!srcDir) {
  console.error(
    '[copy-oauth-bridge-fonts] @fontsource/inter not found. Run `npm ci` from the repo root.',
  );
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

for (const name of FILES) {
  const from = path.join(srcDir, name);
  const to = path.join(outDir, name);
  if (!fs.existsSync(from)) {
    console.error(`[copy-oauth-bridge-fonts] missing source file: ${from}`);
    process.exit(1);
  }
  fs.copyFileSync(from, to);
}

console.log(
  `[copy-oauth-bridge-fonts] copied ${FILES.length} Inter woff2 files → ${path.relative(repoRoot, outDir)}`,
);
