/**
 * Fallback embeds built only from URL shape (hostname + path), when the origin blocks
 * server-side fetches (403) or returns no usable Open Graph data.
 *
 * This is not a crawler bypass — it does not impersonate browsers or evade protections.
 */

import type { Embed } from '../../../../../contracts/types';

const CANVA_COLOR = 0x00c4cc;
const FIGMA_COLOR = 0xa259ff;
const NOTION_COLOR = 0x000000;
const INSTAGRAM_COLOR = 0xe4405f;
const THREADS_COLOR = 0x000000;
const LINKEDIN_COLOR = 0x0a66c2;
const META_BLUE = 0x1877f2;
const X_COLOR = 0x1d9bf0;
const GOOGLE_BLUE = 0x4285f4;
const MIRO_COLOR = 0x050038;

function isUrlSafeForStub(urlString: string): boolean {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (
    u.hostname.toLowerCase() === 'localhost' ||
    u.hostname.toLowerCase().endsWith('.localhost') ||
    u.hostname.toLowerCase().endsWith('.local')
  ) {
    return false;
  }
  const bracketedIpv6 =
    u.hostname.startsWith('[') && u.hostname.endsWith(']')
      ? u.hostname.slice(1, -1).toLowerCase()
      : null;
  const ipv6 = bracketedIpv6 ?? (u.hostname.includes(':') ? u.hostname : null);
  if (ipv6) {
    const normalized = ipv6.split('%')[0]!.toLowerCase();
    if (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return false;
    }
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = u.hostname.toLowerCase().match(ipv4);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return false;
    }
  }
  if (u.username || u.password) return false;
  return true;
}

function hostLower(url: URL): string {
  return url.hostname.toLowerCase();
}

function blockedCard(
  urlString: string,
  title: string,
  provider: string,
  color: number,
  extra?: string,
): Embed {
  const base = `${provider} often blocks automated previews from servers; Echo cannot load a live card. Open the link in your browser.`;
  return {
    url: urlString,
    title,
    description: extra ? `${extra} ${base}` : base,
    provider,
    color,
  };
}

/**
 * When `unfurlUrlToEmbed` cannot fetch HTML, still show a useful card using public URL structure.
 */
