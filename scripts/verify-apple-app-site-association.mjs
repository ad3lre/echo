#!/usr/bin/env node
/**
 * Verify AASA is present in frontend/dist and matches Team ID + bundle ids
 * from `apple/project.yml` (or env overrides).
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

function readProjectYmlIds() {
  const ymlPath = path.join(root, 'apple', 'project.yml');
  if (!fs.existsSync(ymlPath)) {
    return { teamId: '', iosBundleId: '', macosBundleId: '' };
  }
  const text = fs.readFileSync(ymlPath, 'utf8');
  const team =
    text.match(/DEVELOPMENT_TEAM:\s*['"]?([A-Z0-9]+)['"]?/)?.[1] ?? '';
  const bundles = [
    ...text.matchAll(/PRODUCT_BUNDLE_IDENTIFIER:\s*([A-Za-z0-9.]+)/g),
  ].map((m) => m[1]);
  const iosBundleId =
    bundles.find((b) => b.includes('.ios') || b.endsWith('.ios')) ??
    bundles[0] ??
    '';
  const macosBundleId =
    bundles.find((b) => b.includes('.macos') || b.endsWith('.macos')) ??
    bundles.find((b) => b !== iosBundleId) ??
    '';
  return { teamId: team, iosBundleId, macosBundleId };
}

const fromYml = readProjectYmlIds();

const teamId = (
  process.env.APPLE_DEVELOPMENT_TEAM ||
  fromYml.teamId ||
  ''
).trim();
const iosBundleId = (
  process.env.ECHO_IOS_BUNDLE_ID ||
  fromYml.iosBundleId ||
  ''
).trim();
const macosBundleId = (
  process.env.ECHO_MACOS_BUNDLE_ID ||
  process.env.ECHO_DESKTOP_BUNDLE_ID ||
  fromYml.macosBundleId ||
  ''
).trim();

if (!teamId || !iosBundleId) {
  fail(
    'Missing APPLE_DEVELOPMENT_TEAM or iOS bundle id (apple/project.yml / env)',
  );
}

const expectedIosAppId = `${teamId}.${iosBundleId}`;
const expectedMacosAppId =
  macosBundleId && macosBundleId !== iosBundleId
    ? `${teamId}.${macosBundleId}`
    : null;
const expectedWebcredentialApps = expectedMacosAppId
  ? [expectedIosAppId, expectedMacosAppId]
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
