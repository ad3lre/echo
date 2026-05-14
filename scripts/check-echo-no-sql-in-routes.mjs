#!/usr/bin/env node
/**
 * CI guard: Echo REST routes must not use raw pool.query (use echoStore helpers).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const echoRouteFile = join(
  __dirname,
  '..',
  'backend',
  'src',
  'api',
  'routes',
  'echo.ts',
);

const text = readFileSync(echoRouteFile, 'utf8');
if (/\bpool\.query\s*\(/m.test(text)) {
  console.error(
    'check-echo-no-sql-in-routes: echo.ts must not call pool.query — use echoStore',
  );
  process.exit(1);
}
console.log('check-echo-no-sql-in-routes: OK');