export function stubEmbedFromUrlWhenUnfurlFails(
  urlString: string,
): Embed | null {
  if (!isUrlSafeForStub(urlString)) return null;
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }

  const host = hostLower(u);

  const isCanva = host === 'canva.com' || host.endsWith('.canva.com');
  if (isCanva) {
    const design = u.pathname.match(/\/design\/([^/]+)/);
    const designKey = design?.[1]?.trim();
    const base =
      'Canva blocks automated page fetches, so Echo cannot load a live preview. Open the link in Canva.';
    const description =
      designKey && designKey.length <= 64
        ? `Design key: ${designKey}. ${base}`
        : base;
    return {
      url: urlString,
      title: designKey ? 'Canva design' : 'Canva',
      description,
      provider: 'Canva',
      color: CANVA_COLOR,
    };
  }

  const isFigma = host === 'figma.com' || host.endsWith('.figma.com');
  if (isFigma) {
    const file = u.pathname.match(/\/(?:file|design)\/([^/]+)/);
    const key = file?.[1]?.trim();
    return blockedCard(
      urlString,
      key ? 'Figma file' : 'Figma',
      'Figma',
      FIGMA_COLOR,
      key && key.length <= 80 ? `File key: ${key}.` : undefined,
    );
  }

  const isNotion =
    host === 'notion.so' ||
    host.endsWith('.notion.so') ||
    host === 'notion.site' ||
    host.endsWith('.notion.site');
  if (isNotion) {
    return blockedCard(urlString, 'Notion', 'Notion', NOTION_COLOR);
  }

  const isInstagram =
    host === 'instagram.com' || host.endsWith('.instagram.com');
  if (isInstagram) {
    const post = u.pathname.match(/\/(?:p|reel|reels|tv)\/([^/]+)/);
    const id = post?.[1]?.trim();
    return blockedCard(
      urlString,
      id ? 'Instagram post' : 'Instagram',
      'Instagram',
      INSTAGRAM_COLOR,
      id && id.length <= 80 ? `Short code: ${id}.` : undefined,
    );
  }

  if (host === 'threads.net' || host.endsWith('.threads.net')) {
    const post = u.pathname.match(/\/@[^/]+\/post\/([^/]+)/);
    const id = post?.[1]?.trim();
    return blockedCard(
      urlString,
      id ? 'Threads post' : 'Threads',
      'Threads',
      THREADS_COLOR,
      id && id.length <= 80 ? `Post id: ${id}.` : undefined,
    );
  }

  const isLinkedIn = host === 'linkedin.com' || host.endsWith('.linkedin.com');
  if (isLinkedIn) {
    return blockedCard(urlString, 'LinkedIn', 'LinkedIn', LINKEDIN_COLOR);
  }

  const isFacebook =
    host === 'facebook.com' ||
    host.endsWith('.facebook.com') ||
    host === 'fb.com' ||
    host.endsWith('.fb.com') ||
    host === 'm.facebook.com' ||
    host === 'fb.watch' ||
    host.endsWith('.fb.watch');
  if (isFacebook) {
    return blockedCard(urlString, 'Facebook', 'Facebook', META_BLUE);
  }

  const isX =
    host === 'twitter.com' ||
    host.endsWith('.twitter.com') ||
    host === 'x.com' ||
    host.endsWith('.x.com');
  if (isX) {
    const status = u.pathname.match(/\/status\/(\d+)/);
    const id = status?.[1]?.trim();
    return blockedCard(
      urlString,
      id ? 'Post on X' : 'X',
      'X',
      X_COLOR,
      id ? `Status id: ${id}.` : undefined,
    );
  }

  const isGoogleDoc =
    host === 'docs.google.com' ||
    host === 'drive.google.com' ||
    host === 'slides.google.com' ||
    host === 'forms.google.com' ||
    host === 'sheets.google.com';
  if (isGoogleDoc) {
    return blockedCard(
      urlString,
      'Google Workspace link',
      'Google',
      GOOGLE_BLUE,
    );
  }

  const isMiro = host === 'miro.com' || host.endsWith('.miro.com');
  if (isMiro) {
    const brd = u.pathname.match(/\/app\/board\/([^/]+)/);
    const id = brd?.[1]?.trim();
    return blockedCard(
      urlString,
      id ? 'Miro board' : 'Miro',
      'Miro',
      MIRO_COLOR,
      id && id.length <= 80 ? `Board id: ${id}.` : undefined,
    );
  }

  const isTikTok = host === 'tiktok.com' || host.endsWith('.tiktok.com');
  if (isTikTok) {
    const vid = u.pathname.match(/\/video\/(\d+)/);
    const id = vid?.[1]?.trim();
    return blockedCard(
      urlString,
      id ? 'TikTok video' : 'TikTok',
      'TikTok',
      0x000000,
      id ? `Video id: ${id}.` : undefined,
    );
  }

  return null;
}

function hostnameShouldSkipHttpFetch(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'canva.com' || h.endsWith('.canva.com')) return true;
  if (h === 'figma.com' || h.endsWith('.figma.com')) return true;
  if (
    h === 'notion.so' ||
    h.endsWith('.notion.so') ||
    h === 'notion.site' ||
    h.endsWith('.notion.site')
  )
    return true;
  if (h === 'instagram.com' || h.endsWith('.instagram.com')) return true;
  if (h === 'threads.net' || h.endsWith('.threads.net')) return true;
  if (h === 'linkedin.com' || h.endsWith('.linkedin.com')) return true;
  if (
    h === 'facebook.com' ||
    h.endsWith('.facebook.com') ||
    h === 'fb.com' ||
    h.endsWith('.fb.com') ||
    h === 'm.facebook.com' ||
    h === 'fb.watch' ||
    h.endsWith('.fb.watch')
  ) {
    return true;
  }
  if (
    h === 'twitter.com' ||
    h.endsWith('.twitter.com') ||
    h === 'x.com' ||
    h.endsWith('.x.com')
  )
    return true;
  if (
    h === 'docs.google.com' ||
    h === 'drive.google.com' ||
    h === 'slides.google.com' ||
    h === 'forms.google.com' ||
    h === 'sheets.google.com'
  ) {
    return true;
  }
  if (h === 'miro.com' || h.endsWith('.miro.com')) return true;
  /** oEmbed is tried first in linkUnfurl; HTML fetch is usually a login wall. */
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return true;
  return false;
}

/** Hosts that usually 403 or return login HTML — skip HTTP and use oEmbed (if any) + URL-shape stub only. */
export function shouldSkipHttpUnfurlForUrl(urlString: string): boolean {
  if (!isUrlSafeForStub(urlString)) return false;
  try {
    return hostnameShouldSkipHttpFetch(new URL(urlString).hostname);
  } catch {
    return false;
  }
}
