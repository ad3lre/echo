import { computed, ref, watch, type Ref } from 'vue';
import { useRoleManager } from './useRoleManager';
import { useRoleColorPicker } from './useRoleColorPicker';
import { useServerSettingsRolesEchoPersistence } from '@/services/orchestration/useServerSettingsRolesEchoPersistence';
import {
  deleteEchoRoleCategory,
  fetchEchoMemberRoleAssignments,
  patchEchoRoleCategory,
  postEchoAssignMemberRole,
  postEchoRoleCategory,
} from '@/api/echoClient';
import type { EchoRoleCategoryDto } from '@/api/echo/types';
import { isEchoGraphId } from '@/utils/echoIds';
import {
  getHighestRoleForMember,
  ROLE_HIERARCHY,
} from '@/utils/memberProfiles';
import { normalizedStatus } from '../overview';
import type { RolePermissionKey, ServerSettingsSection } from '../types';
import { topEchoRoleIdForUserServerSettings } from '@/features/server-settings/domain/roleManagerState';
import { uploadServerBrandingFile } from '@/api/echo/uploads';
import type { EmojiEntry } from '@/composables/useEmojiData';
import type { AppIconEntry } from '@/composables/useAppIconSearch';
import { getTwemojiSrc } from '@/utils/twemoji';

