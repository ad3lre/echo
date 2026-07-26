import { computed, ref, watch, type Ref } from 'vue';
import { useRoleManager } from './useRoleManager';
import { useRoleColorPicker } from './useRoleColorPicker';
import { useServerSettingsRolesEchoPersistence } from '@/services/orchestration/useServerSettingsRolesEchoPersistence';
import {
  deleteEchoRoleCategory,
  fetchEchoMemberRoleAssignments,
  patchEchoRole,
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
import {
  reconcileSelectedRoleIdForCategoryTab,
  topEchoRoleIdForUserServerSettings,
  applyCategoryDefaultsToManagedRole,
  categoryDefaultsAreConfigured,
  defaultRolePermissions,
} from '@/features/server-settings/domain/roleManagerState';
import { isPinnedBottomEchoRole } from '@shared/echoReservedRoles';
import { pinPinnedBottomEchoRoles } from '@/features/server-settings/roleManagerOrdering';
import {
  roleUiPermissionsFromEchoStrings,
  roleUiPermissionsToEchoStrings,
} from '@shared/rolePermissionBridge';
import type { EchoRoleScope } from '@shared/echoRoleScope';
import type { EchoRoleType } from '@shared/echoRoleTypes';
import { uploadServerBrandingFile } from '@/api/echo/uploads';
import type { EmojiEntry } from '@/composables/useEmojiData';
import type { AppIconEntry } from '@/composables/useAppIconSearch';
import { getTwemojiSrc } from '@/utils/twemoji';
import { extractUploadErrorMessage } from '@/services/domain/brandingUploads';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

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

  function setSelectedRoleScope(globalScope: boolean) {
    if (!selectedRole.value || isPinnedBottomEchoRole(selectedRole.value))
      return;
    selectedRole.value.roleScope = globalScope ? 'global' : 'category';
    roleManagerDirty.value = true;
  }

  function reorderRolesWithinCategory(
    draggedId: string,
    targetId: string,
    after: boolean,
  ) {
    const tab = selectedRoleCategoryTabId.value;
    if (tab === 'all') return;
    const inCat = roleManagerRoles.value.filter(
      (r) => !isPinnedBottomEchoRole(r) && r.roleCategoryId === tab,
    );
    const ids = inCat.map((r) => r.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    const insertAt = after
      ? to + (from < to ? 0 : 1)
      : to + (from < to ? -1 : 0);
    ids.splice(insertAt, 0, draggedId);
    const byId = new Map(roleManagerRoles.value.map((r) => [r.id, r]));
    const others = roleManagerRoles.value.filter(
      (r) => isPinnedBottomEchoRole(r) || r.roleCategoryId !== tab,
    );
    const reordered = [
      ...ids
        .map((id) => byId.get(id))
        .filter((r): r is (typeof roleManagerRoles.value)[number] => !!r),
      ...others,
    ];
    roleManagerRoles.value = pinPinnedBottomEchoRoles(reordered);
    roleManagerDirty.value = true;
  }

  function onRoleDragOverScoped(roleId: string, event: DragEvent) {
    const tab = selectedRoleCategoryTabId.value;
    if (tab === 'all') {
      onRoleDragOver(roleId, event);
      return;
    }
    if (!draggingRoleId.value || draggingRoleId.value === roleId) return;
    event.preventDefault();
    const row = event.currentTarget as HTMLElement | null;
    const rect = row?.getBoundingClientRect();
    const midpoint = rect ? rect.top + rect.height / 2 : 0;
    const after = (event.clientY || 0) > midpoint;
    dragOverRoleId.value = roleId;
    dragInsertAfter.value = after;
    reorderRolesWithinCategory(draggingRoleId.value, roleId, after);
  }

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
    activeSection: activeSection as Ref<ServerSettingsSection>,
    roleEditorTab,
    selectedRoleId,
  });

  const serverIdRef = computed(() => server.value?.id);

  const echoRoleCategories = ref<EchoRoleCategoryDto[]>([]);
  const selectedRoleCategoryTabId = ref<'all' | string>('all');

  function hydrateEchoRoleCategories(categories: EchoRoleCategoryDto[]) {
    echoRoleCategories.value = [...categories]
      .filter((c) => !c.isSystem)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    const tab = selectedRoleCategoryTabId.value;
    if (
      roleCategoryUiEnabled.value &&
      tab !== 'all' &&
      !echoRoleCategories.value.some((c) => c.id === tab)
    ) {
      selectedRoleCategoryTabId.value = 'all';
    }
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

  const rolesDragReorderEnabled = computed(() => {
    const tab = selectedRoleCategoryTabId.value;
    return tab !== 'all' && !!tab;
  });

  function assignRoleToCategory(
    roleId: string,
    categoryId: string | null,
    syncWithDefaults = false,
  ) {
    const role = roleManagerRoles.value.find((r) => r.id === roleId);
    if (!role || isPinnedBottomEchoRole(role)) return;
    if (role.roleCategoryId === categoryId) return;
    role.roleCategoryId = categoryId;
    if (categoryId && syncWithDefaults) {
      const cat = echoRoleCategories.value.find((c) => c.id === categoryId);
      if (cat && categoryDefaultsAreConfigured(cat)) {
        applyCategoryDefaultsToManagedRole(role, cat);
      } else {
        role.syncWithCategoryDefaults = true;
      }
    } else if (categoryId) {
      role.syncWithCategoryDefaults = false;
    }
    roleManagerDirty.value = true;
  }

  const roleCategorySyncPrompt = ref<{
    roleId: string;
    categoryId: string;
  } | null>(null);

  function requestAssignRoleToCategory(
    roleId: string,
    categoryId: string | null,
  ) {
    if (!categoryId) {
      assignRoleToCategory(roleId, null, false);
      return;
    }
    const role = roleManagerRoles.value.find((r) => r.id === roleId);
    if (!role || isPinnedBottomEchoRole(role)) return;
    if (role.roleCategoryId === categoryId) return;
    const cat = echoRoleCategories.value.find((c) => c.id === categoryId);
    if (cat && categoryDefaultsAreConfigured(cat)) {
      roleCategorySyncPrompt.value = { roleId, categoryId };
      return;
    }
    assignRoleToCategory(roleId, categoryId, false);
  }

  function confirmRoleCategorySync(sync: boolean) {
    const ctx = roleCategorySyncPrompt.value;
    roleCategorySyncPrompt.value = null;
    if (!ctx) return;
    assignRoleToCategory(ctx.roleId, ctx.categoryId, sync);
  }

  function cancelRoleCategorySync() {
    roleCategorySyncPrompt.value = null;
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
    const cat = echoRoleCategories.value.find((c) => c.id === tab);
    if (cat?.isSystem) return;
    try {
      await deleteEchoRoleCategory(token, sid, tab);
      echoRoleCategories.value = echoRoleCategories.value.filter(
        (c) => c.id !== tab,
      );
      for (const r of roleManagerRoles.value) {
        if (r.roleCategoryId === tab) {
          r.roleCategoryId = null;
        }
      }
      selectedRoleCategoryTabId.value = 'all';
    } catch {
      /* non-blocking */
    }
  }

  const roleCategoryOrderDirty = ref(false);
  const roleCategoryOrderSnapshot = ref<string[]>([]);

  watch(
    echoRoleCategories,
    (cats) => {
      if (!roleCategoryOrderSnapshot.value.length) {
        roleCategoryOrderSnapshot.value = cats.map((c) => c.id);
      }
    },
    { deep: true },
  );

  function markRoleCategoryOrderSnapshot() {
    roleCategoryOrderSnapshot.value = echoRoleCategories.value.map((c) => c.id);
    roleCategoryOrderDirty.value = false;
  }

  function reorderRoleCategoriesLocally(categoryIds: string[]) {
    const byId = new Map(echoRoleCategories.value.map((c) => [c.id, c]));
    echoRoleCategories.value = categoryIds
      .map((id, position) => {
        const row = byId.get(id);
        return row ? { ...row, position } : null;
      })
      .filter((c): c is EchoRoleCategoryDto => c != null);
    roleCategoryOrderDirty.value =
      categoryIds.join(',') !== roleCategoryOrderSnapshot.value.join(',');
  }

  const roleCategoryListExtra = ref<'settings' | null>(null);
  const categorySettingsNameDraft = ref('');
  const categorySettingsDefaultsDraft = ref({
    permissions: defaultRolePermissions(),
    defaultHoist: false,
    defaultOnJoin: false,
    defaultRoleScope: 'category' as EchoRoleScope,
    defaultRoleType: 'mixed' as EchoRoleType,
  });
  const categorySettingsSelfAssignableDraft = ref(false);
  const categorySettingsSaving = ref(false);
  const categorySettingsError = ref('');

  function hydrateCategorySettingsDrafts(tab: string) {
    const cat = echoRoleCategories.value.find((c) => c.id === tab);
    categorySettingsNameDraft.value = cat?.name ?? '';
    const partial = roleUiPermissionsFromEchoStrings(
      cat?.defaultPermissions ?? [],
    );
    categorySettingsDefaultsDraft.value = {
      permissions: {
        ...defaultRolePermissions(),
        ...partial,
      } as typeof categorySettingsDefaultsDraft.value.permissions,
      defaultHoist: cat?.defaultHoist === true,
      defaultOnJoin: cat?.defaultOnJoin === true,
      defaultRoleScope: cat?.defaultRoleScope ?? 'category',
      defaultRoleType: cat?.defaultRoleType ?? 'mixed',
    };
    categorySettingsSelfAssignableDraft.value =
      cat?.selfAssignableDefaults === true;
    categorySettingsError.value = '';
  }

  watch(selectedRoleId, (id) => {
    if (id.trim()) roleCategoryListExtra.value = null;
  });

  function selectRoleCategorySettingsRow() {
    const tab = selectedRoleCategoryTabId.value;
    if (tab === 'all') return;
    selectedRoleId.value = '';
    roleCategoryListExtra.value = 'settings';
    hydrateCategorySettingsDrafts(tab);
  }

  watch(selectedRoleCategoryTabId, (tab) => {
    roleCategoryListExtra.value = null;
    selectedRoleId.value = reconcileSelectedRoleIdForCategoryTab(
      tab,
      selectedRoleId.value,
      displayedRoleManagerRoles.value,
    );
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
      await patchEchoRoleCategory(token, sid, tab, {
        name,
        defaultPermissions: roleUiPermissionsToEchoStrings(
          categorySettingsDefaultsDraft.value.permissions as Record<
            string,
            boolean
          >,
        ),
        defaultHoist: categorySettingsDefaultsDraft.value.defaultHoist,
        defaultOnJoin: categorySettingsDefaultsDraft.value.defaultOnJoin,
        defaultRoleScope: categorySettingsDefaultsDraft.value.defaultRoleScope,
        defaultRoleType: categorySettingsDefaultsDraft.value.defaultRoleType,
        selfAssignableDefaults: categorySettingsSelfAssignableDraft.value,
      });
      const idx = echoRoleCategories.value.findIndex((c) => c.id === tab);
      if (idx >= 0) {
        echoRoleCategories.value[idx] = {
          ...echoRoleCategories.value[idx],
          name,
          defaultPermissions: roleUiPermissionsToEchoStrings(
            categorySettingsDefaultsDraft.value.permissions as Record<
              string,
              boolean
            >,
          ),
          defaultHoist: categorySettingsDefaultsDraft.value.defaultHoist,
          defaultOnJoin: categorySettingsDefaultsDraft.value.defaultOnJoin,
          defaultRoleScope:
            categorySettingsDefaultsDraft.value.defaultRoleScope,
          defaultRoleType: categorySettingsDefaultsDraft.value.defaultRoleType,
          selfAssignableDefaults: categorySettingsSelfAssignableDraft.value,
        };
      }
      for (const role of roleManagerRoles.value) {
        if (
          role.roleCategoryId === tab &&
          role.syncWithCategoryDefaults &&
          !isPinnedBottomEchoRole(role)
        ) {
          applyCategoryDefaultsToManagedRole(
            role,
            echoRoleCategories.value[idx]!,
          );
        }
      }
      roleManagerDirty.value = true;
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
    markRoleCategoryOrderSnapshot,
    roleCategoryOrderDirty,
    echoRoleCategories,
    selectedRoleCategoryTabId,
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
    const role = selectedRole.value;
    if (!sid || !isEchoGraphId(sid) || !role) return;
    const token = accessToken.value ?? '';
    const prevUrl = role.roleIconUrl;
    const prevEmojiId = role.roleIconEmojiId;
    const snap = roleManagerInitialSnapshot.value.find((r) => r.id === role.id);
    const prevSnapUrl = snap?.roleIconUrl ?? null;
    const prevSnapEmojiId = snap?.roleIconEmojiId ?? null;
    try {
      const url = await uploadServerBrandingFile(
        token,
        sid,
        'server_icon',
        file,
      );
      // Persist immediately — matching server Overview branding. Leaving icons in the
      // unsaved dirty bar made uploads look broken when the modal closed or roles refreshed.
      await patchEchoRole(token, sid, role.id, {
        roleIconUrl: url,
        roleIconEmojiId: null,
      });
      if (snap) {
        snap.roleIconUrl = url;
        snap.roleIconEmojiId = null;
      }
      role.roleIconUrl = url;
      role.roleIconEmojiId = null;
      onEchoRoleCatalogMutated();
    } catch (e) {
      if (snap) {
        snap.roleIconUrl = prevSnapUrl;
        snap.roleIconEmojiId = prevSnapEmojiId;
      }
      role.roleIconUrl = prevUrl;
      role.roleIconEmojiId = prevEmojiId;
      const detail = extractUploadErrorMessage(e);
      dispatchAppToast(
        detail
          ? `Could not save role icon: ${detail}`
          : 'Could not save role icon.',
        'warning',
      );
    }
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
    reorderRoleCategoriesLocally,
    assignRoleToCategory,
    requestAssignRoleToCategory,
    confirmRoleCategorySync,
    cancelRoleCategorySync,
    roleCategorySyncPrompt,
    createRoleCategory,
    deleteActiveRoleCategory,
    roleCategoryListExtra,
    categorySettingsNameDraft,
    categorySettingsDefaultsDraft,
    categorySettingsSelfAssignableDraft,
    categorySettingsSaving,
    categorySettingsError,
    selectRoleCategorySettingsRow,
    saveRoleCategorySettings,
    initRoleManager,
    initRoleManagerFromEcho,
    rolePosition,
    setRolePosition,
    onRoleDragStart,
    onRoleDragOver: onRoleDragOverScoped,
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
    setSelectedRoleScope,
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
