/**
 * Blocks until something accepts TCP connections on host:port (default 127.0.0.1:3000).
 * Used so Vite's dev proxy does not race ahead of the API on `npm run dev`.
 */
import net from 'node:net';
import { parseIntegerInRange, parseMinInteger } from './lib/number-parse.mjs';

const host = process.argv[2] || '127.0.0.1';
const port = parseIntegerInRange(process.argv[3], 3000, 1, 65_535);
const timeoutMs = parseMinInteger(process.env.WAIT_FOR_PORT_MS, 120_000, 1);
const intervalMs = 200;

const deadline = Date.now() + timeoutMs;

function tryOnce() {
  const socket = net.createConnection({ host, port }, () => {
    process.stdout.write(` ${host}:${port} ready.\n`);
    socket.end();
    process.exit(0);
  });
  socket.on('error', () => {
    socket.destroy();
    if (Date.now() >= deadline) {
      console.error(
        `wait-for-port: timed out after ${timeoutMs}ms (${host}:${port})`,
      );
      process.exit(1);
    }
    setTimeout(tryOnce, intervalMs);
  });
}

process.stdout.write(`Waiting for ${host}:${port}...`);
tryOnce();
