/** Returns `raw` only when it is an absolute http(s) URL; otherwise undefined (render without href). */
export function safeEmbedHref(
  raw: string | null | undefined,
): string | undefined {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t) return undefined;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:' ? t : undefined;
  } catch {
    return undefined;
  }
}
