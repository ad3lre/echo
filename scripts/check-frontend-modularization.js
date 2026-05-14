#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targetDir = path.join(root, 'frontend', 'src');
const extensions = new Set(['.vue', '.ts', '.tsx', '.js', '.jsx']);
const softLimit = 400;
const hardLimit = 700;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, files);
      continue;
    }
    if (extensions.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).length;
}

const rows = walk(targetDir)
  .map((filePath) => ({
    filePath,
    lines: countLines(filePath),
  }))
  .sort((a, b) => b.lines - a.lines);

const soft = rows.filter((row) => row.lines >= softLimit);
const hard = rows.filter((row) => row.lines >= hardLimit);

console.log(
  `Frontend modularization report (${softLimit}/${hardLimit} line thresholds)`,
);
console.log('');
console.log(`Files >= ${softLimit} lines: ${soft.length}`);
for (const row of soft.slice(0, 20)) {
  const rel = path.relative(root, row.filePath).replace(/\\/g, '/');
  const tag = row.lines >= hardLimit ? ' [HARD]' : '';
  console.log(`${String(row.lines).padStart(5)}  ${rel}${tag}`);
}

if (hard.length > 0) {
  console.log('');
  console.log(`Hard threshold breached by ${hard.length} file(s).`);
  process.exit(1);
}

process.exit(0);
