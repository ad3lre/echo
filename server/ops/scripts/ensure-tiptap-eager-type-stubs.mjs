#!/usr/bin/env node
/**
 * Tiptap v3 maps `"import"` types to `*.d.ts` and `"require"` to `*.d.cts`, but some
 * installs only materialize the `.d.cts` files. `moduleResolution: "bundler"` then
 * resolves `@tiptap/*` imports to missing `.d.ts` and `vue-tsc` fails.
 *
 * For every `*.d.cts` under `node_modules/@tiptap`, create the sibling `*.d.ts` when
 * it is absent (idempotent; no-op when the publisher layout is already complete).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const scopeDir = path.join(root, 'node_modules', '@tiptap');

if (!fs.existsSync(scopeDir)) {
  process.exit(0);
}

let wrote = 0;

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full);
    } else if (ent.name.endsWith('.d.cts')) {
      const dtsPath = full.replace(/\.d\.cts$/, '.d.ts');
      if (!fs.existsSync(dtsPath)) {
        fs.copyFileSync(full, dtsPath);
        wrote += 1;
      }
    }
  }
}

walk(scopeDir);

if (wrote > 0) {
  console.warn(
    `[echo] ensure-tiptap-eager-type-stubs: wrote ${wrote} missing .d.ts file(s) under node_modules/@tiptap`,
  );
}
