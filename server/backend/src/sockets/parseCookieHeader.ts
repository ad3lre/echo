/** Parse a single cookie value from a `Cookie` request header (first match). */
export function parseCookieValue(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header || !name) return undefined;
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    const v = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return undefined;
}
