#!/usr/bin/env node
/**
 * Optional stress harness: many socket messages + joins (requires running backend + DATABASE_URL on client env).
 * Usage: BASE_URL=http://127.0.0.1:3000 TOKEN=<jwt> CHANNEL_ID=<uuid> node server/ops/scripts/socket-stress.mjs
 */
import { io } from 'socket.io-client';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const token = process.env.TOKEN;
const channelId = process.env.CHANNEL_ID;

if (!token || !channelId) {
  console.error('Set TOKEN and CHANNEL_ID (and optional BASE_URL)');
  process.exit(1);
}

const N = Math.min(50, parseInt(process.env.CLIENTS ?? '10', 10) || 10);
const sockets = [];

for (let i = 0; i < N; i++) {
  const s = io(baseUrl, { transports: ['websocket'], auth: { token } });
  sockets.push(s);
}

await Promise.all(
  sockets.map(
    (s) =>
      new Promise((resolve, reject) => {
        s.on('connect', resolve);
        s.on('connect_error', reject);
      }),
  ),
);

for (const s of sockets) {
  s.emit('joinChannel', channelId);
}

let ok = 0;
for (let i = 0; i < 200; i++) {
  const s = sockets[i % sockets.length];
  s.emit('message', { channelId, content: `stress ${i}`, id: randomUUID() });
  ok++;
}

await new Promise((r) => setTimeout(r, 2000));
for (const s of sockets) s.disconnect();
console.log(`socket-stress: sent ${ok} messages with ${N} sockets`);
