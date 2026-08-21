import { normalizeProfileBannerColor } from '@shared/profileBannerColor';

const STORAGE_KEY = 'echo_local_profile_v1';

export type LocalProfilePatch = {
  pfp?: string;
  bio?: string;
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  bannerPositionY?: number;
  customStatus?: string;
};

export function loadLocalProfileMap(): Record<string, LocalProfilePatch> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, LocalProfilePatch>;
  } catch {
    return {};
  }
}

export function saveLocalProfile(
  userId: string,
  patch: LocalProfilePatch,
): void {
  if (typeof localStorage === 'undefined' || !userId) return;
  try {
    const all = loadLocalProfileMap();
    all[userId] = { ...all[userId], ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Align stored local profile with the auth API user so `mergeLocalProfileIntoUser` does not
 * resurrect stale `bannerRefractionEnabled` / banner fields after PATCH or refresh.
 */
export function overwriteLocalProfileFromAuthUser(user: {
  id: string;
  pfp: string;
  bio?: string;
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  bannerPositionY?: number;
  customStatus?: string | null;
}): void {
  const customStatusNormalized =
    user.customStatus !== undefined && user.customStatus !== null
      ? String(user.customStatus).slice(0, 140)
      : '';
  saveLocalProfile(user.id, {
    pfp: user.pfp,
    ...(user.bio !== undefined ? { bio: user.bio } : {}),
    bannerImage: user.bannerImage,
    bannerColor:
      user.bannerColor !== undefined
        ? normalizeProfileBannerColor(user.bannerColor)
        : user.bannerColor,
    bannerRefractionEnabled: user.bannerRefractionEnabled ?? false,
    bannerBlurEnabled: user.bannerBlurEnabled ?? false,
    bannerBlackoutEnabled: user.bannerBlackoutEnabled ?? false,
    ...(typeof user.bannerPositionY === 'number'
      ? { bannerPositionY: user.bannerPositionY }
      : {}),
    customStatus: customStatusNormalized,
  });
}

/** Merge stored overrides into a user row (mock / offline). */
export function mergeLocalProfileIntoUser<T extends { id: string }>(
  user: T,
): T {
  const map = loadLocalProfileMap();
  const o = map[user.id];
  if (!o) return user;
  return { ...user, ...o };
}

export function mergeLocalProfilesIntoUsers<T extends { id: string }>(
  users: T[],
): T[] {
  return users.map((u) => mergeLocalProfileIntoUser(u));
}
