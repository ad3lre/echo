import type { EchoServerMemberDto } from '@/api/echo/types';
import {
  deriveTimeoutUntilByServerUser,
  mergeEchoWorkspaceMembersIntoUsers,
} from '@/services/domain/workspaceEchoApiSnapshot';

/**
 * Single client policy for applying a workspace `membersByServer` snapshot:
 * upsert roster rows (API merge, then local profile overlay), plus derived moderation timeouts.
 */
export function applyWorkspaceMembersToRoster<
  T extends {
    id: string;
    name: string;
    pfp: string;
    status?: string;
    isDiscordShadow?: boolean;
    isGuest?: boolean;
    badges?: string[];
    bannerImage?: string;
    bannerColor?: string;
    bannerRefractionEnabled?: boolean;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
    bannerPositionY?: number;
    bio?: string;
  },
>(
  existingUsers: T[],
  membersByServer: Record<string, EchoServerMemberDto[]>,
): {
  users: T[];
  timeoutUntilByServerUser: Record<string, Record<string, number>>;
} {
  return {
    users: mergeEchoWorkspaceMembersIntoUsers(existingUsers, membersByServer),
    timeoutUntilByServerUser: deriveTimeoutUntilByServerUser(membersByServer),
  };
}
