function stripControlChars(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)!;
    if (code >= 0x20 && code !== 0x7f) out += s[i];
  }
  return out;
}

function toSafeSegmentChars(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (
      (c >= 'a' && c <= 'z') ||
      (c >= 'A' && c <= 'Z') ||
      (c >= '0' && c <= '9') ||
      c === '.' ||
      c === '_' ||
      c === '-'
    ) {
      out += c;
    } else {
      out += '_';
    }
  }
  return out;
}

function collapseUnderscores(s: string): string {
  let out = '';
  let prevUnderscore = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '_') {
      if (!prevUnderscore) out += '_';
      prevUnderscore = true;
    } else {
      out += c;
      prevUnderscore = false;
    }
  }
  return out;
}

function trimUnderscoreEdges(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === '_') start++;
  while (end > start && s[end - 1] === '_') end--;
  return s.slice(start, end);
}

export function sanitizeEchoUploadObjectKeyFragment(raw: string): string {
  const t = raw.trim().replace(/^\/+/, '').replace(/\\/g, '/');
  if (!t || t.includes('..')) return '';
  if (t.toLowerCase().startsWith('data:')) return '';

  const parts = t
    .split('/')
    .map((seg) => {
      const cleaned = trimUnderscoreEdges(
        collapseUnderscores(toSafeSegmentChars(stripControlChars(seg))),
      );
      return cleaned.slice(0, 80);
    })
    .filter(Boolean);

  if (parts.length === 0) return '';
  return parts.join('/').slice(0, 400);
}
