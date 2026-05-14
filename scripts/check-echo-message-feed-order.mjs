/**
 * Message timeline must not use created_at ordering in the DAL (ADR 002 / migration plan).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dalPath = path.join(
  __dirname,
  '..',
  'backend',
  'src',
  'domain',
  'echoMessagesDal.ts',
);

const s = fs.readFileSync(dalPath, 'utf8');
if (/\border\s+by\s+created_at\b/i.test(s)) {
  console.error(
    'echoMessagesDal.ts must not ORDER BY created_at for message feeds; use id.',
  );
  process.exit(1);
}

console.log('check-echo-message-feed-order: ok');
