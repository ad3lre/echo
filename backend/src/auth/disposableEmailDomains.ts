import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Host-level blocklist of disposable / throwaway inbox domains.
 *
 * Source: community-maintained newline list at
 * https://github.com/disposable/disposable-email-domains (domains.txt),
 * vendored at ../data/disposable-email-domains.txt relative to the backend package.
 */

function resolveDisposableDomainsFile(): string {
  const candidates = [
    path.resolve(__dirname, '../../data/disposable-email-domains.txt'),
    path.resolve(__dirname, '../../../../data/disposable-email-domains.txt'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `[echo] Missing backend/data/disposable-email-domains.txt (searched from ${__dirname})`,
  );
}

function loadDisposableDomainSet(): ReadonlySet<string> {
  const file = resolveDisposableDomainsFile();
  const raw = fs.readFileSync(file, 'utf8');
  const next = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const d = line.split('#')[0]?.trim().toLowerCase() ?? '';
    if (!d || d.includes('@')) continue;
    next.add(d);
  }
  return next;
}

const DISPOSABLE_DOMAINS = loadDisposableDomainSet();

/** True when `host` equals a listed domain or ends with `.<listed>`. */
export function isDisposableEmailHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h) return false;
  if (DISPOSABLE_DOMAINS.has(h)) return true;
  const parts = h.split('.').filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts.slice(i).join('.');
    if (DISPOSABLE_DOMAINS.has(suffix)) return true;
  }
  return false;
}
