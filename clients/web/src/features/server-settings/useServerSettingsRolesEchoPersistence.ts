import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import {
  createEchoRoleApi,
  deleteEchoRoleApi,
  patchEchoRole,
  putEchoRoleLinks,
  putEchoServerRoleOrder,
  putEchoRoleCategoryOrder,
  type EchoRolePatch,
} from '@/api/echoClient';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';
import { mergeRoleUiPermissionsWithStoredEcho } from '@shared/rolePermissionBridge';
import {
  ROLE_PERMISSION_DEFS,
  ECHO_SERVER_SETTINGS_ROLE_PERMISSION_KEYS,
} from '@/features/server-settings/types';
import type {
  ManagedRole,
  ManagedRoleLink,
} from '@/features/server-settings/types';
import type { EchoRoleCategoryDto } from '@/api/echo/types';

import { fetchManagedRolesFromEcho } from '@/features/server-settings/fetchManagedRolesFromEcho';
import {
  cloneRoleManagerState,
  mergeEchoRoleListPreservingLocalEdits,
} from '@/features/server-settings/domain/roleManagerState';
import { isPinnedBottomEchoRole } from '@shared/echoReservedRoles';

function displayedRoleOrderInCategory(
  roles: ManagedRole[],
  categoryId: string,
): string[] {
  return roles
    .filter(
      (r) => !isPinnedBottomEchoRole(r) && r.roleCategoryId === categoryId,
    )
    .map((r) => r.id);
}

function roleLinksSignature(links: ManagedRoleLink[]): string {
  return JSON.stringify(
    [...links].sort((a, b) => a.linkedRoleId.localeCompare(b.linkedRoleId)),
  );
}

export type RoleManagerEchoDeps = {
  accessToken: Ref<string | null | undefined>;
  serverId: Ref<string | undefined>;
  canManageRoles: Ref<boolean>;
  users: Ref<{ id: string; name: string; pfp: string; status?: string }[]>;
  roleManagerRoles: Ref<ManagedRole[]>;
  roleManagerInitialSnapshot: Ref<ManagedRole[]>;
  selectedRoleId: Ref<string | null>;
  roleEditorTab: Ref<'display' | 'permissions' | 'members'>;
  /** When creating a role on Echo, assign this category (from the active tab). */
  selectedRoleCategoryTabForCreate?: Ref<'all' | string>;
  initRoleManagerFromEcho: (roles: ManagedRole[]) => void;
  saveRoleManagerChangesCore: () => void;
  createRole: (name?: string) => void;
  resetPickerState: () => void;
  discardRoleManagerChangesCore: () => void;
  /** Keeps member popout / shell role catalog in sync after Echo role mutations (create, save). */
  onEchoRoleCatalogMutated?: () => void;
  /** Server settings role organizer tabs (Echo). */
  hydrateEchoRoleCategories?: (categories: EchoRoleCategoryDto[]) => void;
  markRoleCategoryOrderSnapshot?: () => void;
  roleCategoryOrderDirty?: Ref<boolean>;
  echoRoleCategories?: Ref<EchoRoleCategoryDto[]>;
  selectedRoleCategoryTabId?: Ref<'all' | string>;
};

