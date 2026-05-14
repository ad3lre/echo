import {
  createEchoRoleApi,
  patchEchoRole,
  putEchoRoleLinks,
  putEchoServerRoleOrder,
  type EchoRolePatch,
} from '@/api/echoClient';
import type { ManagedRole } from '@/features/server-settings/types';
import { isEchoGraphId } from '@/utils/echoIds';
import { fetchManagedRolesFromEcho } from '@/services/orchestration/fetchManagedRolesFromEcho';
import {
  calculateRoleDiff,
  calculateRoleLinksDiff,
  calculateRoleOrderDiff,
  mergeEchoRoleListPreservingLocalEdits,
} from '@/features/server-settings/domain/roleManagerState';

export type RoleManagerEchoControllerDeps = {
  accessToken: string | null | undefined;
  serverId: string | undefined;
  users: { id: string; name: string; pfp: string; status?: string }[];
  roleManagerRoles: ManagedRole[];
  roleManagerInitialSnapshot: ManagedRole[];
  selectedRoleId: string | null;
  roleEditorTab: 'display' | 'permissions' | 'members';
  initRoleManagerFromEcho: (roles: ManagedRole[]) => void;
  saveRoleManagerChangesCore: () => void;
  createRole: (name?: string) => void;
  /** Keeps member popout / shell role catalog in sync after Echo role mutations (create, save). */
  onEchoRoleCatalogMutated?: () => void;
  updateRoleModelState: (patch: {
    roleManagerRoles?: ManagedRole[];
    roleManagerInitialSnapshot?: ManagedRole[];
    selectedRoleId?: string | null;
    roleEditorTab?: 'display' | 'permissions' | 'members';
  }) => void;
};

export async function createRoleWrapped(
  deps: RoleManagerEchoControllerDeps,
  name?: string,
) {
  const sid = deps.serverId;
  const token = deps.accessToken;
  const forced =
    typeof name === 'string' && name.trim() ? name.trim() : undefined;
  if (sid && isEchoGraphId(sid)) {
    try {
      const createName =
        forced ?? `New Role ${deps.roleManagerRoles.length + 1}`;
      const { roleId } = await createEchoRoleApi(token ?? '', sid, {
        name: createName,
        color: '',
        permissions: [],
      });
      const freshBundle = await fetchManagedRolesFromEcho(
        token ?? '',
        sid,
        deps.users,
      );
      const { merged, nextSnapshot } = mergeEchoRoleListPreservingLocalEdits({
        fresh: freshBundle.managedRoles,
        local: deps.roleManagerRoles,
        snapshot: deps.roleManagerInitialSnapshot,
      });

      deps.updateRoleModelState({
        roleManagerInitialSnapshot: nextSnapshot,
        roleManagerRoles: merged,
        selectedRoleId: roleId,
        roleEditorTab: 'display',
      });
      deps.onEchoRoleCatalogMutated?.();
      return;
    } catch {
      // fallback to local create
    }
  }
  deps.createRole(forced);
}

export async function saveRoleManagerChanges(
  deps: RoleManagerEchoControllerDeps,
): Promise<{ error?: string }> {
  const sid = deps.serverId;
  const token = deps.accessToken;
  if (sid && isEchoGraphId(sid)) {
    try {
      const prevSelectedRoleId = deps.selectedRoleId;
      const prevRoleEditorTab = deps.roleEditorTab;

      const curOrder = calculateRoleOrderDiff(
        deps.roleManagerInitialSnapshot,
        deps.roleManagerRoles,
      );
      if (curOrder) {
        try {
          await putEchoServerRoleOrder(token ?? '', sid, curOrder);
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : 'Failed to save role order',
          };
        }
      }

      for (const role of deps.roleManagerRoles) {
        const initial = deps.roleManagerInitialSnapshot.find(
          (r) => r.id === role.id,
        );
        if (!initial) continue;

        const patch = calculateRoleDiff(initial, role);
        if (!patch) continue;

        try {
          await patchEchoRole(token ?? '', sid, role.id, patch);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to save role';
          return { error: `Failed to save "${role.name}": ${msg}` };
        }
      }

      for (const role of deps.roleManagerRoles) {
        const initial = deps.roleManagerInitialSnapshot.find(
          (r) => r.id === role.id,
        );
        if (!initial) continue;
        const linksToSave = calculateRoleLinksDiff(initial, role);
        if (!linksToSave) continue;
        try {
          await putEchoRoleLinks(token ?? '', sid, role.id, linksToSave);
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : 'Failed to save role links';
          return { error: `Failed to save links for "${role.name}": ${msg}` };
        }
      }

      try {
        const bundle = await fetchManagedRolesFromEcho(
          token ?? '',
          sid,
          deps.users,
        );
        deps.initRoleManagerFromEcho(bundle.managedRoles);
        deps.onEchoRoleCatalogMutated?.();

        const patchState: any = {
          roleEditorTab: prevRoleEditorTab ?? 'display',
        };
        if (
          prevSelectedRoleId &&
          deps.roleManagerRoles.some((r) => r.id === prevSelectedRoleId)
        ) {
          patchState.selectedRoleId = prevSelectedRoleId;
        }
        deps.updateRoleModelState(patchState);
      } catch {
        deps.saveRoleManagerChangesCore();
      }
    } catch {
      // General overarching failure
    }
    return {};
  }
  deps.saveRoleManagerChangesCore();
  return {};
}
