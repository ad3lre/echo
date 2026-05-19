import { sessionUserDisplayName } from '@/utils/memberProfiles';
import type { MockData } from '@/composables/workspace/types';

export type WorkspaceRosterUserRow = MockData['users'][number];

/** Fields read from `authSession.backendUser` when upserting self into workspace roster. */
export type AuthBackendUserForRoster = {
  id: string;
  displayName?: string;
  username: string;
  pfp?: string;
  status?: string;
  customStatus?: string;
  bio?: string;
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  badges?: string[];
  timeZone?: string | null;
};

/**
 * Ensures the signed-in user exists in `users` with profile fields aligned to auth API state.
 * Returns `null` when there is no auth user (caller leaves `users` unchanged).
 * NOTE: Local profile overrides are applied by the caller (roster apply pipeline).
 */
export function mergeAuthUserIntoWorkspaceRoster(
  users: readonly WorkspaceRosterUserRow[],
  u: AuthBackendUserForRoster | null | undefined,
): WorkspaceRosterUserRow[] | null {
  if (!u) return null;
  const row = {
    id: u.id,
    name: sessionUserDisplayName(u.displayName, u.username),
    username: u.username,
    pfp: u.pfp ?? '',
    status: u.status ?? '',
    customStatus: u.customStatus,
    bio: u.bio,
    bannerImage: u.bannerImage,
    bannerColor: u.bannerColor,
    bannerRefractionEnabled: u.bannerRefractionEnabled,
    bannerBlurEnabled: u.bannerBlurEnabled,
    bannerBlackoutEnabled: u.bannerBlackoutEnabled,
    ...(Array.isArray(u.badges) && u.badges.length
      ? {
          badges: u.badges.filter(
            (b): b is string => typeof b === 'string' && b.trim().length > 0,
          ),
        }
      : {}),
    ...(u.timeZone !== undefined ? { timeZone: u.timeZone ?? null } : {}),
  };
  if (!users.some((x) => x.id === u.id)) {
    return [row, ...users];
  }
  return users.map((x) => (x.id === u.id ? { ...x, ...row } : x));
}
