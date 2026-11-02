#!/usr/bin/env bun
/**
 * Build a CycloneDX 1.5 SBOM from bun.lock (+ optional Apple Package.resolved).
 * Deterministic: components sorted by purl. Used by check-osv-sbom.mjs.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

function readProductVersion() {
  const raw = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
  return raw || '0.0.0';
}

/** bun.lock is JSONC (trailing commas). Strip them before JSON.parse. */
export function parseBunLockText(text) {
  let s = text;
  for (let i = 0; i < 8; i++) {
    const next = s.replace(/,(\s*[}\]])/g, '$1');
    if (next === s) break;
    s = next;
  }
  return JSON.parse(s);
}

async function readBunLock() {
  return parseBunLockText(await Bun.file(join(ROOT, 'bun.lock')).text());
}

/**
 * Bun lockfile v3 `packages` values look like:
 *   ["name@version", "path?", { deps… }, "integrity"]
 */
function packagesFromBunLock(lock) {
  /** @type {Map<string, { name: string, version: string, purl: string }>} */
  const out = new Map();
  const pkgs = lock?.packages ?? {};
  for (const entry of Object.values(pkgs)) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
    const id = entry[0];
    // Skip workspace / link / file / catalog refs.
    if (
      id.startsWith('workspace:') ||
      id.startsWith('link:') ||
      id.startsWith('file:') ||
      id.startsWith('catalog:')
    ) {
      continue;
    }
    const at = id.lastIndexOf('@');
    if (at <= 0) continue;
    const name = id.slice(0, at);
    const version = id.slice(at + 1);
    if (!name || !version || version.includes('/')) continue;
    // CycloneDX purl: pkg:npm/name@version or pkg:npm/@scope/name@version
    const purl = `pkg:npm/${name}@${version}`;
    out.set(purl, { name, version, purl });
  }
  return [...out.values()].sort((a, b) => a.purl.localeCompare(b.purl));
}

function packagesFromAppleResolved(resolved) {
  const pins = resolved?.pins ?? [];
  /** @type {{ name: string, version: string, purl: string, type: string }[]} */
  const out = [];
  for (const pin of pins) {
    const name = pin?.identity;
    const version = pin?.state?.version || pin?.state?.revision;
    const loc = pin?.location || '';
    if (!name || !version) continue;
    const purl = loc.includes('github.com/')
      ? `pkg:swift/${name}@${version}`
      : `pkg:generic/${name}@${version}`;
    out.push({ name, version, purl, type: 'library' });
  }
  return out.sort((a, b) => a.purl.localeCompare(b.purl));
}

/**
 * @param {{ vulnerabilities?: object[] }} [opts]
 */
export async function generateEchoSbom(opts = {}) {
  const version = readProductVersion();
  const lock = await readBunLock();
  const npmPkgs = packagesFromBunLock(lock);

  const applePath = join(ROOT, 'clients/apple/Package.resolved');
  const applePkgs = existsSync(applePath)
    ? packagesFromAppleResolved(await Bun.file(applePath).json())
    : [];

  const components = [
    ...npmPkgs.map((p) => ({
      type: 'library',
      name: p.name,
      version: p.version,
      purl: p.purl,
      bom_ref: p.purl,
    })),
    ...applePkgs.map((p) => ({
      type: 'library',
      name: p.name,
      version: p.version,
      purl: p.purl,
      bom_ref: p.purl,
    })),
  ];

  /** @type {Record<string, unknown>} */
  const bom = {
    $schema: 'http://cyclonedx.org/schema/bom-1.5.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:echo-sbom-${version.replace(/[^0-9a-z.-]/gi, '-')}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: {
        components: [
          {
            type: 'application',
            name: 'generate-echo-sbom',
            version: '1.0.0',
          },
        ],
      },
      component: {
        type: 'application',
        name: 'echo',
        version,
        bom_ref: `pkg:generic/echo@${version}`,
      },
    },
    components,
  };

  if (opts.vulnerabilities?.length) {
    bom.vulnerabilities = opts.vulnerabilities;
  }

  return bom;
}

export function defaultSbomPaths() {
  const dir = join(ROOT, 'security/sbom');
  return {
    dir,
    cdx: join(dir, 'echo.cdx.json'),
    vdr: join(dir, 'echo.vdr.json'),
  };
}

if (import.meta.main) {
  const bom = await generateEchoSbom();
  const { dir, cdx } = defaultSbomPaths();
  mkdirSync(dir, { recursive: true });
  // Stable JSON (sorted keys not needed; components already sorted).
  const body = `${JSON.stringify(bom, null, 2)}\n`;
  // Strip volatile timestamp for committed transparency diffs when ECHO_SBOM_STABLE=1.
  let out = body;
  if (process.env.ECHO_SBOM_STABLE === '1') {
    const parsed = JSON.parse(body);
    if (parsed.metadata) parsed.metadata.timestamp = '1970-01-01T00:00:00.000Z';
    out = `${JSON.stringify(parsed, null, 2)}\n`;
  }
  await Bun.write(cdx, out);
  console.log(
    `[sbom:generate] wrote ${cdx} (${bom.components.length} components)`,
  );
}
