#!/usr/bin/env node
/**
 * Read-only checks for LiveKit production env (run against operator .env).
 * Usage: node scripts/verify-livekit-production-env.mjs [path-to-.env]
 * Exit 0 when checks pass or LiveKit is disabled; exit 1 on hard failures.
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = process.argv[2]?.trim() || path.join(process.cwd(), '.env');

function parseEnvFile(file) {
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out.set(key, val);
  }
  return out;
}

const env = parseEnvFile(envPath);
const nodeEnv = (env.get('NODE_ENV') || process.env.NODE_ENV || '').trim();
const apiKey = (env.get('LIVEKIT_API_KEY') || '').trim();
const apiSecret = (env.get('LIVEKIT_API_SECRET') || '').trim();
const publicUrl = (env.get('LIVEKIT_PUBLIC_URL') || '').trim();
const liveKitOn = !!(apiKey && apiSecret && publicUrl);

console.log(`[livekit-prod-check] env file: ${envPath}`);
console.log(`[livekit-prod-check] NODE_ENV=${nodeEnv || '(unset)'}`);
console.log(`[livekit-prod-check] LiveKit enabled in env: ${liveKitOn}`);

if (!liveKitOn) {
  console.log(
    '[livekit-prod-check] SKIP — set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_PUBLIC_URL to validate production voice.',
  );
  process.exit(0);
}

let failed = false;

if (nodeEnv === 'production' && publicUrl.startsWith('ws://')) {
  console.error(
    '[livekit-prod-check] FAIL — LIVEKIT_PUBLIC_URL must be wss:// in production (Echo API rejects ws:// at startup).',
  );
  failed = true;
}

if (!publicUrl.startsWith('wss://') && nodeEnv === 'production') {
  console.error(
    `[livekit-prod-check] FAIL — LIVEKIT_PUBLIC_URL should be wss:// (got ${publicUrl.slice(0, 32)}…).`,
  );
  failed = true;
}

const ttlRaw = env.get('LIVEKIT_JOIN_TOKEN_TTL_SEC')?.trim();
if (ttlRaw) {
  const ttl = parseInt(ttlRaw, 10);
  if (!Number.isFinite(ttl) || ttl < 60 || ttl > 3600) {
    console.error(
      '[livekit-prod-check] FAIL — LIVEKIT_JOIN_TOKEN_TTL_SEC must be 60–3600.',
    );
    failed = true;
  } else {
    console.log(`[livekit-prod-check] OK — join token TTL ${ttl}s`);
  }
} else {
  console.log('[livekit-prod-check] OK — join token TTL default 300s');
}

console.log('[livekit-prod-check] Manual edge items (not read from .env):');
console.log('  - SFU rtc.use_external_ip: true (or static node_ip) on cloud');
console.log('  - Firewall UDP 57000–60000 + TURN TLS 5349 (or managed relay)');
console.log(
  '  - Webhook https://<api>/api/v1/hooks/livekit reachable from SFU',
);
console.log('  - Pin livekit-server image digest in deploy manifest');

if (failed) process.exit(1);
console.log('[livekit-prod-check] PASS');
process.exit(0);
