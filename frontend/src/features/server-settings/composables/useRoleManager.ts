import { computed, ref, watch, type Ref } from 'vue';
import type {
  ManagedRole,
  RolePermissionKey,
} from '@/features/server-settings/types';
import type { EchoRoleType } from '@shared/echoRoleTypes';
import { ROLE_PERMISSION_DEFS } from '@/features/server-settings/types';
import { rolePermissionLabel } from '@/i18n/labels';
import {
  cloneRoleManagerState,
  buildInitialManagedRoles,
  createManagedRole,
  defaultRolePermissions,
} from '@/features/server-settings/domain/roleManagerState';
import {
  pinPinnedBottomEchoRoles,
  rolePosition as getRolePosition,
  setRolePosition as reorderToPosition,
  moveRoleToIndex as reorderToIndex,
} from '@/features/server-settings/roleManagerOrdering';
import { isPinnedBottomEchoRole } from '@shared/echoReservedRoles';

type RoleCard = { id: string; name: string; color: string; count: number };

export function useRoleManager(roleCards: Ref<RoleCard[]>) {
  const roleManagerRoles = ref<ManagedRole[]>([]);
  const roleManagerInitialSnapshot = ref<ManagedRole[]>([]);
  const selectedRoleId = ref<string>('');
  const hoveredRoleId = ref<string | null>(null);
  const draggingRoleId = ref<string | null>(null);
  const dragOverRoleId = ref<string | null>(null);
  const dragInsertAfter = ref(false);
  const roleManagerDirty = ref(false);
  const roleManagerSearchQuery = ref('');
  const newRoleName = ref('');
  const roleEditorTab = ref<'display' | 'permissions' | 'members'>('display');

  const selectedRole = computed(
    () =>
      roleManagerRoles.value.find((role) => role.id === selectedRoleId.value) ??
      null,
  );
  const filteredRoleManagerRoles = computed(() => {
    const query = roleManagerSearchQuery.value.trim().toLowerCase();
    if (!query) return roleManagerRoles.value;
    return roleManagerRoles.value.filter((role) =>
      role.name.toLowerCase().includes(query),
    );
  });
  const visibleRolePermissionDefs = computed(() =>
    ROLE_PERMISSION_DEFS.map((def) => ({
      ...def,
      label: rolePermissionLabel(def.key),
    })),
  );

  function resetRoleManagerUi() {
    newRoleName.value = '';
    roleEditorTab.value = 'display';
    hoveredRoleId.value = null;
    draggingRoleId.value = null;
    dragOverRoleId.value = null;
    dragInsertAfter.value = false;
    roleManagerSearchQuery.value = '';
  }

  function initRoleManager() {
    const mapped = pinPinnedBottomEchoRoles(
      buildInitialManagedRoles(roleCards.value),
    );
    const snap = cloneRoleManagerState(mapped);
    // Snapshot must be updated before `roleManagerRoles` so the deep watch does not
    // compare new roles against a stale snapshot and force `roleManagerDirty` true.
    roleManagerInitialSnapshot.value = snap;
    roleManagerRoles.value = mapped;
    roleManagerDirty.value = false;
    selectedRoleId.value = mapped[0]?.id ?? '';
    resetRoleManagerUi();
  }

  function initRoleManagerFromEcho(mapped: ManagedRole[]) {
    const ordered = pinPinnedBottomEchoRoles(mapped);
    const snap = cloneRoleManagerState(ordered);
    roleManagerInitialSnapshot.value = snap;
    roleManagerRoles.value = ordered;
    roleManagerDirty.value = false;
    selectedRoleId.value = mapped[0]?.id ?? '';
    resetRoleManagerUi();
  }

  function discardRoleManagerChanges() {
    const restored = cloneRoleManagerState(roleManagerInitialSnapshot.value);
    roleManagerRoles.value = restored;
    selectedRoleId.value = restored[0]?.id ?? '';
    roleManagerDirty.value = false;
  }

  function saveRoleManagerChanges() {
    roleManagerInitialSnapshot.value = cloneRoleManagerState(
      roleManagerRoles.value,
    );
    roleManagerDirty.value = false;
  }

  function rolePosition(roleId: string) {
    return getRolePosition(roleManagerRoles.value, roleId);
  }

  function setRolePosition(roleId: string, targetPosition: number) {
    const nextRoles = reorderToPosition(
      roleManagerRoles.value,
      roleId,
      targetPosition,
    );
    if (nextRoles === roleManagerRoles.value) return;
    roleManagerRoles.value = nextRoles;
    roleManagerDirty.value = true;
  }

  function moveRoleToIndex(roleId: string, targetIndex: number) {
    const nextRoles = reorderToIndex(
      roleManagerRoles.value,
      roleId,
      targetIndex,
    );
    if (nextRoles === roleManagerRoles.value) return;
    roleManagerRoles.value = nextRoles;
    roleManagerDirty.value = true;
  }

  function onRoleDragStart(roleId: string, event: DragEvent) {
    const role = roleManagerRoles.value.find((row) => row.id === roleId);
    if (role && isPinnedBottomEchoRole(role)) {
      event.preventDefault();
      return;
    }
    draggingRoleId.value = roleId;
    dragOverRoleId.value = roleId;
    dragInsertAfter.value = false;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', roleId);
    }
  }

  function onRoleDragOver(roleId: string, event: DragEvent) {
    if (!draggingRoleId.value || draggingRoleId.value === roleId) return;
    event.preventDefault();
    const row = event.currentTarget as HTMLElement | null;
    const rect = row?.getBoundingClientRect();
    const midpoint = rect ? rect.top + rect.height / 2 : 0;
    const after = (event.clientY || 0) > midpoint;
    dragOverRoleId.value = roleId;
    dragInsertAfter.value = after;

    const targetIndex = roleManagerRoles.value.findIndex(
      (role) => role.id === roleId,
    );
    if (targetIndex < 0) return;
    const liveIndex = after ? targetIndex + 1 : targetIndex;
    moveRoleToIndex(draggingRoleId.value, liveIndex);
  }

  function onRoleDrop() {
    draggingRoleId.value = null;
    dragOverRoleId.value = null;
    dragInsertAfter.value = false;
  }

  function onRoleDragEnd() {
    draggingRoleId.value = null;
    dragOverRoleId.value = null;
    dragInsertAfter.value = false;
  }

  function deleteRole(roleId: string) {
    roleManagerRoles.value = roleManagerRoles.value.filter(
      (role) => role.id !== roleId,
    );
    roleManagerDirty.value = true;
    if (selectedRoleId.value === roleId) {
      selectedRoleId.value = roleManagerRoles.value[0]?.id ?? '';
    }
  }

  function createRole(forcedName?: string) {
    const name = (forcedName ?? newRoleName.value).trim();
    if (!name) return;
    const role = createManagedRole(name);
    roleManagerRoles.value = [...roleManagerRoles.value, role];
    selectedRoleId.value = role.id;
    roleManagerDirty.value = true;
    roleEditorTab.value = 'display';
    newRoleName.value = '';
  }

  function updateSelectedRolePermission(
    key: RolePermissionKey,
    value: boolean,
  ) {
    if (!selectedRole.value) return;
    if (selectedRole.value.roleType !== 'mixed') return;
    if (key === 'administrator' && value) {
      for (const def of ROLE_PERMISSION_DEFS) {
        selectedRole.value.permissions[def.key] = true;
      }
    } else {
      selectedRole.value.permissions[key] = value;
      if (key !== 'administrator') {
        const allOtherEnabled = ROLE_PERMISSION_DEFS.filter(
          (def) => def.key !== 'administrator',
        ).every((def) => selectedRole.value!.permissions[def.key]);
        selectedRole.value.permissions.administrator = allOtherEnabled;
      }
    }
    if (key === 'mentionEveryone') {
      selectedRole.value.mentionable = value;
    }
    if (key === 'administrator' && value) {
      selectedRole.value.mentionable = true;
    }
    roleManagerDirty.value = true;
  }

  function setSelectedRoleDisplaySeparately(value: boolean) {
    if (!selectedRole.value) return;
    const rt = selectedRole.value.roleType;
    if (rt !== 'mixed' && rt !== 'visual') return;
    selectedRole.value.displaySeparately = value;
    roleManagerDirty.value = true;
  }

  function setSelectedRoleDefaultOnJoin(value: boolean) {
    if (!selectedRole.value) return;
    if (isPinnedBottomEchoRole(selectedRole.value)) return;
    const rt = selectedRole.value.roleType;
    if (rt !== 'mixed' && rt !== 'visual') return;
    selectedRole.value.defaultOnJoin = value;
    roleManagerDirty.value = true;
  }

  function setSelectedRoleType(roleType: EchoRoleType) {
    if (!selectedRole.value) return;
    const r = selectedRole.value;
    if (isPinnedBottomEchoRole(r)) return;
    r.roleType = roleType;
    if (roleType === 'visual') {
      const mention = r.mentionable;
      for (const k of Object.keys(
        r.permissions,
      ) as (keyof typeof r.permissions)[]) {
        r.permissions[k] = false;
      }
      r.permissions.mentionEveryone = mention;
      r.mentionable = mention;
      r.separateThemeColors = false;
      r.darkColor = r.color;
      r.lightColor = r.color;
    } else if (roleType === 'authority') {
      r.displaySeparately = false;
      r.separateThemeColors = false;
      r.darkColor = r.color;
      r.lightColor = r.color;
    } else {
      r.permissions = defaultRolePermissions();
    }
    roleManagerDirty.value = true;
  }

  function addSelectedRoleLink(linkedRoleId: string, twoWay: boolean) {
    if (!selectedRole.value) return;
    const self = selectedRole.value;
    if (self.roleType !== 'mixed' && self.roleType !== 'visual') return;
    if (isPinnedBottomEchoRole(self)) return;
    if (!linkedRoleId || linkedRoleId === self.id) return;
    if (self.linkedRoles.some((l) => l.linkedRoleId === linkedRoleId)) return;
    const target = roleManagerRoles.value.find((r) => r.id === linkedRoleId);
    if (!target || isPinnedBottomEchoRole(target)) return;
    self.linkedRoles.push({ linkedRoleId, twoWay });
    roleManagerDirty.value = true;
  }

  function removeSelectedRoleLink(index: number) {
    if (!selectedRole.value) return;
    const rt = selectedRole.value.roleType;
    if (rt !== 'mixed' && rt !== 'visual') return;
    selectedRole.value.linkedRoles.splice(index, 1);
    roleManagerDirty.value = true;
  }

  function setSelectedRoleLinkTwoWay(index: number, twoWay: boolean) {
    if (!selectedRole.value) return;
    const rt = selectedRole.value.roleType;
    if (rt !== 'mixed' && rt !== 'visual') return;
    const row = selectedRole.value.linkedRoles[index];
    if (!row) return;
    row.twoWay = twoWay;
    roleManagerDirty.value = true;
  }

  function setSelectedRoleMentionable(value: boolean) {
    if (!selectedRole.value) return;
    const rt = selectedRole.value.roleType;
    if (rt !== 'mixed' && rt !== 'visual') return;
    selectedRole.value.mentionable = value;
    selectedRole.value.permissions.mentionEveryone = value;
    roleManagerDirty.value = true;
  }

  watch(
    roleManagerRoles,
    (roles) => {
      roleManagerDirty.value =
        JSON.stringify(roles) !==
        JSON.stringify(roleManagerInitialSnapshot.value);
    },
    { deep: true },
  );

  return {
    roleManagerRoles,
    roleManagerInitialSnapshot,
    selectedRoleId,
    hoveredRoleId,
    draggingRoleId,
    dragOverRoleId,
    dragInsertAfter,
    roleManagerDirty,
    roleManagerSearchQuery,
    newRoleName,
    roleEditorTab,
    selectedRole,
    filteredRoleManagerRoles,
    visibleRolePermissionDefs,
    initRoleManager,
    initRoleManagerFromEcho,
    discardRoleManagerChanges,
    saveRoleManagerChanges,
    rolePosition,
    setRolePosition,
    moveRoleToIndex,
    onRoleDragStart,
    onRoleDragOver,
    onRoleDrop,
    onRoleDragEnd,
    deleteRole,
    createRole,
    updateSelectedRolePermission,
    setSelectedRoleDisplaySeparately,
    setSelectedRoleDefaultOnJoin,
    setSelectedRoleType,
    addSelectedRoleLink,
    removeSelectedRoleLink,
    setSelectedRoleLinkTwoWay,
    setSelectedRoleMentionable,
  };
}
