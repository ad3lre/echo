#!/usr/bin/env node
/** Check local Markdown links in tracked documentation. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptDir, '../../..');
const files = execFileSync('git', ['ls-files', '*.md', '*.mdx'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split(/\r?\n/)
  .filter(Boolean);
const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;
const ignoredPrefixes = [
  'http://',
  'https://',
  'mailto:',
  'tel:',
  '#',
  'data:',
];
const failures = [];

for (const relativeFile of files) {
  const absoluteFile = path.join(repoRoot, relativeFile);
  const content = fs.readFileSync(absoluteFile, 'utf8');
  for (const match of content.matchAll(linkPattern)) {
    const rawTarget = match[1];
    const lineStart = content.lastIndexOf('\n', match.index) + 1;
    const linePrefix = content.slice(lineStart, match.index);
    // Markdown examples inside inline code are documentation text, not links.
    if ((linePrefix.match(/`/g) ?? []).length % 2 === 1) continue;
    if (ignoredPrefixes.some((prefix) => rawTarget.startsWith(prefix)))
      continue;
    const target = rawTarget.split('#', 1)[0].split('?', 1)[0];
    if (!target) continue;
    const resolved = path.resolve(path.dirname(absoluteFile), target);
    if (
      !resolved.startsWith(`${repoRoot}${path.sep}`) ||
      !fs.existsSync(resolved)
    ) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      failures.push(`${relativeFile}:${line} -> ${rawTarget}`);
    }
  }
}

if (failures.length) {
  console.error(`check-doc-links: ${failures.length} broken local link(s)`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`check-doc-links: ok (${files.length} tracked Markdown file(s))`);
