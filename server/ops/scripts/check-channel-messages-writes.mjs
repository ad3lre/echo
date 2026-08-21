/**
 * Manual gate: flags direct assignments to workspace message buckets outside authority.
 * Allowlist: channelMessageAuthority.ts, channelMessageBucket.ts, tests, this script.
 * Run: node server/ops/scripts/check-channel-messages-writes.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = join(ROOT, 'clients', 'web', 'src');

const ALLOWLIST_SUBSTR = [
  'channelMessageAuthority.ts',
  'channelMessageBucket.ts',
  '.test.ts',
  '.spec.ts',
  'check-channel-messages-writes.mjs',
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|vue)$/.test(name)) out.push(p);
  }
  return out;
}

function allowed(path) {
  const rel = relative(ROOT, path).replace(/\\/g, '/');
  return ALLOWLIST_SUBSTR.some((s) => rel.includes(s));
}

const patterns = [
  [/messages\.value\s*\[[^\]]+\]\s*=/g, 'messages.value[...] ='],
  [/refs\.messages\.value\s*=/g, 'refs.messages.value ='],
];

const files = walk(SRC);
let bad = 0;

for (const file of files) {
  if (allowed(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const [re, label] of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      console.error(`${relative(ROOT, file)}:${line}  ${label}`);
      bad++;
    }
  }
}

if (bad) {
  console.error(
    `\ncheck-channel-messages-writes: ${bad} finding(s). Review or allowlist.`,
  );
  process.exit(1);
}
console.log('check-channel-messages-writes: ok');