export function useServerSettingsRoles(options: {
  server: Ref<{ id: string } | null>;
  users: Ref<{ id: string; name: string; pfp: string; status?: string }[]>;
  canManageRoles: Ref<boolean | undefined>;
  accessToken: Ref<string | null>;
  activeSection: Ref<ServerSettingsSection | string>;
  onEchoRoleCatalogMutated: () => void;
}) {
  const {
    server,
    users,
    canManageRoles,
    accessToken,
    activeSection,
    onEchoRoleCatalogMutated,
  } = options;

  const roleCards = computed(() => {
    const serverId = server.value?.id ?? 'echo';
    const grouped = new Map<
      string,
      { id: string; name: string; color: string; count: number }
    >();

    for (const user of users.value) {
      const role = getHighestRoleForMember(serverId, user.id);
      const existing = grouped.get(role.id);
      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(role.id, { ...role, count: 1 });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => {
      const ai = ROLE_HIERARCHY.indexOf(a.name);
      const bi = ROLE_HIERARCHY.indexOf(b.name);
      const ao = ai === -1 ? ROLE_HIERARCHY.length : ai;
      const bo = bi === -1 ? ROLE_HIERARCHY.length : bi;
      return ao - bo;
    });
  });

  const {
    roleManagerRoles,
    roleManagerInitialSnapshot,
    selectedRoleId,
    hoveredRoleId,
    draggingRoleId,
    dragOverRoleId,
    dragInsertAfter,
    roleManagerDirty,
    roleManagerSearchQuery,
    roleEditorTab,
    selectedRole,
    filteredRoleManagerRoles,
    initRoleManager,
    initRoleManagerFromEcho,
    discardRoleManagerChanges: discardRoleManagerChangesCore,
    saveRoleManagerChanges: saveRoleManagerChangesCore,
    rolePosition,
    setRolePosition,
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
  } = useRoleManager(roleCards);

  const {
    roleCustomPanelOpen,
    roleHexInput,
    roleRInput,
    roleGInput,
    roleBInput,
    roleHInput,
    roleSInput,
    roleLInput,
    setColorWheelCanvasEl,
    openRoleCustomPanel,
    selectRoleColorPreset,
    setSeparateThemeColors,
    onPickerHexBlur,
    onRgbInputsBlur,
    onHslInputsBlur,
    nudgeRgb,
    nudgeHsl,
    onWheelPointerDown,
    resetPickerState,
  } = useRoleColorPicker({
    selectedRole,
    roleManagerDirty,
    activeSection: activeSection as any,
    roleEditorTab,
    selectedRoleId,
  });

  const serverIdRef = computed(() => server.value?.id);

  const echoRoleCategories = ref<EchoRoleCategoryDto[]>([]);
  const selectedRoleCategoryTabId = ref<'all' | string>('all');

  function hydrateEchoRoleCategories(categories: EchoRoleCategoryDto[]) {
    echoRoleCategories.value = [...categories].sort(
      (a, b) => a.position - b.position || a.id.localeCompare(b.id),
    );
  }

  watch(
    () => server.value?.id,
    () => {
      echoRoleCategories.value = [];
      selectedRoleCategoryTabId.value = 'all';
    },
  );

  const roleCategoryUiEnabled = computed(
    () =>
      !!serverIdRef.value &&
      isEchoGraphId(serverIdRef.value) &&
      !!canManageRoles.value,
  );

  const displayedRoleManagerRoles = computed(() => {
    const list = filteredRoleManagerRoles.value;
    const tab = selectedRoleCategoryTabId.value;
    if (tab === 'all') return list;
    return list.filter((r) => r.roleCategoryId === tab);
  });

  const rolesDragReorderEnabled = computed(
    () => selectedRoleCategoryTabId.value === 'all',
  );

  function assignRoleToCategory(roleId: string, categoryId: string | null) {
    const role = roleManagerRoles.value.find((r) => r.id === roleId);
    if (!role || role.name === '@everyone') return;
    if (role.roleCategoryId === categoryId) return;
    role.roleCategoryId = categoryId;
  }

  async function createRoleCategory() {
    const sid = serverIdRef.value;
    /** Cookie session auth: `accessToken` may be unset while `echoFetch` still works. */
    const token = accessToken.value ?? '';
    if (!sid || !isEchoGraphId(sid)) return;
    const n = echoRoleCategories.value.length + 1;
    try {
      const { id } = await postEchoRoleCategory(token, sid, `Category ${n}`);
      echoRoleCategories.value = [
        ...echoRoleCategories.value,
        {
          id,
          name: `Category ${n}`,
          position: echoRoleCategories.value.length,
        },
      ].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      selectedRoleCategoryTabId.value = id;
    } catch {
      /* non-blocking */
    }
  }

  async function deleteActiveRoleCategory() {
    const sid = serverIdRef.value;
    const token = accessToken.value ?? '';
    const tab = selectedRoleCategoryTabId.value;
    if (!sid || !isEchoGraphId(sid) || tab === 'all') return;
    try {
      await deleteEchoRoleCategory(token, sid, tab);
      echoRoleCategories.value = echoRoleCategories.value.filter(
        (c) => c.id !== tab,
      );
      for (const r of roleManagerRoles.value) {
        if (r.roleCategoryId === tab) r.roleCategoryId = null;
      }
      selectedRoleCategoryTabId.value = 'all';
    } catch {
      /* non-blocking */
    }
  }

  const roleCategoryListExtra = ref<'settings' | null>(null);
  const categorySettingsNameDraft = ref('');
  const categorySettingsSaving = ref(false);
  const categorySettingsError = ref('');

  watch(selectedRoleId, (id) => {
    if (id.trim()) roleCategoryListExtra.value = null;
  });

  function selectRoleCategorySettingsRow() {
    const tab = selectedRoleCategoryTabId.value;
    if (tab === 'all') return;
    selectedRoleId.value = '';
    roleCategoryListExtra.value = 'settings';
    const cat = echoRoleCategories.value.find((c) => c.id === tab);
    categorySettingsNameDraft.value = cat?.name ?? '';
    categorySettingsError.value = '';
  }

  watch(selectedRoleCategoryTabId, () => {
    if (selectedRoleCategoryTabId.value === 'all') {
      roleCategoryListExtra.value = null;
      return;
    }
    selectRoleCategorySettingsRow();
  });

  async function saveRoleCategorySettings() {
    const sid = serverIdRef.value;
    const token = accessToken.value ?? '';
    const tab = selectedRoleCategoryTabId.value;
    if (tab === 'all' || !sid || !isEchoGraphId(sid)) return;
    const name = categorySettingsNameDraft.value.trim();
    if (!name) {
      categorySettingsError.value = 'Name is required';
      return;
    }
    categorySettingsSaving.value = true;
    categorySettingsError.value = '';
    try {
      await patchEchoRoleCategory(token, sid, tab, name);
      const idx = echoRoleCategories.value.findIndex((c) => c.id === tab);
      if (idx >= 0) {
        echoRoleCategories.value[idx] = {
          ...echoRoleCategories.value[idx],
          name,
        };
      }
    } catch (e) {
      categorySettingsError.value =
        e instanceof Error ? e.message : 'Failed to save category';
    } finally {
      categorySettingsSaving.value = false;
    }
  }

  const {
    roleMenuOpen,
    roleSaveLoading,
    roleSaveError,
    echoRolesLocked,
    visibleRolePermissionDefsForServer,
    createRoleWrapped,
    saveRoleManagerChanges,
    discardRoleManagerChanges,
  } = useServerSettingsRolesEchoPersistence({
    accessToken,
    serverId: serverIdRef,
    canManageRoles: computed(() => !!canManageRoles.value),
    users,
    roleManagerRoles,
    roleManagerInitialSnapshot,
    selectedRoleId,
    roleEditorTab,
    selectedRoleCategoryTabForCreate: selectedRoleCategoryTabId,
    initRoleManagerFromEcho,
    saveRoleManagerChangesCore,
    createRole,
    resetPickerState,
    discardRoleManagerChangesCore,
    onEchoRoleCatalogMutated,
    hydrateEchoRoleCategories,
  });

  function onRolePermissionCheckboxChange(
    key: RolePermissionKey,
    event: Event,
  ) {
    const input = event.target as HTMLInputElement;
    updateSelectedRolePermission(key, input.checked);
  }

  const memberRoleIdsByUser = ref<Record<string, string[]>>({});

  const selectedRoleMembers = computed(() => {
    if (!selectedRole.value || !server.value) return [];
    const sid = server.value.id;
    const rid = selectedRole.value.id;

    if (isEchoGraphId(sid)) {
      const assigns = memberRoleIdsByUser.value;
      const ordered = roleManagerRoles.value;
      return users.value
        .filter(
          (u) =>
            topEchoRoleIdForUserServerSettings(u.id, assigns, ordered) === rid,
        )
        .map((u) => ({
          id: u.id,
          name: u.name,
          pfp: u.pfp,
          status: normalizedStatus(u.status),
        }));
    }

    return users.value
      .filter((u) => getHighestRoleForMember(sid, u.id).id === rid)
      .map((u) => ({
        id: u.id,
        name: u.name,
        pfp: u.pfp,
        status: normalizedStatus(u.status),
      }));
  });

  watch(
    () => server.value?.id,
    () => {
      memberRoleIdsByUser.value = {};
    },
  );

  async function uploadSelectedRoleIcon(file: File) {
    const sid = server.value?.id;
    if (!sid || !isEchoGraphId(sid) || !selectedRole.value) return;
    const token = accessToken.value ?? '';
    const url = await uploadServerBrandingFile(token, sid, 'server_icon', file);
    selectedRole.value.roleIconUrl = url;
    selectedRole.value.roleIconEmojiId = null;
    roleManagerDirty.value = true;
  }

  function setSelectedRoleIconFromAppIcon(entry: AppIconEntry) {
    if (!selectedRole.value) return;
    const url = (entry.url ?? '').trim();
    if (!url) return;
    selectedRole.value.roleIconEmojiId = null;
    selectedRole.value.roleIconUrl = url;
    roleManagerDirty.value = true;
  }

  function setSelectedRoleIconFromExternalUrl(url: string) {
    if (!selectedRole.value) return;
    const trimmed = (url ?? '').trim();
    if (!trimmed) return;
    selectedRole.value.roleIconEmojiId = null;
    selectedRole.value.roleIconUrl = trimmed;
    roleManagerDirty.value = true;
  }

  function setSelectedRoleIconFromPickerEntry(entry: EmojiEntry) {
    if (!selectedRole.value) return;
    if (entry.kind === 'appIcon') return;
    if (entry.kind === 'custom' && entry.id && entry.imageUrl) {
      const id =
        typeof entry.id === 'string'
          ? entry.id.trim()
          : String(entry.id).trim();
      if (!id) return;
      /** Keep emoji id even when the asset lives on another guild — URL + id pair is what Echo persists. */
      selectedRole.value.roleIconEmojiId = id;
      selectedRole.value.roleIconUrl = entry.imageUrl;
      roleManagerDirty.value = true;
      return;
    }
    const src = getTwemojiSrc(entry.emoji);
    if (!src) return;
    selectedRole.value.roleIconEmojiId = null;
    selectedRole.value.roleIconUrl = src;
    roleManagerDirty.value = true;
  }

  function clearSelectedRoleIcon() {
    if (!selectedRole.value) return;
    selectedRole.value.roleIconEmojiId = null;
    selectedRole.value.roleIconUrl = null;
    roleManagerDirty.value = true;
  }

  function setMemberRoleAssignments(map: Record<string, string[]>) {
    memberRoleIdsByUser.value = { ...map };
  }

  async function refreshMemberRoleAssignments() {
    const sid = server.value?.id;
    const token = accessToken.value ?? '';
    if (!sid || !isEchoGraphId(sid)) return;
    try {
      const { assignments } = await fetchEchoMemberRoleAssignments(token, sid);
      memberRoleIdsByUser.value = assignments;
    } catch {
      /* keep previous snapshot */
    }
  }

  async function assignMemberToRole(targetUserId: string, roleId: string) {
    const sid = server.value?.id;
    const token = accessToken.value ?? '';
    if (!sid || !isEchoGraphId(sid)) return;
    await postEchoAssignMemberRole(token, sid, targetUserId, roleId);
    const prev = memberRoleIdsByUser.value[targetUserId] ?? [];
    memberRoleIdsByUser.value = {
      ...memberRoleIdsByUser.value,
      [targetUserId]: [...new Set([...prev, roleId])],
    };
    onEchoRoleCatalogMutated();
  }

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
    roleEditorTab,
    selectedRole,
    filteredRoleManagerRoles,
    displayedRoleManagerRoles,
    echoRoleCategories,
    selectedRoleCategoryTabId,
    roleCategoryUiEnabled,
    rolesDragReorderEnabled,
    hydrateEchoRoleCategories,
    assignRoleToCategory,
    createRoleCategory,
    deleteActiveRoleCategory,
    roleCategoryListExtra,
    categorySettingsNameDraft,
    categorySettingsSaving,
    categorySettingsError,
    selectRoleCategorySettingsRow,
    saveRoleCategorySettings,
    initRoleManager,
    initRoleManagerFromEcho,
    rolePosition,
    setRolePosition,
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
    roleCustomPanelOpen,
    roleHexInput,
    roleRInput,
    roleGInput,
    roleBInput,
    roleHInput,
    roleSInput,
    roleLInput,
    setColorWheelCanvasEl,
    openRoleCustomPanel,
    selectRoleColorPreset,
    setSeparateThemeColors,
    onPickerHexBlur,
    onRgbInputsBlur,
    onHslInputsBlur,
    nudgeRgb,
    nudgeHsl,
    onWheelPointerDown,
    resetPickerState,
    roleMenuOpen,
    roleSaveLoading,
    roleSaveError,
    echoRolesLocked,
    visibleRolePermissionDefsForServer,
    createRoleWrapped,
    saveRoleManagerChanges,
    discardRoleManagerChanges,
    onRolePermissionCheckboxChange,
    selectedRoleMembers,
    memberRoleIdsByUser,
    setMemberRoleAssignments,
    refreshMemberRoleAssignments,
    assignMemberToRole,
    uploadSelectedRoleIcon,
    setSelectedRoleIconFromAppIcon,
    setSelectedRoleIconFromExternalUrl,
    setSelectedRoleIconFromPickerEntry,
    clearSelectedRoleIcon,
  };
}
