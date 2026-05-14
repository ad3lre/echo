export function sanitizeEchoUploadObjectKeyFragment(raw: string): string {
  const t = raw.trim().replace(/^\/+/, '').replace(/\\/g, '/');
  if (!t || t.includes('..')) return '';
  if (t.toLowerCase().startsWith('data:')) return '';

  const parts = t
    .split('/')
    .map((seg) => {
      const cleaned = seg
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
      return cleaned.slice(0, 80);
    })
    .filter(Boolean);

  if (parts.length === 0) return '';
  return parts.join('/').slice(0, 400);
}