export function useServerSettingsRolesEchoPersistence(
  deps: RoleManagerEchoDeps,
) {
  const roleMenuOpen = ref(false);
  const roleSaveLoading = ref(false);
  const roleSaveError = ref('');

  const echoRolesLocked = computed(() => {
    const sid = deps.serverId.value;
    if (!sid || !isEchoGraphId(sid)) return false;
    return !deps.canManageRoles.value;
  });

  const visibleRolePermissionDefsForServer = computed(() =>
    deps.serverId.value && isEchoGraphId(deps.serverId.value)
      ? ROLE_PERMISSION_DEFS.filter((d) =>
          ECHO_SERVER_SETTINGS_ROLE_PERMISSION_KEYS.includes(d.key),
        )
      : ROLE_PERMISSION_DEFS,
  );

  async function createRoleWrapped(name?: string) {
    const sid = deps.serverId.value;
    const token = deps.accessToken.value;
    const forced =
      typeof name === 'string' && name.trim() ? name.trim() : undefined;
    if (sid && isEchoGraphId(sid)) {
      try {
        const createName =
          forced ?? `New Role ${deps.roleManagerRoles.value.length + 1}`;
        const tabCat = deps.selectedRoleCategoryTabForCreate?.value;
        const { roleId } = await createEchoRoleApi(token ?? '', sid, {
          name: createName,
          color: '',
          ...(tabCat && tabCat !== 'all'
            ? { roleCategoryId: tabCat, syncWithCategoryDefaults: true }
            : { permissions: [] }),
        });
        const freshBundle = await fetchManagedRolesFromEcho(
          token ?? '',
          sid,
          deps.users.value,
        );
        deps.hydrateEchoRoleCategories?.(freshBundle.roleCategories);
        deps.markRoleCategoryOrderSnapshot?.();
        const { merged, nextSnapshot } = mergeEchoRoleListPreservingLocalEdits({
          fresh: freshBundle.managedRoles,
          local: deps.roleManagerRoles.value,
          snapshot: deps.roleManagerInitialSnapshot.value,
        });
        deps.roleManagerInitialSnapshot.value = nextSnapshot;
        deps.roleManagerRoles.value = merged;
        deps.selectedRoleId.value = roleId;
        deps.roleEditorTab.value = 'display';
        deps.onEchoRoleCatalogMutated?.();
        return;
      } catch {
        // fallback to local create
      }
    }
    deps.createRole(forced);
  }

  async function saveRoleManagerChanges() {
    const sid = deps.serverId.value;
    const token = deps.accessToken.value;
    if (sid && isEchoGraphId(sid)) {
      roleSaveLoading.value = true;
      roleSaveError.value = '';
      try {
        const prevSelectedRoleId = deps.selectedRoleId.value;
        const prevRoleEditorTab = deps.roleEditorTab.value;

        const snapshot = deps.roleManagerInitialSnapshot.value;
        const current = deps.roleManagerRoles.value;
        const currentIds = new Set(current.map((r) => r.id));
        for (const removed of snapshot) {
          if (currentIds.has(removed.id)) continue;
          if (isPinnedBottomEchoRole(removed)) continue;
          try {
            await deleteEchoRoleApi(token ?? '', sid, removed.id);
          } catch (e) {
            const msg =
              e instanceof Error ? e.message : 'Failed to delete role';
            roleSaveError.value = `Failed to delete "${removed.name}": ${msg}`;
          }
        }

        if (deps.roleCategoryOrderDirty?.value) {
          try {
            await putEchoRoleCategoryOrder(
              token ?? '',
              sid,
              deps.echoRoleCategories?.value.map((c) => c.id) ?? [],
            );
            deps.markRoleCategoryOrderSnapshot?.();
          } catch (e) {
            const msg =
              e instanceof Error ? e.message : 'Failed to save category order';
            roleSaveError.value = msg;
          }
        }

        const activeTab = deps.selectedRoleCategoryTabId?.value;
        const categoryTab =
          activeTab && activeTab !== 'all' ? activeTab : undefined;
        const prevOrder = snapshot.map((r) => r.id);
        const curOrder = categoryTab
          ? displayedRoleOrderInCategory(current, categoryTab)
          : current.map((r) => r.id);
        const prevOrderInScope = categoryTab
          ? displayedRoleOrderInCategory(snapshot, categoryTab)
          : prevOrder;
        const orderChanged =
          prevOrderInScope.length !== curOrder.length ||
          prevOrderInScope.some((id, i) => curOrder[i] !== id);
        if (orderChanged) {
          try {
            await putEchoServerRoleOrder(token ?? '', sid, curOrder, {
              categoryId: categoryTab,
            });
          } catch (e) {
            const msg =
              e instanceof Error ? e.message : 'Failed to save role order';
            roleSaveError.value = msg;
          }
        }

        for (const role of deps.roleManagerRoles.value) {
          const initial = deps.roleManagerInitialSnapshot.value.find(
            (r) => r.id === role.id,
          );
          if (!initial) continue;
          const storedEcho = initial.storedEchoPermissions ?? [];
          const nextEcho = mergeRoleUiPermissionsWithStoredEcho(
            role.permissions as Record<string, boolean>,
            storedEcho,
          );
          const prevEcho = mergeRoleUiPermissionsWithStoredEcho(
            initial.permissions as Record<string, boolean>,
            storedEcho,
          );
          const permsChanged =
            JSON.stringify([...nextEcho].sort()) !==
            JSON.stringify([...prevEcho].sort());
          const nameChanged = role.name !== initial.name;
          const colorChanged = role.color !== initial.color;
          const darkColorChanged = role.darkColor !== initial.darkColor;
          const lightColorChanged = role.lightColor !== initial.lightColor;
          const separateThemeColorsChanged =
            role.separateThemeColors !== initial.separateThemeColors;
          const hoistChanged =
            role.displaySeparately !== initial.displaySeparately;
          const defaultOnJoinChanged =
            role.defaultOnJoin !== initial.defaultOnJoin;
          const roleCategoryChanged =
            role.roleCategoryId !== initial.roleCategoryId;
          const roleIconUrlChanged = role.roleIconUrl !== initial.roleIconUrl;
          const roleIconEmojiIdChanged =
            role.roleIconEmojiId !== initial.roleIconEmojiId;
          const roleTypeChanged = role.roleType !== initial.roleType;
          const roleScopeChanged = role.roleScope !== initial.roleScope;
          const syncWithCategoryDefaultsChanged =
            role.syncWithCategoryDefaults !== initial.syncWithCategoryDefaults;
          if (
            !permsChanged &&
            !nameChanged &&
            !colorChanged &&
            !darkColorChanged &&
            !lightColorChanged &&
            !separateThemeColorsChanged &&
            !hoistChanged &&
            !defaultOnJoinChanged &&
            !roleCategoryChanged &&
            !roleScopeChanged &&
            !roleIconUrlChanged &&
            !roleIconEmojiIdChanged &&
            !roleTypeChanged &&
            !syncWithCategoryDefaultsChanged
          )
            continue;

          const patch: EchoRolePatch = {};
          if (nameChanged) patch.name = role.name;
          if (colorChanged) patch.color = role.color;
          if (darkColorChanged) patch.darkColor = role.darkColor;
          if (lightColorChanged) patch.lightColor = role.lightColor;
          if (separateThemeColorsChanged)
            patch.separateThemeColors = role.separateThemeColors;
          if (hoistChanged) patch.hoist = role.displaySeparately;
          if (defaultOnJoinChanged) patch.defaultOnJoin = role.defaultOnJoin;
          if (permsChanged) patch.permissions = nextEcho;
          if (roleCategoryChanged) patch.roleCategoryId = role.roleCategoryId;
          if (roleScopeChanged) patch.roleScope = role.roleScope;
          if (syncWithCategoryDefaultsChanged) {
            patch.syncWithCategoryDefaults = role.syncWithCategoryDefaults;
          }
          if (
            roleCategoryChanged &&
            role.syncWithCategoryDefaults &&
            deps.echoRoleCategories?.value
          ) {
            patch.syncWithCategoryDefaults = true;
          }
          if (roleIconUrlChanged || roleIconEmojiIdChanged) {
            patch.roleIconUrl = role.roleIconUrl ?? null;
            patch.roleIconEmojiId = role.roleIconEmojiId ?? null;
          }
          if (roleTypeChanged) patch.roleType = role.roleType;

          try {
            await patchEchoRole(token ?? '', sid, role.id, patch);
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to save role';
            roleSaveError.value = `Failed to save "${role.name}": ${msg}`;
          }
        }

        for (const role of deps.roleManagerRoles.value) {
          const initial = deps.roleManagerInitialSnapshot.value.find(
            (r) => r.id === role.id,
          );
          if (!initial) continue;
          if (
            roleLinksSignature(role.linkedRoles) ===
            roleLinksSignature(initial.linkedRoles)
          )
            continue;
          try {
            await putEchoRoleLinks(token ?? '', sid, role.id, role.linkedRoles);
          } catch (e) {
            const msg =
              e instanceof Error ? e.message : 'Failed to save role links';
            roleSaveError.value = `Failed to save links for "${role.name}": ${msg}`;
          }
        }

        try {
          const bundle = await fetchManagedRolesFromEcho(
            token ?? '',
            sid,
            deps.users.value,
          );
          deps.hydrateEchoRoleCategories?.(bundle.roleCategories);
          deps.markRoleCategoryOrderSnapshot?.();
          deps.initRoleManagerFromEcho(bundle.managedRoles);
          deps.onEchoRoleCatalogMutated?.();
          if (
            prevSelectedRoleId &&
            deps.roleManagerRoles.value.some((r) => r.id === prevSelectedRoleId)
          ) {
            deps.selectedRoleId.value = prevSelectedRoleId;
          }
          deps.roleEditorTab.value = prevRoleEditorTab ?? 'display';
        } catch {
          deps.saveRoleManagerChangesCore();
        }
      } finally {
        roleSaveLoading.value = false;
      }
      return;
    }
    deps.saveRoleManagerChangesCore();
  }

  function closeRoleMenu() {
    roleMenuOpen.value = false;
  }

  function discardRoleManagerChanges() {
    deps.discardRoleManagerChangesCore();
    roleMenuOpen.value = false;
    deps.resetPickerState();
  }

  watch(deps.selectedRoleId, () => {
    roleMenuOpen.value = false;
  });

  watch(roleMenuOpen, (open) => {
    if (open) {
      setTimeout(() => window.addEventListener('click', closeRoleMenu), 0);
    } else {
      window.removeEventListener('click', closeRoleMenu);
    }
  });

  onBeforeUnmount(() => {
    window.removeEventListener('click', closeRoleMenu);
  });

  return {
    roleMenuOpen,
    roleSaveLoading,
    roleSaveError,
    echoRolesLocked,
    visibleRolePermissionDefsForServer,
    createRoleWrapped,
    saveRoleManagerChanges,
    discardRoleManagerChanges,
  };
}
