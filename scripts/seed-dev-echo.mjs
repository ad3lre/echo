#!/usr/bin/env node
/**
 * Seeds a dev user + Echo server via the running HTTP API (no mock DB).
 * Requires: backend on SEED_API_BASE (default http://127.0.0.1:3000), DATABASE_URL on the server, Echo tables.
 *
 * Usage: `npm run seed:dev` (from repo root) with backend already running.
 */
const base = (process.env.SEED_API_BASE ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);
const username = process.env.SEED_USERNAME ?? 'devseed';
const password = process.env.SEED_PASSWORD ?? 'devseed123';
const email = process.env.SEED_EMAIL ?? 'devseed@localhost.invalid';
const serverName = process.env.SEED_SERVER_NAME ?? 'Dev seed server';

async function json(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text };
  }
}

async function main() {
  const loginRes = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  let accessToken;
  if (loginRes.ok) {
    const body = await json(loginRes);
    accessToken = body.accessToken;
  } else {
    const regRes = await fetch(`${base}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        email,
        displayName: 'Dev seed',
      }),
    });
    if (!regRes.ok) {
      const err = await json(regRes);
      console.error('Register failed:', regRes.status, err);
      process.exit(1);
    }
    const body = await json(regRes);
    accessToken = body.accessToken;
  }

  if (!accessToken) {
    console.error('No accessToken from auth');
    process.exit(1);
  }

  const srvRes = await fetch(`${base}/api/v1/echo/servers`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ name: serverName }),
  });
  if (!srvRes.ok) {
    const err = await json(srvRes);
    console.error('Create server failed:', srvRes.status, err);
    process.exit(1);
  }
  const created = await json(srvRes);
  console.log('seed:dev ok');
  console.log('  serverId:', created.serverId);
  console.log('  defaultChannelId:', created.defaultChannelId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
