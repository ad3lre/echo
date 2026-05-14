import { computed, readonly, ref } from 'vue';

export type RolePreviewState = {
  serverId: string;
  roleId: string;
  roleName: string;
  roleColor: string;
  uiPermissions: string[];
};

const rolePreviewState = ref<RolePreviewState | null>(null);

export function useRolePreview() {
  const isRolePreviewActive = computed(() => rolePreviewState.value !== null);

  function startRolePreview(payload: RolePreviewState) {
    rolePreviewState.value = {
      ...payload,
      uiPermissions: Array.from(new Set(payload.uiPermissions)),
    };
  }

  function clearRolePreview() {
    rolePreviewState.value = null;
  }

  return {
    rolePreview: readonly(rolePreviewState),
    isRolePreviewActive,
    startRolePreview,
    clearRolePreview,
  };
}
