import type { EchoUserPublicProfileFromApi } from '@/api/echo/social';
import type { EchoServerMemberDto } from '@/api/echo/types';
import {
  applyWorkspaceRosterUsersPipeline,
  type WorkspaceRosterUserRow,
} from '@/features/layout/echoWorkspace/workspaceRoster';
import { ECHO_PEER_HYDRATE_SERVER_KEY } from '@/features/dm/mergeEchoResolvedPeersIntoWorkspace';

function profileDetailToMemberDto(
  profile: EchoUserPublicProfileFromApi,
): EchoServerMemberDto {
  return {
    userId: profile.id,
    name: profile.name,
    accountDisplayName: profile.name,
    pfp: profile.pfp ?? '',
    ...(profile.username ? { username: profile.username } : {}),
    ...(Array.isArray(profile.badges) && profile.badges.length
      ? { badges: profile.badges }
      : {}),
    bio: typeof profile.bio === 'string' ? profile.bio.trim() : '',
    bannerImage:
      typeof profile.bannerImage === 'string' ? profile.bannerImage.trim() : '',
    bannerColor:
      typeof profile.bannerColor === 'string' ? profile.bannerColor.trim() : '',
    bannerRefractionEnabled: profile.bannerRefractionEnabled === true,
    bannerBlurEnabled: profile.bannerBlurEnabled === true,
    bannerBlackoutEnabled: profile.bannerBlackoutEnabled === true,
    ...(typeof profile.bannerPositionY === 'number' &&
    Number.isFinite(profile.bannerPositionY)
      ? {
          bannerPositionY: Math.max(0, Math.min(100, profile.bannerPositionY)),
        }
      : {}),
    timeZone: profile.timeZone ?? null,
  };
}

/** True when roster workspace already has bio or banner fields for profile UI. */
export function workspaceUserHasProfileDetail(
  user: WorkspaceRosterUserRow | undefined,
): boolean {
  if (!user) return false;
  const bio = typeof user.bio === 'string' ? user.bio.trim() : '';
  if (bio.length > 0) return true;
  const bi =
    typeof user.bannerImage === 'string' ? user.bannerImage.trim() : '';
  if (bi.length > 0) return true;
  const bc =
    typeof user.bannerColor === 'string' ? user.bannerColor.trim() : '';
  return bc.length > 0;
}

export function mergeEchoUserProfileDetailIntoWorkspaceUsers(
  users: readonly WorkspaceRosterUserRow[],
  profile: EchoUserPublicProfileFromApi,
): WorkspaceRosterUserRow[] {
  const member = profileDetailToMemberDto(profile);
  return applyWorkspaceRosterUsersPipeline(users, {
    membersByServer: { [ECHO_PEER_HYDRATE_SERVER_KEY]: [member] },
  });
}
