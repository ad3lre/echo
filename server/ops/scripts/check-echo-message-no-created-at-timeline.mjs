/**
 * Pre-cutover / CI: forbid using created_at as the sort key for echo_messages timeline queries.
 * SELECT created_at ... ORDER BY id is fine. Flags ORDER BY ... created_at within the same SQL fragment
 * (same template literal segment: no backtick between ORDER BY and created_at).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../../..');
const backendSrc = path.join(repoRoot, 'server', 'backend', 'src');

/** Table name as SQL identifier (not echo_messages_persisted_total). */
const ECHO_MESSAGES_TABLE = /\becho_messages\b/;

/** ORDER BY clause that sorts by created_at (same `` string only; avoids SELECT created_at vs ORDER BY id false positives). */
const ORDER_BY_CREATED_AT = /\border\s+by\s+[^`]*?\bcreated_at\b/i;

function walkTsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules') continue;
      out.push(...walkTsFiles(p));
    } else if (ent.isFile() && ent.name.endsWith('.ts')) {
      out.push(path.normalize(p));
    }
  }
  return out;
}

const violations = new Set();
for (const file of walkTsFiles(backendSrc)) {
  if (file.includes(`${path.sep}tests${path.sep}`)) continue;
  if (file.includes(`${path.sep}scripts${path.sep}`)) continue;
  /* echoTables defines echo_messages DDL and unrelated migrations that ORDER BY created_at on other tables. */
  if (
    path.basename(file) === 'echoTables.ts' &&
    file.includes(`${path.sep}db${path.sep}`)
  )
    continue;
  if (
    file.includes(
      `${path.sep}domain${path.sep}echoStore${path.sep}community${path.sep}forums.ts`,
    )
  )
    continue;

  const text = fs.readFileSync(file, 'utf8');
  if (!ECHO_MESSAGES_TABLE.test(text)) continue;

  const parts = text.split('`');
  for (let i = 1; i < parts.length; i += 2) {
    const seg = parts[i];
    if (seg === undefined) break;
    if (!ECHO_MESSAGES_TABLE.test(seg) || !ORDER_BY_CREATED_AT.test(seg))
      continue;
    violations.add(path.relative(repoRoot, file));
    break;
  }
}

if (violations.size) {
  console.error(
    'echo_messages must not use ORDER BY created_at for chat timeline / pagination. Use id ordering (see echoMessagesDal / ADR 002).\nFiles:\n',
    [...violations].join('\n'),
  );
  process.exit(1);
}

console.log('check-echo-message-no-created-at-timeline: ok');
