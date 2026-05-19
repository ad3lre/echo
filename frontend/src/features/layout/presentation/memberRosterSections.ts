import {
  getRolesForMember,
  pickHighestMemberRole,
  type MemberRole,
  type DisplayUser,
} from '@/utils/memberProfiles';
import { selectPresence } from '@/services/domain/presence';

export type MemberListEntry = {
  id: string;
  name: string;
  pfp: string;
  status?: string;
  customStatus?: string;
  isDiscordShadow?: boolean;
  isGuest?: boolean;
  highestRole: MemberRole;
};

export type MemberListSection = {
  id: string;
  name: string;
  count: number;
  members: MemberListEntry[];
  role: MemberRole;
};

/**
 * Presentation logic for Workspace Member Roster.
 * Authority: View Logic (Grouping/Ordering for Rendering).
 */
export const MemberRosterSections = {
  /**
   * Normalize raw user data into MemberListEntry.
   * Authority: Normalization.
   */
  normalizeMember(
    user: DisplayUser,
    serverId: string,
    roleOverrides?: Record<string, Record<string, MemberRole[]>>,
    resolveHighestRole?: (userId: string) => MemberRole,
  ): MemberListEntry {
    const highestRole =
      resolveHighestRole?.(user.id) ??
      pickHighestMemberRole(
        getRolesForMember(serverId, user.id, roleOverrides),
      );
    return {
      id: user.id,
      name: user.name,
      pfp: user.pfp,
      status: selectPresence({ rowStatus: user.status }).status,
      customStatus: user.customStatus,
      isDiscordShadow: user.isDiscordShadow,
      isGuest: user.isGuest,
      highestRole,
    };
  },

  /**
   * Partition and sort members into sections based on highest role.
   * Authority: Ordering/Grouping.
   */
  buildSections(
    members: MemberListEntry[],
    serverId: string,
    options?: { echoMemberSectionOrdering?: boolean },
  ): MemberListSection[] {
    const sectionMap = new Map<string, MemberListEntry[]>();

    for (const member of members) {
      const sectionId = member.highestRole.id;
      if (!sectionMap.has(sectionId)) sectionMap.set(sectionId, []);
      sectionMap.get(sectionId)!.push(member);
    }

    const sections: MemberListSection[] = [];
    for (const [id, mbs] of sectionMap.entries()) {
      const highestRole = mbs[0]!.highestRole;
      sections.push({
        id,
        name: highestRole.name,
        count: mbs.length,
        members: [...mbs].sort((a, b) => {
          const aStatus = selectPresence({ rowStatus: a.status }).sortOrder;
          const bStatus = selectPresence({ rowStatus: b.status }).sortOrder;
          if (aStatus !== bStatus) return aStatus - bStatus;
          return a.name.localeCompare(b.name);
        }),
        role: highestRole,
      });
    }

    // Sort sections by role hierarchy (using role name for mock hierarchy)
    const ROLE_ORDER = [
      'Founder',
      'Admin',
      'Council',
      'Captain',
      'Core Dev',
      'Lead Driver',
      'Host',
      'Moderator',
      'Security',
      'Comms',
      'Events',
      'Builder',
      'Night Owl',
      'Scout',
      'Pit Crew',
      'Telemetry',
      'Vibes',
      'Helper',
      'Fast Fingers',
      'Practice Crew',
      'OG',
      'Regular',
      'You',
      'Member',
      'Direct Contact',
    ];

    const isBottom = (r: MemberRole): boolean =>
      !!r.isUnhoistedBucket || r.id === '__echo_unhoisted__';

    return sections.sort((a, b) => {
      const roleA = a.members[0]!.highestRole;
      const roleB = b.members[0]!.highestRole;

      const ua = isBottom(roleA);
      const ub = isBottom(roleB);
      if (ua !== ub) return ua ? 1 : -1;

      if (options?.echoMemberSectionOrdering) {
        const ka = roleA.listSortKey ?? 0;
        const kb = roleB.listSortKey ?? 0;
        if (kb !== ka) return kb - ka;
        return roleA.id.localeCompare(roleB.id);
      }

      let idxA = ROLE_ORDER.indexOf(roleA.name);
      let idxB = ROLE_ORDER.indexOf(roleB.name);
      if (idxA === -1) idxA = ROLE_ORDER.length;
      if (idxB === -1) idxB = ROLE_ORDER.length;
      return idxA - idxB;
    });
  },
};
