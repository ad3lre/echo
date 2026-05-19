/** True when `hostname` equals `suffix` or is a subdomain of it. */
export function hostnameMatchesSuffix(
  hostname: string,
  suffix: string,
): boolean {
  const h = hostname.toLowerCase();
  const s = suffix.toLowerCase();
  return h === s || h.endsWith(`.${s}`);
}

/** Parse `url` and compare hostname to `suffix` (http/https only). */
export function urlHostnameMatchesSuffix(url: string, suffix: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return hostnameMatchesSuffix(u.hostname, suffix);
  } catch {
    return false;
  }
}
