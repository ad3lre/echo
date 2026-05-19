import {
  formatAppPathname,
  parseAppPathname,
  type EchoParsedPath,
} from '@/features/layout/urlNavigation';
import { isEchoGraphId } from '@/utils/echoIds';

export type GuildEventLocationResolution =
  | { kind: 'server_channel'; serverId: string; channelId: string }
  | { kind: 'shell_path'; pathWithSearch: string }
  | { kind: 'external'; url: string }
  | { kind: 'plain'; text: string; detectedUrls: string[] }
  | { kind: 'fallback_server'; serverId: string };

const URL_IN_TEXT_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

function collectHttpUrls(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(URL_IN_TEXT_RE.source, URL_IN_TEXT_RE.flags);
  while ((m = re.exec(text)) != null) {
    const u = m[0]!.trim();
    if (u) out.push(u);
  }
  return out;
}

function tryParseSameOriginAppPath(
  rawUrl: string,
  base: string,
): EchoParsedPath | null {
  try {
    const u = new URL(rawUrl);
    if (typeof window === 'undefined') return null;
    if (u.origin !== window.location.origin) return null;
    return parseAppPathname(u.pathname, base);
  } catch {
    return null;
  }
}

function parsedFromPathString(pathish: string, base: string): EchoParsedPath {
  const t = pathish.trim();
  const withSlash = t.startsWith('/') ? t : `/${t}`;
  return parseAppPathname(withSlash, base);
}

function shellPathForParsed(parsed: EchoParsedPath, base: string): string {
  const pathname = formatAppPathname(parsed, base);
  return `${pathname}${typeof window !== 'undefined' ? window.location.search : ''}`;
}

/**
 * Decide where an event “location” should take the user: linked channel, Echo URL/path,
 * external link, or a rich fallback for free-text venues.
 */
export function resolveGuildEventLocation(input: {
  eventServerId: string;
  channelId: string | null | undefined;
  customLocation: string | null | undefined;
  base: string;
}): GuildEventLocationResolution {
  const sid = input.eventServerId?.trim();
  if (!sid || sid === 'echo') {
    return { kind: 'plain', text: 'Unknown server', detectedUrls: [] };
  }

  const ch = typeof input.channelId === 'string' ? input.channelId.trim() : '';
  if (ch) {
    return { kind: 'server_channel', serverId: sid, channelId: ch };
  }

  const raw = (input.customLocation ?? '').trim();
  if (!raw) {
    return { kind: 'fallback_server', serverId: sid };
  }

  if (/^https?:\/\//i.test(raw)) {
    const asApp = tryParseSameOriginAppPath(raw, input.base);
    if (asApp && asApp.kind !== 'unknown') {
      return {
        kind: 'shell_path',
        pathWithSearch: shellPathForParsed(asApp, input.base),
      };
    }
    return { kind: 'external', url: raw };
  }

  if (isEchoGraphId(raw) && !raw.includes('/')) {
    return { kind: 'server_channel', serverId: sid, channelId: raw };
  }

  if (raw.includes('/channels/') || raw.startsWith('/channels/')) {
    const p = parsedFromPathString(
      raw.includes('/channels/') ? raw.slice(raw.indexOf('/channels/')) : raw,
      input.base,
    );
    if (p.kind !== 'unknown') {
      return {
        kind: 'shell_path',
        pathWithSearch: shellPathForParsed(p, input.base),
      };
    }
  }

  if (raw.startsWith('/')) {
    const p = parseAppPathname(raw, input.base);
    if (p.kind !== 'unknown') {
      return {
        kind: 'shell_path',
        pathWithSearch: shellPathForParsed(p, input.base),
      };
    }
  }

  const loneSlug = /^[A-Za-z0-9_-]{6,64}$/.test(raw) && !raw.includes(' ');
  if (loneSlug) {
    const vanity = parsedFromPathString(`/${raw}`, input.base);
    if (vanity.kind === 'guild') {
      return {
        kind: 'shell_path',
        pathWithSearch: shellPathForParsed(vanity, input.base),
      };
    }
  }

  return { kind: 'plain', text: raw, detectedUrls: collectHttpUrls(raw) };
}
