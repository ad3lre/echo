export function isAllowedJumpUrl(
  url: URL,
  origins?: readonly string[],
): boolean {
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return false;
  if (!origins) return true;
  return origins.some((base) => {
    try {
      return new URL(base).origin === url.origin;
    } catch {
      return false;
    }
  });
}
