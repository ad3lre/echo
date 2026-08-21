/**
 * Fail if `echo_messages` appears in SQL contexts outside the allowlisted DAL + schema.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../../..');
const backendSrc = path.join(repoRoot, 'server', 'backend', 'src');

const SQL_TABLE_REF = /\b(FROM|INTO|JOIN|UPDATE|TABLE)\s+echo_messages\b/i;

const allowlisted = new Set(
  [
    path.join(backendSrc, 'db', 'echoTables.ts'),
    path.join(backendSrc, 'domain', 'echoMessagesDal.ts'),
    path.join(backendSrc, 'domain', 'echoStore', 'community', 'forums.ts'),
    path.join(backendSrc, 'domain', 'echoStore', 'servers', 'servers.ts'),
  ].map((p) => path.normalize(p)),
);

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

const violations = [];
for (const file of walkTsFiles(backendSrc)) {
  if (file.includes(`${path.sep}tests${path.sep}`)) continue;
  if (file.includes(`${path.sep}scripts${path.sep}`)) continue;
  if (allowlisted.has(file)) continue;
  const txt = fs.readFileSync(file, 'utf8');
  if (SQL_TABLE_REF.test(txt)) {
    violations.push(path.relative(repoRoot, file));
  }
}

if (violations.length) {
  console.error(
    'echo_messages SQL must live only in server/backend/src/domain/echoMessagesDal.ts and server/backend/src/db/echoTables.ts.\nOffenders:\n',
    violations.join('\n'),
  );
  process.exit(1);
}

console.log('check-echo-messages-dal: ok');
