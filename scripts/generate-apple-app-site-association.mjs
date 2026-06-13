#!/usr/bin/env node
/**
 * Writes `frontend/public/.well-known/apple-app-site-association` for iOS Universal Links
 * and Shared Web Credentials (Password AutoFill / passkeys on iOS + macOS desktop).
 *
 * Team ID and iOS bundle id default from `src-tauri/tauri.ios.conf.json`.
 * macOS desktop bundle id from `src-tauri/tauri.conf.json` (`com.echo.desktop`).
 * Override for other deployments:
 *   APPLE_DEVELOPMENT_TEAM, ECHO_IOS_BUNDLE_ID, ECHO_DESKTOP_BUNDLE_ID, ECHO_APP_LINK_HOST
 *
 * Skip entirely: ECHO_SKIP_APP_SITE_ASSOCIATION=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

if (process.env.ECHO_SKIP_APP_SITE_ASSOCIATION === '1') {
  process.exit(0);
}

const iosConfPath = path.join(root, 'src-tauri', 'tauri.ios.conf.json');
const desktopConfPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const iosConf = readJson(iosConfPath);
const desktopConf = readJson(desktopConfPath);

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

const host = (process.env.ECHO_APP_LINK_HOST || 'chat-echo.com').trim();

if (!teamId || !iosBundleId) {
  console.warn(
    '[aasa] Skip: missing APPLE_DEVELOPMENT_TEAM or iOS bundle id in tauri.ios.conf.json',
  );
  process.exit(0);
}

const iosAppId = `${teamId}.${iosBundleId}`;
const desktopAppId =
  desktopBundleId && desktopBundleId !== iosBundleId
    ? `${teamId}.${desktopBundleId}`
    : null;

const webcredentialApps = desktopAppId ? [iosAppId, desktopAppId] : [iosAppId];

/** Paths Echo handles in the SPA (see urlNavigation.ts RESERVED_TOP_LEVEL_PATH_SLUGS). */
const aasa = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: [iosAppId],
        components: [
          {
            '/': '/channels/*',
            comment: 'Server and channel navigation',
          },
          {
            '/': '/explore',
            comment: 'Explore landing',
          },
          {
            '/': '/legal/*',
            exclude: true,
          },
          {
            '/': '/reset-password',
            exclude: true,
          },
          {
            '/': '/forgot-password',
            exclude: true,
          },
          {
            '/': '/paper/*',
            exclude: true,
          },
          {
            '/': '/oauth-desktop-bridge.html',
            exclude: true,
          },
          {
            '/': '/*',
            comment: 'Public invite vanity URLs (single path segment)',
          },
        ],
      },
    ],
  },
  webcredentials: {
    apps: webcredentialApps,
  },
};

const outDir = path.join(root, 'frontend', 'public', '.well-known');
const outPath = path.join(outDir, 'apple-app-site-association');
const json = `${JSON.stringify(aasa, null, 2)}\n`;

fs.mkdirSync(outDir, { recursive: true });

const prev = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
if (prev === json) {
  process.exit(0);
}

fs.writeFileSync(outPath, json, 'utf8');
console.warn(
  `[aasa] Wrote ${path.relative(root, outPath)} (webcredentials=${webcredentialApps.join(', ')}, host=${host})`,
);
