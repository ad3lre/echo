export function sanitizeAttachmentStorageKey(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') return undefined;
  const sk = raw.trim();
  if (!sk || sk.length > 512 || sk.includes('..')) return undefined;
  if (!sk.startsWith('echo/')) return undefined;
  return sk;
}
