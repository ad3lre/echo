#!/usr/bin/env node
/**
 * Writes `clients/web/public/.well-known/apple-app-site-association` for iOS
 * Universal Links and Shared Web Credentials (Password AutoFill / passkeys).
 *
 * Defaults come from `clients/apple/project.yml` (DEVELOPMENT_TEAM + PRODUCT_BUNDLE_IDENTIFIER).
 * Override for other deployments:
 *   APPLE_DEVELOPMENT_TEAM, ECHO_IOS_BUNDLE_ID, ECHO_MACOS_BUNDLE_ID, ECHO_APP_LINK_HOST
 *
 * Skip entirely: ECHO_SKIP_APP_SITE_ASSOCIATION=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

if (process.env.ECHO_SKIP_APP_SITE_ASSOCIATION === '1') {
  process.exit(0);
}

function readProjectYmlIds() {
  const ymlPath = path.join(root, 'clients', 'apple', 'project.yml');
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

const host = (process.env.ECHO_APP_LINK_HOST || 'chat-echo.com').trim();

if (!teamId || !iosBundleId) {
  console.warn(
    '[aasa] Skip: missing APPLE_DEVELOPMENT_TEAM or iOS bundle id in clients/apple/project.yml',
  );
  process.exit(0);
}

const iosAppId = `${teamId}.${iosBundleId}`;
const macosAppId =
  macosBundleId && macosBundleId !== iosBundleId
    ? `${teamId}.${macosBundleId}`
    : null;

const webcredentialApps = macosAppId ? [iosAppId, macosAppId] : [iosAppId];

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

const outDir = path.join(root, 'clients', 'web', 'public', '.well-known');
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
