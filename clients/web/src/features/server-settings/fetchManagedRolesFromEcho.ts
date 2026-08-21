import {
  fetchEchoMemberRoleAssignments,
  fetchEchoRoleCategories,
  fetchEchoRoleLinks,
  fetchEchoServerRoleList,
} from '@/api/echoClient';
import type { EchoRoleCategoryDto } from '@/api/echo/types';
import { buildManagedRolesFromEcho } from '@/features/server-settings/domain/roleManagerState';
import type { ManagedRole } from '@/features/server-settings/types';

type ServerSettingsRoleBootstrapUser = {
  id: string;
  name: string;
  pfp: string;
  status?: string;
};

export async function fetchManagedRolesFromEcho(
  token: string,
  serverId: string,
  users: ServerSettingsRoleBootstrapUser[],
): Promise<{
  managedRoles: ManagedRole[];
  roleCategories: EchoRoleCategoryDto[];
  memberAssignments: Record<string, string[]>;
}> {
  const [{ roles }, { assignments }, { roleLinks }, { categories }] =
    await Promise.all([
      fetchEchoServerRoleList(token, serverId),
      fetchEchoMemberRoleAssignments(token, serverId),
      fetchEchoRoleLinks(token, serverId),
      fetchEchoRoleCategories(token, serverId),
    ]);

  return {
    managedRoles: buildManagedRolesFromEcho(
      roles,
      assignments,
      users,
      roleLinks,
    ),
    roleCategories: categories,
    memberAssignments: assignments,
  };
}
