#!/usr/bin/env bun
/**
 * Ensure a pinned Google osv-scanner binary is available under server/ops/.cache/.
 * Prints the absolute path to stdout when run as a script.
 */
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

/** Keep in sync with docs/operations/sbom-vdr.md */
export const OSV_SCANNER_VERSION = '2.7.0';

const RELEASE_BASE = `https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}`;

/** @type {Record<string, { asset: string, sha256: string }>} */
const ASSETS = {
  'linux-x64': {
    asset: 'osv-scanner_linux_amd64',
    sha256: '160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b',
  },
  'linux-arm64': {
    asset: 'osv-scanner_linux_arm64',
    sha256: '4061ef4c021ed3c47f203b818f337e351336cc5cd67c0274fc36bd1dfc728dd7',
  },
  'darwin-x64': {
    asset: 'osv-scanner_darwin_amd64',
    sha256: 'e82c5df7ab0a42dff29a1cd0660711447b56b4c0483ff66ad8634df10fd81a45',
  },
  'darwin-arm64': {
    asset: 'osv-scanner_darwin_arm64',
    sha256: 'd4926ef8da134332543be276dff157e4c170f99ad91fc48e89448a8816bdf70b',
  },
};

function platformKey() {
  const key = `${process.platform}-${process.arch}`;
  if (!ASSETS[key]) {
    throw new Error(`ensure-osv-scanner: unsupported platform ${key}`);
  }
  return key;
}

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`ensure-osv-scanner: download failed ${res.status} ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function ensureOsvScanner() {
  const { asset, sha256 } = ASSETS[platformKey()];
  const cacheDir = join(
    ROOT,
    'server/ops/.cache/osv-scanner',
    `v${OSV_SCANNER_VERSION}`,
  );
  const binPath = join(cacheDir, 'osv-scanner');
  if (existsSync(binPath)) {
    return binPath;
  }

  mkdirSync(cacheDir, { recursive: true });
  const url = `${RELEASE_BASE}/${asset}`;
  const buf = await download(url);
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== sha256) {
    throw new Error(
      `ensure-osv-scanner: sha256 mismatch for ${asset}: got ${got}, want ${sha256}`,
    );
  }
  const tmp = `${binPath}.tmp`;
  await Bun.write(tmp, buf);
  chmodSync(tmp, 0o755);
  renameSync(tmp, binPath);
  return binPath;
}

if (import.meta.main) {
  console.log(await ensureOsvScanner());
}
