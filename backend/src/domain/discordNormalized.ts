/**
 * Echo-owned normalized Discord profile (versioned JSON in `auth_discord_user_links.discord_normalized_jsonb`).
 * Do not expose raw Discord API shapes to clients.
 */
export type DiscordNormalizedV1 = {
  v: 1;
  discordUserId: string;
  username: string;
  globalName: string | null;
  bio: string | null;
  avatarHash: string | null;
  avatarUrl: string | null;
  bannerHash: string | null;
  bannerUrl: string | null;
  emailPresent: boolean;
  /** From identify + optional enhancement; null when unknown or not granted. */
  premiumType: number | null;
  guildCount: number | null;
  connectionsCount: number | null;
};

export type DiscordMeApi = {
  id: string;
  username: string;
  global_name?: string | null;
  bio?: string | null;
  avatar?: string | null;
  /** Profile banner image hash (Discord CDN). */
  banner?: string | null;
  email?: string | null;
  verified?: boolean;
  premium_type?: number | null;
};

export function discordAvatarUrl(
  discordUserId: string,
  avatarHash: string | null,
): string | null {
  if (!avatarHash) return null;
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'webp';
  return `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.${ext}?size=128`;
}

/**
 * Extract the Discord avatar asset id (e.g. `a_…` or hex hash) from a `cdn.discordapp.com`
 * avatars URL when it matches `discordUserId`. Used to re-canonicalize stored URLs and to
 * detect avatar changes without relying on brittle query-string equality.
 */
export function parseDiscordAvatarHashFromCdnUrl(
  discordUserId: string,
  url: string,
): string | null {
  const id = String(discordUserId).trim();
  if (!id) return null;
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (!/^cdn\.discordapp\.com$/i.test(parsed.hostname)) return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 3 || parts[0] !== 'avatars') return null;
  if (parts[1] !== id) return null;
  const file = parts[2] ?? '';
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return null;
  const hash = file.slice(0, dot).trim();
  return hash || null;
}

/**
 * Stable key for comparing “same Discord avatar” across hash-only storage, CDN URLs, and
 * default embed avatars (ignores `?size=` and other query params).
 */
export function discordAvatarIdentityKey(
  discordUserId: string,
  pfp: string | null | undefined,
): string {
  const id = String(discordUserId).trim();
  const s = typeof pfp === 'string' ? pfp.trim() : '';
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) {
    return `avatar:${s}`;
  }
  try {
    const u = new URL(s);
    if (!/^cdn\.discordapp\.com$/i.test(u.hostname)) {
      return `raw:${s}`;
    }
    const embed = u.pathname.match(/^\/embed\/avatars\/(\d+)\.(?:png|webp)$/i);
    if (embed?.[1]) {
      return `embed:${embed[1]}`;
    }
    const h = id ? parseDiscordAvatarHashFromCdnUrl(id, s) : null;
    if (h) return `avatar:${h}`;
    return `raw:${s}`;
  } catch {
    return `raw:${s}`;
  }
}

const DEFAULT_DISCORD_EMBED_AVATAR_COUNT = 6;

/** Discord default avatar when the user has no custom avatar (snowflake → index). */
export function discordDefaultAvatarUrl(discordUserId: string): string {
  const id = String(discordUserId).trim();
  if (!id) return 'https://cdn.discordapp.com/embed/avatars/0.png';
  try {
    const n = BigInt(id);
    const idx = Number((n >> 22n) % BigInt(DEFAULT_DISCORD_EMBED_AVATAR_COUNT));
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  } catch {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

/**
 * Turn Discord API `user.avatar` (hash or null) or an already-resolved CDN URL into a value
 * suitable for `auth_users.pfp` / message `authorAvatar` (always https URL when possible).
 */
export function resolveDiscordAvatarForStorage(
  discordUserId: string,
  avatar: string | null | undefined,
): string {
  const id = String(discordUserId).trim();
  if (!id) return '';
  const a = typeof avatar === 'string' ? avatar.trim() : '';
  if (!a) {
    return discordDefaultAvatarUrl(id);
  }
  if (/^https?:\/\//i.test(a)) {
    const fromCdn = parseDiscordAvatarHashFromCdnUrl(id, a);
    if (fromCdn) {
      return discordAvatarUrl(id, fromCdn) ?? discordDefaultAvatarUrl(id);
    }
    return a;
  }
  return discordAvatarUrl(id, a) ?? discordDefaultAvatarUrl(id);
}

export function discordBannerUrl(
  discordUserId: string,
  bannerHash: string | null,
): string | null {
  if (!bannerHash) return null;
  const ext = bannerHash.startsWith('a_') ? 'gif' : 'webp';
  return `https://cdn.discordapp.com/banners/${discordUserId}/${bannerHash}.${ext}?size=600`;
}

export function mapDiscordUserToNormalized(
  me: DiscordMeApi,
): DiscordNormalizedV1 {
  const avatarHash = me.avatar ?? null;
  const bannerHash = me.banner ?? null;
  const discordUserId = String(me.id);
  return {
    v: 1,
    discordUserId,
    username: String(me.username ?? ''),
    globalName:
      me.global_name != null && me.global_name !== ''
        ? String(me.global_name)
        : null,
    bio: me.bio != null && me.bio !== '' ? String(me.bio) : null,
    avatarHash,
    avatarUrl: discordAvatarUrl(discordUserId, avatarHash),
    bannerHash,
    bannerUrl: discordBannerUrl(discordUserId, bannerHash),
    emailPresent: typeof me.email === 'string' && me.email.trim() !== '',
    premiumType: typeof me.premium_type === 'number' ? me.premium_type : null,
    guildCount: null,
    connectionsCount: null,
  };
}

export function parseDiscordNormalizedJson(
  raw: unknown,
): DiscordNormalizedV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.discordUserId !== 'string' || typeof o.username !== 'string')
    return null;
  const discordUserId = o.discordUserId;
  const bio = typeof o.bio === 'string' ? o.bio : null;
  const bannerHash = typeof o.bannerHash === 'string' ? o.bannerHash : null;
  const bannerUrl =
    typeof o.bannerUrl === 'string'
      ? o.bannerUrl
      : discordBannerUrl(discordUserId, bannerHash);
  return {
    ...(o as unknown as DiscordNormalizedV1),
    bio,
    bannerHash,
    bannerUrl,
  };
}
