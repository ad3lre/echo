/** Client-built share URLs (avoids empty Origin on server responses). */

function appBasePath(): string {
  const b = import.meta.env.BASE_URL || '/';
  return b.endsWith('/') ? b : `${b}/`;
}

function originBase(): string {
  if (typeof window === 'undefined') return '';
  const base = appBasePath();
  return `${window.location.origin}${base}`;
}

export function buildPaperServerShareUrl(
  serverId: string,
  channelId: string,
): string {
  const root = originBase();
  if (!root) return '';
  return `${root}channels/${encodeURIComponent(serverId)}/${encodeURIComponent(channelId)}`;
}

export function buildPaperGlobalShareUrl(token: string): string {
  const root = originBase();
  if (!root) return '';
  return `${root}paper/s/${encodeURIComponent(token)}`;
}
