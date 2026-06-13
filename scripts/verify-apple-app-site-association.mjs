#!/usr/bin/env node
/**
 * Verify AASA is present in frontend/dist and matches Team ID + bundle ids.
 * Optional live check: ECHO_AASA_VERIFY_URL=https://chat-echo.com
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function fail(msg) {
  console.error(`[aasa:verify] ${msg}`);
  process.exit(1);
}

const iosConf = readJson(path.join(root, 'src-tauri', 'tauri.ios.conf.json'));
const desktopConf = readJson(path.join(root, 'src-tauri', 'tauri.conf.json'));

const teamId = (
  process.env.APPLE_DEVELOPMENT_TEAM ||
  iosConf.bundle?.iOS?.developmentTeam ||
  ''
).trim();
const iosBundleId = (
  process.env.ECHO_IOS_BUNDLE_ID ||
  iosConf.identifier ||
  ''
).trim();
const desktopBundleId = (
  process.env.ECHO_DESKTOP_BUNDLE_ID ||
  desktopConf.identifier ||
  ''
).trim();

const expectedIosAppId = `${teamId}.${iosBundleId}`;
const expectedDesktopAppId =
  desktopBundleId && desktopBundleId !== iosBundleId
    ? `${teamId}.${desktopBundleId}`
    : null;
const expectedWebcredentialApps = expectedDesktopAppId
  ? [expectedIosAppId, expectedDesktopAppId]
  : [expectedIosAppId];

const distPath = path.join(
  root,
  'frontend',
  'dist',
  '.well-known',
  'apple-app-site-association',
);

if (!fs.existsSync(distPath)) {
  fail(
    `Missing ${path.relative(root, distPath)} — run frontend build (prebuild generates AASA).`,
  );
}

let parsed;
try {
  parsed = readJson(distPath);
} catch (e) {
  fail(`Invalid JSON in dist AASA: ${e.message}`);
}

const appIds =
  parsed?.applinks?.details?.flatMap((d) => d.appIDs ?? []) ??
  parsed?.applinks?.details?.flatMap((d) => (d.appID ? [d.appID] : [])) ??
  [];

if (!appIds.includes(expectedIosAppId)) {
  fail(
    `Expected iOS appID ${expectedIosAppId} in dist AASA applinks; found ${appIds.join(', ') || '(none)'}`,
  );
}

const webcredentialApps = parsed?.webcredentials?.apps ?? [];
for (const expected of expectedWebcredentialApps) {
  if (!webcredentialApps.includes(expected)) {
    fail(
      `Expected webcredentials app ${expected} in dist AASA; found ${webcredentialApps.join(', ') || '(none)'}`,
    );
  }
}

console.warn(
  `[aasa:verify] dist file OK (applinks=${expectedIosAppId}, webcredentials=${expectedWebcredentialApps.join(', ')})`,
);

const liveUrl = process.env.ECHO_AASA_VERIFY_URL?.trim();
if (!liveUrl) {
  process.exit(0);
}

const url = `${liveUrl.replace(/\/$/, '')}/.well-known/apple-app-site-association`;
const res = await fetch(url, {
  headers: { Accept: 'application/json' },
  redirect: 'manual',
});

if (res.status >= 300 && res.status < 400) {
  fail(`Live ${url} returned redirect ${res.status}`);
}

if (!res.ok) {
  fail(`Live ${url} returned HTTP ${res.status}`);
}

const contentType = res.headers.get('content-type') ?? '';
if (!contentType.includes('json')) {
  fail(
    `Live ${url} Content-Type is "${contentType}" (expected application/json; SPA fallback?)`,
  );
}

const body = await res.text();
if (body.trimStart().startsWith('<!')) {
  fail(`Live ${url} returned HTML (SPA catch-all is intercepting AASA)`);
}

let live;
try {
  live = JSON.parse(body);
} catch (e) {
  fail(`Live AASA is not valid JSON: ${e.message}`);
}

const liveIds =
  live?.applinks?.details?.flatMap((d) => d.appIDs ?? []) ??
  live?.applinks?.details?.flatMap((d) => (d.appID ? [d.appID] : [])) ??
  [];

if (!liveIds.includes(expectedIosAppId)) {
  fail(
    `Live AASA missing iOS appID ${expectedIosAppId}; found ${liveIds.join(', ') || '(none)'}`,
  );
}

const liveWebcredentialApps = live?.webcredentials?.apps ?? [];
for (const expected of expectedWebcredentialApps) {
  if (!liveWebcredentialApps.includes(expected)) {
    fail(
      `Live AASA missing webcredentials app ${expected}; found ${liveWebcredentialApps.join(', ') || '(none)'}`,
    );
  }
}

console.warn(`[aasa:verify] live OK (${url})`);
