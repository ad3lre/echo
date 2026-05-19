import type { AuthSessionInfo } from '@/api/authClient';

export type ParsedClientEnvironment = {
  os: string;
  device: string;
  /** e.g. `Windows — PC` or `iOS — iPhone` */
  headline: string;
};

/** Small map for iPhone hardware strings occasionally present in Mobile Safari UAs. */
const IPHONE_HW: Record<string, string> = {
  'iPhone8,1': 'iPhone 6s',
  'iPhone8,2': 'iPhone 6s Plus',
  'iPhone9,1': 'iPhone 7',
  'iPhone9,2': 'iPhone 7 Plus',
  'iPhone9,3': 'iPhone 7',
  'iPhone9,4': 'iPhone 7 Plus',
  'iPhone10,1': 'iPhone 8',
  'iPhone10,2': 'iPhone 8 Plus',
  'iPhone10,3': 'iPhone X',
  'iPhone10,4': 'iPhone 8',
  'iPhone10,5': 'iPhone 8 Plus',
  'iPhone10,6': 'iPhone X',
  'iPhone14,7': 'iPhone 14',
  'iPhone14,8': 'iPhone 14 Plus',
  'iPhone15,2': 'iPhone 14 Pro',
  'iPhone15,3': 'iPhone 14 Pro Max',
  'iPhone15,4': 'iPhone 15',
  'iPhone15,5': 'iPhone 15 Plus',
  'iPhone16,1': 'iPhone 15 Pro',
  'iPhone16,2': 'iPhone 15 Pro Max',
};

function iphoneModelFromUa(u: string): string | null {
  const m = u.match(/iPhone(\d+,\d+)/i);
  if (!m) return null;
  const key = `iPhone${m[1]}`;
  return IPHONE_HW[key] ?? 'iPhone';
}

/**
 * Best-effort client environment label from a stored User-Agent (no extra npm deps).
 * Order: OS first, then device / form factor.
 */
export function parseAuthSessionUserAgent(
  ua: string | null | undefined,
): ParsedClientEnvironment {
  const raw = typeof ua === 'string' && ua.trim() ? ua.trim() : '';
  if (!raw) {
    return {
      os: 'Unknown OS',
      device: 'Browser',
      headline: 'Unknown OS — Browser',
    };
  }
  const u = raw;

  // Apple mobile
  const iosVer = u.match(/CPU (?:iPhone )?OS ([\d_]+)/i);
  if (/iPhone|iPad|iPod/i.test(u)) {
    const ver = iosVer?.[1]?.replace(/_/g, '.') ?? '';
    const os = ver ? `iOS ${ver.split('.').slice(0, 3).join('.')}` : 'iOS';
    let device = 'Apple device';
    if (/iPad/i.test(u)) device = 'iPad';
    else if (/iPod/i.test(u)) device = 'iPod touch';
    else if (/iPhone/i.test(u)) device = iphoneModelFromUa(u) ?? 'iPhone';
    return { os, device, headline: `${os} — ${device}` };
  }

  // macOS
  const macVer = u.match(/Mac OS X ([\d_]+)/i);
  if (/Macintosh|Mac OS X/i.test(u)) {
    const ver = macVer?.[1]?.replace(/_/g, '.') ?? '';
    const os = ver ? `macOS ${ver.split('.').slice(0, 3).join('.')}` : 'macOS';
    const device = /Mobile\/\w+/i.test(u) ? 'Mac (touch class)' : 'Mac';
    return { os, device, headline: `${os} — ${device}` };
  }

  // Android
  if (/Android/i.test(u)) {
    const av = u.match(/Android ([\d.]+)/i);
    const os = av?.[1] ? `Android ${av[1]}` : 'Android';
    let device = /Mobile/i.test(u) ? 'Android phone' : 'Android tablet';
    const buildMatch = u.match(/;\s*([^;)]+?)\s*(?:Build|\))/i);
    if (buildMatch) {
      const hint = buildMatch[1].trim();
      if (hint && !/^linux/i.test(hint) && !/^android$/i.test(hint)) {
        device = hint;
      }
    }
    return { os, device, headline: `${os} — ${device}` };
  }

  // Windows
  if (/Windows NT/i.test(u)) {
    let os = 'Windows';
    if (/Windows NT 10\.0/i.test(u)) os = 'Windows 10/11';
    else if (/Windows NT 6\.3/i.test(u)) os = 'Windows 8.1';
    else if (/Windows NT 6\.2/i.test(u)) os = 'Windows 8';
    else if (/Windows NT 6\.1/i.test(u)) os = 'Windows 7';
    const device = /Touch/i.test(u) ? 'PC (touch)' : 'PC';
    return { os, device, headline: `${os} — ${device}` };
  }

  // Linux desktop / other
  if (/Linux/i.test(u) && !/Android/i.test(u)) {
    const os = 'Linux';
    let device = 'Desktop';
    if (/CrOS/i.test(u)) device = 'Chromebook';
    return { os, device, headline: `${os} — ${device}` };
  }

  return {
    os: 'Unknown OS',
    device: 'Browser',
    headline: 'Unknown OS — Browser',
  };
}

export type AuthSessionDisplayGroup = {
  groupKey: string;
  os: string;
  device: string;
  headline: string;
  sessions: AuthSessionInfo[];
};

export function groupAuthSessionsForDisplay(
  sessions: AuthSessionInfo[],
): AuthSessionDisplayGroup[] {
  const map = new Map<string, AuthSessionDisplayGroup>();
  for (const s of sessions) {
    const { os, device, headline } = parseAuthSessionUserAgent(s.userAgent);
    const key = headline;
    let g = map.get(key);
    if (!g) {
      g = { groupKey: key, os, device, headline, sessions: [] };
      map.set(key, g);
    }
    g.sessions.push(s);
  }
  for (const g of map.values()) {
    g.sessions.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  return [...map.values()].sort((a, b) => {
    if (a.os !== b.os) return a.os.localeCompare(b.os);
    return a.device.localeCompare(b.device);
  });
}
