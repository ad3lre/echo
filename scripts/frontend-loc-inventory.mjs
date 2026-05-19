#!/usr/bin/env node
/**
 * Physical line inventory for frontend/src + optional Vue SFC block splits
 * (uses @vue/compiler-sfc from frontend/node_modules — run after npm install in frontend/).
 *
 * Usage (repo root):
 *   node scripts/frontend-loc-inventory.mjs
 *   node scripts/frontend-loc-inventory.mjs --all
 *   node scripts/frontend-loc-inventory.mjs --top 40
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const frontendPkg = path.join(repoRoot, 'frontend', 'package.json');
const srcRoot = path.join(repoRoot, 'frontend', 'src');
const require = createRequire(frontendPkg);
const { parse } = require('@vue/compiler-sfc');

const exts = new Set(['.vue', '.ts', '.tsx', '.js', '.jsx']);

function parseArgs(argv) {
  let all = false;
  let top = 25;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--all') all = true;
    else if (argv[i] === '--top' && argv[i + 1]) {
      top = Math.max(1, parseInt(argv[++i], 10) || 25);
    }
  }
  return { all, top };
}

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      walk(p, acc);
    } else if (exts.has(path.extname(ent.name))) acc.push(p);
  }
  return acc;
}

function countLines(s) {
  if (!s) return 0;
  return s.split(/\r?\n/).length;
}

function bucketFor(rel) {
  const parts = rel.split('/');
  if (parts[0] === 'features' && parts[1]) return `features/${parts[1]}`;
  return parts[0] || 'root';
}

function sfcSplit(relPath, ext, source) {
  if (ext !== '.vue') {
    const n = countLines(source);
    return {
      template: 0,
      script: n,
      style: 0,
      customBlocks: 0,
      other: 0,
      total: n,
    };
  }
  const { descriptor, errors } = parse(source, { filename: relPath });
  if (errors?.length) {
    console.warn(`[parse] ${relPath}: ${errors[0]?.message ?? errors[0]}`);
  }
  let script = 0;
  if (descriptor.script) script += countLines(descriptor.script.content);
  if (descriptor.scriptSetup)
    script += countLines(descriptor.scriptSetup.content);
  let style = 0;
  for (const b of descriptor.styles) style += countLines(b.content);
  const template = descriptor.template
    ? countLines(descriptor.template.content)
    : 0;
  let customBlocks = 0;
  for (const b of descriptor.customBlocks)
    customBlocks += countLines(b.content);
  const total = countLines(source);
  const accounted = template + script + style + customBlocks;
  const other = Math.max(0, total - accounted);
  return { template, script, style, customBlocks, other, total };
}

const { all, top } = parseArgs(process.argv);

const files = walk(srcRoot).map((abs) => {
  const rel = path.relative(srcRoot, abs).replace(/\\/g, '/');
  const source = fs.readFileSync(abs, 'utf8');
  const ext = path.extname(abs);
  const lines = countLines(source);
  return { rel, lines, ext, source };
});

files.sort((a, b) => b.lines - a.lines);

const buckets = {};
let totalLines = 0;
for (const f of files) {
  totalLines += f.lines;
  const b = bucketFor(f.rel);
  buckets[b] = (buckets[b] || 0) + f.lines;
}
const bucketsSorted = Object.fromEntries(
  Object.entries(buckets).sort((a, b) => b[1] - a[1]),
);

const topRows = files.slice(0, top).map(({ rel, lines, ext, source }) => {
  const sp = sfcSplit(rel, ext, source);
  return { rel, lines, ext, ...sp };
});

const payload = {
  generatedAt: new Date().toISOString(),
  srcRoot: path.relative(repoRoot, srcRoot),
  totalFiles: files.length,
  totalLines,
  buckets: bucketsSorted,
  top: topRows,
};

if (all) {
  payload.files = files.map(({ rel, lines, ext }) => ({ rel, lines, ext }));
}

console.log(JSON.stringify(payload, null, 2));
