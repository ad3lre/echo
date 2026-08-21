#!/usr/bin/env node
/**
 * CI guard: Echo channels must not be created implicitly from Socket.IO handlers.
 * Only explicit REST/domain paths may INSERT into echo_channels.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');

const BAD = /INSERT\s+INTO\s+echo_channels/gi;
const SOCKET_DIR = join(root, 'server', 'backend', 'src', 'sockets');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

let failed = false;
for (const file of walk(SOCKET_DIR)) {
  const text = readFileSync(file, 'utf8');
  if (BAD.test(text)) {
    console.error(`Implicit echo_channels insert in socket layer: ${file}`);
    failed = true;
  }
}

if (failed) {
  console.error('check-no-implicit-echo-channel: FAILED');
  process.exit(1);
}
console.log('check-no-implicit-echo-channel: OK');
