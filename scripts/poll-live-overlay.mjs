#!/usr/bin/env node
/**
 * Temporarily show / clear a live picture overlay on app-echo.net/poll.
 *
 * Usage:
 *   node scripts/poll-live-overlay.mjs set <https-image-url> [--caption "..."] [--ttl-hours 2]
 *   node scripts/poll-live-overlay.mjs clear
 *   node scripts/poll-live-overlay.mjs status
 */
import Redis from 'ioredis';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
loadDotenv({ path: path.join(repoRoot, '.env') });

const KEY = 'echo:marketing-poll:live-overlay';

function usage() {
  console.error(`Usage:
  node scripts/poll-live-overlay.mjs set <https-image-url> [--caption "..."] [--ttl-hours 2]
  node scripts/poll-live-overlay.mjs clear
  node scripts/poll-live-overlay.mjs status`);
  process.exit(1);
}

async function main() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    console.error('REDIS_URL missing');
    process.exit(1);
  }
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 5,
    connectTimeout: 10_000,
  });

  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) usage();

  try {
    if (cmd === 'status') {
      const raw = await redis.get(KEY);
      console.log(raw ? JSON.parse(raw) : { active: false });
      return;
    }
    if (cmd === 'clear') {
      await redis.del(KEY);
      console.log('cleared');
      return;
    }
    if (cmd === 'set') {
      const url = rest[0];
      if (!url || !/^https?:\/\//i.test(url)) usage();
      let caption = '';
      let ttlHours = 0;
      for (let i = 1; i < rest.length; i++) {
        if (rest[i] === '--caption') {
          caption = rest[++i] || '';
        } else if (rest[i] === '--ttl-hours') {
          ttlHours = Number(rest[++i] || 0);
        }
      }
      const payload = {
        imageUrl: url,
        caption: caption.slice(0, 200),
        revision: String(Date.now()),
      };
      const raw = JSON.stringify(payload);
      if (ttlHours > 0) {
        await redis.set(KEY, raw, 'EX', Math.floor(ttlHours * 3600));
      } else {
        await redis.set(KEY, raw);
      }
      console.log(payload);
      return;
    }
    usage();
  } finally {
    redis.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
