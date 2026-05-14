/**
 * Product `echo://open/...` deep links (separate from OAuth `echo_handoff` flow).
 * Registers with shell navigation once {@link useUrlNavigationSync} is ready.
 */

import {
  formatAppPathname,
  mergeModalSearchParams,
  parseUserSettingsSectionFromQuery,
  type EchoParsedPath,
} from '@/features/layout/urlNavigation';

let pendingPathWithSearch: string | null = null;
let applyFromBrowserLocation: (() => void) | null = null;
let isWorkspaceReady: (() => boolean) | null = null;

function appBase(): string {
  return import.meta.env.BASE_URL || '/';
}

function decodeSeg(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function parseEchoOpenDeepLink(u: URL): {
  pathname: string;
  search: string;
} | null {
  if (u.protocol !== 'echo:') return null;
  const host = (u.hostname || '').toLowerCase();
  if (host !== 'open') return null;

  const path = (u.pathname || '/').replace(/^\/+/, '');
  const segments = path.split('/').filter(Boolean);
  const sp = u.searchParams;
  const fromQuery = (k: string) => sp.get(k)?.trim() ?? '';

  if (segments[0] === 'settings') {
    const raw = (fromQuery('section') || segments[1] || '').trim();
    const section = parseUserSettingsSectionFromQuery(raw);
    if (!section) {
      return {
        pathname: formatAppPathname({ kind: 'explore' }, appBase()),
        search: '',
      };
    }
    const search = mergeModalSearchParams('', {
      settings: section,
    });
    return {
      pathname: formatAppPathname({ kind: 'explore' }, appBase()),
      search,
    };
  }

  if (segments.length === 0 || segments[0] === 'explore') {
    return {
      pathname: formatAppPathname({ kind: 'explore' }, appBase()),
      search: '',
    };
  }

  if (segments[0] === 'dm') {
    if (segments.length >= 3 && segments[1] === 'c') {
      const channelId = decodeSeg(segments[2]!);
      if (!channelId) return null;
      const parsed: EchoParsedPath = { kind: 'dm_thread', channelId };
      return { pathname: formatAppPathname(parsed, appBase()), search: '' };
    }
    const qC = fromQuery('channelId');
    if (qC) {
      const parsed: EchoParsedPath = { kind: 'dm_thread', channelId: qC };
      return { pathname: formatAppPathname(parsed, appBase()), search: '' };
    }
    return {
      pathname: formatAppPathname({ kind: 'dm_idle' }, appBase()),
      search: '',
    };
  }

  if (segments[0] === 'guild') {
    const serverId = decodeSeg(segments[1] || fromQuery('serverId'));
    const channelId = decodeSeg(segments[2] || fromQuery('channelId'));
    if (!serverId || !channelId) return null;
    const parsed: EchoParsedPath = {
      kind: 'guild',
      serverId,
      channelId,
    };
    return { pathname: formatAppPathname(parsed, appBase()), search: '' };
  }

  return null;
}

export function queueEchoProductDeepLink(pathWithSearch: string): void {
  pendingPathWithSearch = pathWithSearch;
}

export function flushPendingEchoProductDeepLink(): void {
  if (typeof window === 'undefined' || !applyFromBrowserLocation) return;
  const target = pendingPathWithSearch;
  if (!target) return;
  pendingPathWithSearch = null;

  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (cur === target) {
    applyFromBrowserLocation();
    return;
  }
  window.history.pushState(null, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Shell navigation calls this once {@link useUrlNavigationSync} exists.
 */
export function registerEchoProductDeepLinkNavigator(opts: {
  applyFromBrowserLocation: () => void;
  isWorkspaceReady: () => boolean;
}): void {
  applyFromBrowserLocation = opts.applyFromBrowserLocation;
  isWorkspaceReady = opts.isWorkspaceReady;
  if (isWorkspaceReady()) {
    flushPendingEchoProductDeepLink();
  }
}

/**
 * Returns true when the URL was handled as a product deep link (caller should skip OAuth merge).
 */
export function tryHandleEchoProductDeepLinkRaw(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.searchParams.get('echo_handoff')?.trim()) return false;

  const parsed = parseEchoOpenDeepLink(u);
  if (!parsed) return false;

  const target = `${parsed.pathname}${parsed.search}`;
  const ready = isWorkspaceReady?.() ?? false;
  if (!ready) {
    queueEchoProductDeepLink(target);
    return true;
  }
  pendingPathWithSearch = target;
  flushPendingEchoProductDeepLink();
  return true;
}
