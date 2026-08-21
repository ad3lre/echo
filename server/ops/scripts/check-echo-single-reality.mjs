#!/usr/bin/env node
/**
 * Fails the build if removed dual-runtime symbols reappear in backend app code.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const backendSrc = path.join(root, 'server', 'backend', 'src');

const FORBIDDEN = ['allowLegacySocketChannels', 'legacy_ephemeral'];

function walkTs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTs(p, out);
    else if (
      st.isFile() &&
      /\.(ts|mts|cts)$/.test(name) &&
      !name.endsWith('.d.ts')
    )
      out.push(p);
  }
  return out;
}

let failed = false;
for (const file of walkTs(backendSrc)) {
  const text = readFileSync(file, 'utf8');
  for (const token of FORBIDDEN) {
    if (text.includes(token)) {
      console.error(
        `check-echo-single-reality: forbidden "${token}" in ${path.relative(root, file)}`,
      );
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('check-echo-single-reality: ok');
