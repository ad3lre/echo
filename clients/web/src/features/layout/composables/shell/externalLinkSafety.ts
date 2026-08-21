import { requestAppConfirm } from '@/features/layout/failures/appDialogs';
import { hostnameMatchesSuffix } from '@/features/chat/composables/hostMatches';

const STORAGE_KEY = 'echo_external_link_ack_v1';

/**
 * Large, widely used hosts where we skip the first-visit warning.
 * Match includes subdomains (see {@link hostnameMatchesSuffix}).
 */
const TRUSTED_EXTERNAL_HOST_SUFFIXES: readonly string[] = [
  'youtube.com',
  'youtu.be',
  'google.com',
  'googleusercontent.com',
  'gstatic.com',
  'github.com',
  'githubusercontent.com',
  'microsoft.com',
  'live.com',
  'office.com',
  'apple.com',
  'icloud.com',
  'mozilla.org',
  'wikipedia.org',
  'wikimedia.org',
  'openstreetmap.org',
  'twitch.tv',
  'twitter.com',
  'x.com',
  'instagram.com',
  'facebook.com',
  'fb.com',
  'meta.com',
  'messenger.com',
  'linkedin.com',
  'reddit.com',
  'discord.com',
  'discordapp.com',
  'discord.gg',
  'discordstatus.com',
  'spotify.com',
  'dropbox.com',
  'zoom.us',
  'slack.com',
  'notion.so',
  'notion.site',
  'stripe.com',
  'npmjs.com',
  'stackoverflow.com',
  'stackexchange.com',
  'gitlab.com',
  'medium.com',
  'paypal.com',
  'amazon.com',
  'amazonaws.com',
  'giphy.com',
  'tenor.com',
];

export function isTrustedExternalHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return false;
  return TRUSTED_EXTERNAL_HOST_SUFFIXES.some((suffix) =>
    hostnameMatchesSuffix(h, suffix),
  );
}

/** Group `www.foo.com` with `foo.com` for a single acknowledgment. */
export function externalLinkAcknowledgmentKey(hostname: string): string {
  const h = hostname.trim().toLowerCase();
  if (!h) return '';
  return h.startsWith('www.') ? h.slice(4) : h;
}

function readAcknowledgedKeys(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((x): x is string => typeof x === 'string' && x.length > 0),
    );
  } catch {
    return new Set();
  }
}

function persistAcknowledgedKeys(keys: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    /* quota / private mode */
  }
}

function rememberAcknowledgment(key: string): void {
  const k = key.trim().toLowerCase();
  if (!k) return;
  const next = readAcknowledgedKeys();
  next.add(k);
  persistAcknowledgedKeys(next);
}

/**
 * Returns true if the user may proceed to open this URL (or no prompt was needed).
 * Persists an acknowledgment for this site key when the user confirms.
 */
export async function ensureExternalLinkSafetyAcknowledged(
  normalizedHttpUrl: string,
): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  let url: URL;
  try {
    url = new URL(normalizedHttpUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  if (url.username || url.password) return false;
  if (url.origin === new URL(window.location.href).origin) return true;

  const host = url.hostname;
  if (isTrustedExternalHost(host)) return true;

  const siteKey = externalLinkAcknowledgmentKey(host);
  if (!siteKey) return false;
  if (readAcknowledgedKeys().has(siteKey)) return true;

  const ok = await requestAppConfirm({
    title: 'Leaving Echo',
    message: [
      `You are about to open a link to “${host}”.`,
      '',
      'Echo cannot verify that external sites are safe. Only continue if you trust this destination.',
    ].join('\n'),
    confirmLabel: 'Continue',
    cancelLabel: 'Cancel',
  });
  if (!ok) return false;
  rememberAcknowledgment(siteKey);
  return true;
}
