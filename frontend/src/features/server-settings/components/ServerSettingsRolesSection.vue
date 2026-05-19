<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue';
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { icons } from '@/assets/icons';
import EchoDropdown from '@/components/EchoDropdown.vue';
import EchoSegmentedControl from '@/components/EchoSegmentedControl.vue';
import { useDevSettingsStore } from '@/stores/devSettings';
import { useThemeStore } from '@/stores/theme';
import ServerSettingsPermissionPreviewSection from '@/features/server-settings/components/ServerSettingsPermissionPreviewSection.vue';
import {
  ROLE_COLOR_PRESETS,
  ROLE_PERMISSION_GROUPS,
} from '@/features/server-settings/types';
import {
  labelsForEnabledRiskyDefaultOnJoinPermissions,
  roleIsRiskyForDefaultOnJoin,
} from '@/features/server-settings/domain/rolePermissionPolicies';
import type { RolePermissionKey } from '@/features/server-settings/types';
import type { EmojiEntry } from '@/composables/useEmojiData';
import type { AppIconEntry } from '@/composables/useAppIconSearch';
import type { EchoRoleType } from '@shared/echoRoleTypes';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { memberRoleIconImgSrc } from '@/utils/memberRoleIconDisplay';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import RoleIconPickerField from '@/features/server-settings/components/RoleIconPickerField.vue';

/** Template ref callback — Ref objects passed as props are unwrapped, so the parent must receive the node via a setter. */
function onColorWheelCanvasRef(el: Element | ComponentPublicInstance | null) {
  const node =
    el == null
      ? null
      : '$el' in el
        ? (el.$el as HTMLElement | null)
        : (el as HTMLElement | null);
  props.setColorWheelCanvasEl?.(
    node instanceof HTMLCanvasElement ? node : null,
  );
}

function normalizeRoleColor(color: string | null | undefined) {
  return (color ?? '').trim().toLowerCase();
}

function roleColorStyle(color: string | null | undefined) {
  const normalized = (color ?? '').trim();
  return normalized ? { backgroundColor: normalized } : {};
}

function roleNameStyle(color: string | null | undefined) {
  const normalized = (color ?? '').trim();
  return normalized ? { color: normalized } : {};
}

function managedRoleIconSrc(role: {
  roleIconUrl?: string | null;
  roleIconEmojiId?: string | null;
}) {
  return memberRoleIconImgSrc({
    iconUrl: role.roleIconUrl,
    iconEmojiId: role.roleIconEmojiId,
  });
}

function isColorlessRole(color: string | null | undefined) {
  return normalizeRoleColor(color) === '';
}

function isActivePreset(
  currentColor: string | null | undefined,
  presetValue: string,
) {
  return normalizeRoleColor(currentColor) === normalizeRoleColor(presetValue);
}

const props = withDefaults(
  defineProps<{
    roleManagerRoles: any[];
    selectedRoleId: string | null;
    hoveredRoleId: string | null;
    draggingRoleId: string | null;
    dragOverRoleId: string | null;
    dragInsertAfter: boolean;
    roleManagerDirty: boolean;
    roleManagerSearchQuery: string;
    roleEditorTab: 'display' | 'permissions' | 'members';
    selectedRole: any | null;
    filteredRoleManagerRoles: any[];
    visibleRolePermissionDefs: {
      key: RolePermissionKey;
      group: string;
      label: string;
    }[];
    roleMenuOpen: boolean;
    roleCustomPanelOpen: boolean;
    roleHexInput: string;
    roleRInput: number;
    roleGInput: number;
    roleBInput: number;
    roleHInput: number;
    roleSInput: number;
    roleLInput: number;
    selectedRoleMembers: any[];
    setColorWheelCanvasEl: (el: HTMLCanvasElement | null) => void;
    createRole: (name: string) => void;
    rolePosition: (roleId: string) => number | null;
    setRolePosition: (roleId: string, position: number) => void;
    onRoleDragStart: (id: string, event: DragEvent) => void;
    onRoleDragOver: (id: string, event: DragEvent) => void;
    onRoleDrop: () => void;
    onRoleDragEnd: () => void;
    deleteRole: (id: string) => void;
    setSelectedRoleDisplaySeparately: (value: boolean) => void;
    setSelectedRoleDefaultOnJoin: (value: boolean) => void;
    setSelectedRoleType: (value: EchoRoleType) => void;
    addSelectedRoleLink: (linkedRoleId: string, twoWay: boolean) => void;
    removeSelectedRoleLink: (index: number) => void;
    setSelectedRoleLinkTwoWay: (index: number, twoWay: boolean) => void;
    setSelectedRoleMentionable: (value: boolean) => void;
    onRolePermissionCheckboxChange: (
      key: RolePermissionKey,
      event: Event,
    ) => void;
    setSeparateThemeColors: (enabled: boolean) => void;
    openRoleCustomPanel: (target: 'single' | 'dark' | 'light') => void;
    selectRoleColorPreset: (
      target: 'single' | 'dark' | 'light',
      preset: string,
    ) => void;
    onPickerHexBlur: () => void;
    onRgbInputsBlur: () => void;
    onHslInputsBlur: () => void;
    nudgeRgb: (channel: 'r' | 'g' | 'b', delta: number) => void;
    nudgeHsl: (channel: 'h' | 's' | 'l', delta: number) => void;
    onWheelPointerDown: (event: MouseEvent) => void;
    discardRoleManagerChanges: () => void;
    saveRoleManagerChanges: () => void | Promise<void>;
    echoRolesLocked?: boolean;
    roleSaveLoading?: boolean;
    echoServerIdForPermissionPreview?: string | null;
    allUsers?: {
      id: string;
      name: string;
      pfp: string;
      status?: string;
      isDiscordShadow?: boolean;
    }[];
    memberRoleIdsByUser?: Record<string, string[]>;
    assignMemberToRole?: (
      userId: string,
      roleId: string,
    ) => void | Promise<void>;
    refreshMemberRoleAssignments?: () => void | Promise<void>;
    roleQuickAddEnabled?: boolean;
    previewedRoleId?: string | null;
    roleSaveError?: string | null;
    echoRoleCategories?: Array<{ id: string; name: string; position: number }>;
    selectedRoleCategoryTabId?: 'all' | string;
    roleCategoryUiEnabled?: boolean;
    rolesDragReorderEnabled?: boolean;
    assignRoleToCategory?: (roleId: string, categoryId: string | null) => void;
    createRoleCategory?: () => void | Promise<void>;
    deleteActiveRoleCategory?: () => void | Promise<void>;
    roleCategoryListExtra?: 'settings' | null;
    categorySettingsNameDraft?: string;
    categorySettingsSaving?: boolean;
    categorySettingsError?: string | null;
    selectRoleCategorySettingsRow?: () => void;
    saveRoleCategorySettings?: () => void | Promise<void>;
    roleIconPickerServerId?: string | null;
    uploadSelectedRoleIcon?: (file: File) => void | Promise<void>;
    setSelectedRoleIconFromPickerEntry?: (entry: EmojiEntry) => void;
    setSelectedRoleIconFromAppIcon?: (entry: AppIconEntry) => void;
    setSelectedRoleIconFromExternalUrl?: (url: string) => void;
    clearSelectedRoleIcon?: () => void;
  }>(),
  {
    echoRoleCategories: () => [],
    selectedRoleCategoryTabId: 'all',
    roleCategoryUiEnabled: false,
    rolesDragReorderEnabled: true,
    assignRoleToCategory: () => {},
    setSelectedRoleType: () => {},
    createRoleCategory: () => {},
    deleteActiveRoleCategory: () => {},
    roleCategoryListExtra: null,
    categorySettingsNameDraft: '',
    categorySettingsSaving: false,
    categorySettingsError: null,
    selectRoleCategorySettingsRow: () => {},
    saveRoleCategorySettings: () => {},
    memberRoleIdsByUser: () => ({}),
    assignMemberToRole: async () => {},
    refreshMemberRoleAssignments: async () => {},
    roleQuickAddEnabled: false,
    roleIconPickerServerId: null,
    uploadSelectedRoleIcon: async () => {},
    setSelectedRoleIconFromPickerEntry: () => {},
    setSelectedRoleIconFromAppIcon: () => {},
    setSelectedRoleIconFromExternalUrl: () => {},
    clearSelectedRoleIcon: () => {},
  },
);

const emit = defineEmits<{
  'update:selectedRoleId': [value: string];
  'update:hoveredRoleId': [value: string | null];
  'update:roleManagerSearchQuery': [value: string];
  'update:roleEditorTab': [value: 'display' | 'permissions' | 'members'];
  'update:roleMenuOpen': [value: boolean];
  'update:roleHexInput': [value: string];
  'update:roleRInput': [value: number];
  'update:roleGInput': [value: number];
  'update:roleBInput': [value: number];
  'update:roleHInput': [value: number];
  'update:roleSInput': [value: number];
  'update:roleLInput': [value: number];
  'preview-selected-role': [];
  'update:selectedRoleCategoryTabId': [value: 'all' | string];
  'update:categorySettingsNameDraft': [value: string];
}>();

watch(
  () => props.selectedRole?.roleType,
  (t) => {
    if (t === 'visual' && props.roleEditorTab === 'permissions') {
      emit('update:roleEditorTab', 'display');
    }
  },
);

const linkAddRoleId = ref('');
const linkAddDirection = ref<'one' | 'two'>('one');

/** Disclosure only — does not change `linkedRoles` data. */
const linkedRolesDisclosureOpen = ref(false);

watch(
  () => props.selectedRole?.id ?? null,
  () => {
    const role = props.selectedRole;
    if (!role) {
      linkedRolesDisclosureOpen.value = false;
      return;
    }
    linkedRolesDisclosureOpen.value = (role.linkedRoles ?? []).length > 0;
  },
  { immediate: true },
);

watch(
  () => (props.selectedRole?.linkedRoles ?? []).length,
  (len, prevLen) => {
    if (prevLen === 0 && len > 0) {
      linkedRolesDisclosureOpen.value = true;
    }
  },
);

function onLinkedRolesDisclosureChange(event: Event) {
  linkedRolesDisclosureOpen.value = (event.target as HTMLInputElement).checked;
}

const ROLE_TYPE_UI_OPTIONS: {
  label: string;
  value: EchoRoleType;
  iconSrc: string;
  title: string;
}[] = [
  {
    label: 'Mixed',
    value: 'mixed',
    iconSrc: icons.sliders,
    title: 'Mixed — compact roles (color, permissions, list)',
  },
  {
    label: 'Authority',
    value: 'authority',
    iconSrc: icons.shield,
    title: 'Authority — hidden from most members; still grants permissions',
  },
  {
    label: 'Visual',
    value: 'visual',
    iconSrc: icons.imageGallery,
    title: 'Visual — cosmetic only; no permission grants',
  },
];

const selectedEchoRoleType = computed(
  () => (props.selectedRole?.roleType ?? 'mixed') as EchoRoleType,
);

const isMixedRole = computed(
  () => (props.selectedRole?.roleType ?? 'mixed') === 'mixed',
);
const isVisualRole = computed(() => props.selectedRole?.roleType === 'visual');
const isAuthorityRole = computed(
  () => props.selectedRole?.roleType === 'authority',
);

const LINK_DIRECTION_OPTIONS = [
  { label: 'One-way', value: 'one' },
  { label: 'Two-way', value: 'two' },
];

function roleLabelForLink(roleId: string) {
  return props.roleManagerRoles.find((r) => r.id === roleId)?.name ?? roleId;
}

const roleLinkPickOptions = computed(() => {
  if (!props.selectedRole) return [];
  const self = props.selectedRole;
  const taken = new Set(
    (self.linkedRoles ?? []).map(
      (l: { linkedRoleId: string }) => l.linkedRoleId,
    ),
  );
  return props.roleManagerRoles.filter(
    (r) => r.id !== self.id && r.name !== '@everyone' && !taken.has(r.id),
  );
});

const roleLinkPickDropdownOptions = computed(() => [
  { label: 'Choose role…', value: '' },
  ...roleLinkPickOptions.value.map((r) => ({ label: r.name, value: r.id })),
]);

function submitAddRoleLink() {
  if (!linkAddRoleId.value) return;
  props.addSelectedRoleLink(
    linkAddRoleId.value,
    linkAddDirection.value === 'two',
  );
  linkAddRoleId.value = '';
  linkAddDirection.value = 'one';
}

const permissionPreviewModalOpen = ref(false);
const defaultOnJoinWarningOpen = ref(false);
const quickAddMembersModalOpen = ref(false);
const quickAddSearchQuery = ref('');
const quickAddBusyUserId = ref<string | null>(null);
const quickAddError = ref('');

const quickAddFilteredMembers = computed(() => {
  const list = props.allUsers ?? [];
  const q = quickAddSearchQuery.value.trim().toLowerCase();
  return list
    .filter((u) => !u.isDiscordShadow)
    .filter(
      (u) =>
        q === '' ||
        u.name.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
});

function memberAlreadyHasSelectedRole(userId: string): boolean {
  const rid = props.selectedRole?.id;
  if (!rid) return false;
  return (props.memberRoleIdsByUser?.[userId] ?? []).includes(rid);
}

function roleAccentHex(color: string | null | undefined) {
  const t = (color ?? '').trim();
  return t || '#5865f2';
}

async function openQuickAddMembersModal() {
  quickAddError.value = '';
  quickAddSearchQuery.value = '';
  await props.refreshMemberRoleAssignments?.();
  quickAddMembersModalOpen.value = true;
}

async function onQuickAddMember(userId: string) {
  const roleId = props.selectedRole?.id;
  if (!roleId || !props.assignMemberToRole) return;
  quickAddError.value = '';
  quickAddBusyUserId.value = userId;
  try {
    await props.assignMemberToRole(userId, roleId);
  } catch (e) {
    quickAddError.value =
      e instanceof Error ? e.message : 'Could not add member to this role.';
  } finally {
    quickAddBusyUserId.value = null;
  }
}

const defaultOnJoinRiskLabels = computed(() =>
  props.selectedRole
    ? labelsForEnabledRiskyDefaultOnJoinPermissions(
        props.selectedRole.permissions,
      )
    : [],
);

function onDefaultOnJoinCheckboxChange(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const next = input.checked;
  if (!next) {
    props.setSelectedRoleDefaultOnJoin(false);
    return;
  }
  if (!props.selectedRole) return;
  if (!roleIsRiskyForDefaultOnJoin(props.selectedRole.permissions)) {
    props.setSelectedRoleDefaultOnJoin(true);
    return;
  }
  defaultOnJoinWarningOpen.value = true;
}

function confirmDefaultOnJoinHighRisk() {
  defaultOnJoinWarningOpen.value = false;
  props.setSelectedRoleDefaultOnJoin(true);
}

function cancelDefaultOnJoinHighRisk() {
  defaultOnJoinWarningOpen.value = false;
}

const rolesListScrollEl = ref<HTMLElement | null>(null);

function scrollSelectedRoleRowIntoViewIfNeeded(
  roleId: string | null | undefined,
) {
  if (!roleId) return;
  const scrollEl = rolesListScrollEl.value;
  if (!scrollEl) return;
  const row = scrollEl.querySelector(
    `[data-role-list-row-id="${CSS.escape(roleId)}"]`,
  );
  if (!(row instanceof HTMLElement)) return;

  const cRect = scrollEl.getBoundingClientRect();
  const rRect = row.getBoundingClientRect();
  const pad = 2;
  const fullyVisible =
    rRect.top >= cRect.top - pad && rRect.bottom <= cRect.bottom + pad;
  if (!fullyVisible) {
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

watch(
  () => props.selectedRoleId,
  async (nextId, prevId) => {
    if (nextId === prevId) return;
    linkAddRoleId.value = '';
    linkAddDirection.value = 'one';
    defaultOnJoinWarningOpen.value = false;
    await nextTick();
    scrollSelectedRoleRowIntoViewIfNeeded(nextId);
  },
);

const devSettings = useDevSettingsStore();
const { devModeIdsEnabled } = storeToRefs(devSettings);

const themeStore = useThemeStore();
const { canonicalTheme: themeCanonical } = storeToRefs(themeStore);

/** Role list row dot + name: use light/dark branch when split colors are enabled. */
function roleListResolvedColor(role: {
  color: string;
  separateThemeColors?: boolean;
  darkColor?: string;
  lightColor?: string;
}): string {
  const preferLight = themeCanonical.value === 'light';
  if (role.separateThemeColors) {
    const branch = preferLight ? role.lightColor : role.darkColor;
    const merged = (branch ?? '').trim() || (role.color ?? '').trim();
    return merged;
  }
  return (role.color ?? '').trim();
}

let escStop: (() => void) | null = null;
watch(permissionPreviewModalOpen, (open) => {
  escStop?.();
  escStop = null;
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') permissionPreviewModalOpen.value = false;
  };
  window.addEventListener('keydown', onKey);
  escStop = () => window.removeEventListener('keydown', onKey);
});

let defaultOnJoinEscStop: (() => void) | null = null;
watch(defaultOnJoinWarningOpen, (open) => {
  defaultOnJoinEscStop?.();
  defaultOnJoinEscStop = null;
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') defaultOnJoinWarningOpen.value = false;
  };
  window.addEventListener('keydown', onKey);
  defaultOnJoinEscStop = () => window.removeEventListener('keydown', onKey);
});

watch(devModeIdsEnabled, (enabled) => {
  if (!enabled) permissionPreviewModalOpen.value = false;
});

const showCategorySettingsPanel = computed(
  () =>
    props.roleCategoryUiEnabled &&
    !props.echoRolesLocked &&
    props.selectedRoleCategoryTabId !== 'all' &&
    props.roleCategoryListExtra === 'settings',
);

const roleCategoryDropdownOptions = computed(() => [
  { label: 'None', value: '' },
  ...props.echoRoleCategories.map((c) => ({
    label: c.name,
    value: c.id,
  })),
]);

function categoryRoleCount(catId: string) {
  return props.roleManagerRoles.filter((r) => r.roleCategoryId === catId)
    .length;
}

function onDropRoleOnCategoryTab(ev: DragEvent, tab: 'all' | string) {
  const id = ev.dataTransfer?.getData('text/plain')?.trim();
  if (!id) return;
  if (tab === 'all') props.assignRoleToCategory(id, null);
  else props.assignRoleToCategory(id, tab);
}

function scrollToRolesListPanel() {
  document
    .getElementById('server-settings-roles-list-panel')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const roleListContextMenu = ref<{
  x: number;
  y: number;
  roleId: string;
  hasCategory: boolean;
} | null>(null);

const roleListContextMenuStyle = computed(() => {
  const m = roleListContextMenu.value;
  if (!m) return {};
  const pad = 10;
  const menuW = 200;
  const rowH = 36;
  const rows = 1 + (m.hasCategory && props.roleCategoryUiEnabled ? 1 : 0);
  const menuH = 8 + rows * rowH;
  let left = m.x;
  let top = m.y;
  if (left + menuW > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - menuW - pad);
  }
  if (top + menuH > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - menuH - pad);
  }
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  return {
    position: 'fixed' as const,
    left: `${left}px`,
    top: `${top}px`,
    minWidth: `${menuW}px`,
  };
});

function onRoleRowContextMenu(
  ev: MouseEvent,
  role: { id: string; name: string; roleCategoryId?: string | null },
) {
  if (props.echoRolesLocked) return;
  if (role.name === '@everyone') return;
  ev.preventDefault();
  ev.stopPropagation();
  const rc = role.roleCategoryId;
  roleListContextMenu.value = {
    x: ev.clientX,
    y: ev.clientY,
    roleId: role.id,
    hasCategory: !!(rc && String(rc).trim()),
  };
}

function closeRoleListContextMenu() {
  roleListContextMenu.value = null;
}

function contextMenuDeleteRole() {
  const id = roleListContextMenu.value?.roleId;
  closeRoleListContextMenu();
  if (id) props.deleteRole(id);
}

function contextMenuRemoveFromCategory() {
  const ctx = roleListContextMenu.value;
  closeRoleListContextMenu();
  if (ctx?.roleId && props.roleCategoryUiEnabled) {
    props.assignRoleToCategory(ctx.roleId, null);
  }
}

function onRoleRowClick(
  ev: MouseEvent,
  role: { id: string; name: string; roleCategoryId?: string | null },
) {
  if (ev.shiftKey && !props.echoRolesLocked && role.name !== '@everyone') {
    ev.preventDefault();
    props.deleteRole(role.id);
    return;
  }
  emit('update:selectedRoleId', role.id);
}

let roleListContextMenuKeyHandler: ((e: KeyboardEvent) => void) | null = null;
watch(roleListContextMenu, (v) => {
  if (roleListContextMenuKeyHandler) {
    window.removeEventListener('keydown', roleListContextMenuKeyHandler);
    roleListContextMenuKeyHandler = null;
  }
  if (!v) return;
  roleListContextMenuKeyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeRoleListContextMenu();
  };
  window.addEventListener('keydown', roleListContextMenuKeyHandler);
});
onUnmounted(() => {
  escStop?.();
  defaultOnJoinEscStop?.();
  if (roleListContextMenuKeyHandler) {
    window.removeEventListener('keydown', roleListContextMenuKeyHandler);
  }
});
</script>

<template>
  <div
    class="server-settings-roles-layout @container flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden"
  >
    <div
      class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden @min-[600px]:flex-row @min-[600px]:items-stretch @min-[600px]:gap-4"
    >
      <div
        id="server-settings-roles-list-panel"
        class="roles-panel roles-panel--left flex min-h-0 w-full max-h-[min(52vh,28rem)] flex-col rounded-2xl p-5 @min-[600px]:max-h-none @min-[600px]:max-w-[360px] @min-[600px]:shrink-0"
      >
        <div class="roles-toolbar shrink-0">
          <input
            :value="props.roleManagerSearchQuery"
            class="roles-toolbar-search min-w-0 flex-1"
            type="text"
            placeholder="Search roles"
            @input="
              $emit(
                'update:roleManagerSearchQuery',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
          <span class="text-fg-subtle">|</span>
          <button
            v-if="!props.echoRolesLocked"
            type="button"
            class="roles-toolbar-add"
            title="Create role"
            @click="
              props.createRole(`New Role ${props.roleManagerRoles.length + 1}`)
            "
          >
            +
          </button>
        </div>

        <div
          v-if="props.roleCategoryUiEnabled"
          class="mt-3 flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            class="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
            :class="
              props.selectedRoleCategoryTabId === 'all'
                ? 'bg-glass-3 text-fg'
                : 'text-fg-subtle hover:bg-glass-hover hover:text-fg-soft'
            "
            @click="$emit('update:selectedRoleCategoryTabId', 'all')"
            @dragover.prevent
            @drop.prevent="onDropRoleOnCategoryTab($event, 'all')"
          >
            All
            <span class="ml-1 text-fg-subtle">{{
              props.roleManagerRoles.length
            }}</span>
          </button>
          <button
            v-for="cat in props.echoRoleCategories"
            :key="cat.id"
            type="button"
            class="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
            :class="
              props.selectedRoleCategoryTabId === cat.id
                ? 'bg-glass-3 text-fg'
                : 'text-fg-subtle hover:bg-glass-hover hover:text-fg-soft'
            "
            @click="$emit('update:selectedRoleCategoryTabId', cat.id)"
            @dragover.prevent
            @drop.prevent="onDropRoleOnCategoryTab($event, cat.id)"
          >
            {{ cat.name }}
            <span class="ml-1 text-fg-subtle">{{
              categoryRoleCount(cat.id)
            }}</span>
          </button>
          <button
            v-if="!props.echoRolesLocked"
            type="button"
            class="rounded-full px-3 py-1.5 text-xs font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
            title="New role category"
            @click="props.createRoleCategory()"
          >
            +
          </button>
        </div>

        <div
          class="roles-list-shell mt-4 min-h-0 flex-1 overflow-hidden rounded-2xl"
        >
          <div
            ref="rolesListScrollEl"
            class="custom-scrollbar h-full min-h-0 overflow-y-auto overscroll-contain"
          >
            <div class="divide-y divide-white/5">
              <button
                v-if="
                  props.roleCategoryUiEnabled &&
                  props.selectedRoleCategoryTabId !== 'all' &&
                  !props.echoRolesLocked
                "
                type="button"
                class="w-full px-2 py-2.5 text-left transition-colors"
                :class="
                  props.roleCategoryListExtra === 'settings'
                    ? 'bg-glass-1'
                    : 'hover:bg-glass-hover'
                "
                @click="props.selectRoleCategorySettingsRow()"
              >
                <div class="flex min-w-0 items-center gap-3">
                  <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-glass-2"
                    aria-hidden="true"
                  >
                    <img
                      :src="icons.settings"
                      alt=""
                      class="h-[18px] w-[18px] opacity-[0.55] invert"
                    />
                  </div>
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-fg">
                      Category settings
                    </div>
                    <div class="truncate text-[11px] text-fg-subtle">
                      Rename or delete this category
                    </div>
                  </div>
                </div>
              </button>
              <div
                v-if="props.filteredRoleManagerRoles.length === 0"
                class="px-3 py-8 text-center text-sm text-fg-subtle"
              >
                No roles in this category. Open
                <span class="text-fg-soft">All</span>, drag a role onto this
                tab, or create a role.
              </div>
              <button
                v-for="role in props.filteredRoleManagerRoles"
                :key="role.id"
                type="button"
                :data-role-list-row-id="role.id"
                class="roles-list-row w-full text-left py-3 transition-colors"
                :class="[
                  role.id === props.selectedRoleId &&
                  props.roleCategoryListExtra !== 'settings'
                    ? 'roles-list-row--active'
                    : '',
                  role.id === props.draggingRoleId
                    ? 'roles-list-row--dragging'
                    : '',
                  role.id === props.dragOverRoleId && !props.dragInsertAfter
                    ? 'roles-list-row--drop-before'
                    : '',
                  role.id === props.dragOverRoleId && props.dragInsertAfter
                    ? 'roles-list-row--drop-after'
                    : '',
                ]"
                :draggable="
                  props.rolesDragReorderEnabled && !props.echoRolesLocked
                "
                @click="onRoleRowClick($event, role)"
                @contextmenu="onRoleRowContextMenu($event, role)"
                @mouseenter="$emit('update:hoveredRoleId', role.id)"
                @mouseleave="$emit('update:hoveredRoleId', null)"
                @dragstart="props.onRoleDragStart(role.id, $event)"
                @dragover="props.onRoleDragOver(role.id, $event)"
                @drop.prevent="props.onRoleDrop"
                @dragend="props.onRoleDragEnd"
              >
                <div class="flex items-center justify-between gap-3 px-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <span
                      class="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
                    >
                      <img
                        v-if="managedRoleIconSrc(role)"
                        :src="managedRoleIconSrc(role)"
                        alt=""
                        class="h-3.5 w-3.5 rounded-[4px] object-contain"
                      />
                      <span
                        v-else
                        class="role-color-dot h-3.5 w-3.5 rounded-full shrink-0"
                        :class="
                          isColorlessRole(roleListResolvedColor(role))
                            ? 'role-color-dot--colorless'
                            : ''
                        "
                        :style="roleColorStyle(roleListResolvedColor(role))"
                      />
                    </span>
                    <div class="min-w-0">
                      <div
                        class="truncate font-semibold"
                        :style="roleNameStyle(roleListResolvedColor(role))"
                      >
                        {{ role.name }}
                      </div>
                      <div class="text-sm text-fg-soft">
                        {{ role.memberCount }} member{{
                          role.memberCount === 1 ? '' : 's'
                        }}
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <input
                      v-if="
                        role.id === props.selectedRoleId ||
                        role.id === props.hoveredRoleId
                      "
                      class="roles-position-input rounded-lg px-2 py-1 text-center text-[11px] font-semibold text-fg-soft outline-none"
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      :value="props.rolePosition(role.id) ?? 1"
                      @click.stop
                      @keydown.enter.stop="
                        props.setRolePosition(
                          role.id,
                          Number(
                            ($event.target as HTMLInputElement).value || 1,
                          ),
                        )
                      "
                      @blur.stop="
                        props.setRolePosition(
                          role.id,
                          Number(
                            ($event.target as HTMLInputElement).value || 1,
                          ),
                        )
                      "
                    />
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div
          v-if="showCategorySettingsPanel"
          class="roles-panel roles-panel--right flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl p-5"
        >
          <div class="mb-3 shrink-0 block @min-[600px]:hidden">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
              @click="scrollToRolesListPanel"
            >
              <span class="text-base leading-none" aria-hidden="true">←</span>
              Roles list
            </button>
          </div>
          <div class="shrink-0">
            <div class="text-lg font-bold text-fg-strong">
              Category settings
            </div>
            <p class="mt-1 text-sm text-fg-subtle">
              Names save immediately. Role list changes use
              <span class="text-fg-soft">Save changes</span> below.
            </p>
          </div>
          <div
            class="custom-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
          >
            <div class="server-settings-role-fields">
              <div class="server-settings-role-field">
                <label class="settings-label">Name</label>
                <input
                  :value="props.categorySettingsNameDraft"
                  class="server-input server-input--borderless w-full"
                  type="text"
                  :disabled="props.categorySettingsSaving"
                  @input="
                    $emit(
                      'update:categorySettingsNameDraft',
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </div>
              <div
                v-if="props.categorySettingsError"
                class="echo-error-banner rounded-lg px-3 py-2 text-sm"
              >
                {{ props.categorySettingsError }}
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="rounded-lg bg-glass-2 px-3 py-2 text-xs font-semibold text-fg transition-colors hover:bg-glass-active disabled:opacity-50"
                  :disabled="props.categorySettingsSaving"
                  @click="props.saveRoleCategorySettings()"
                >
                  {{
                    props.categorySettingsSaving ? 'Saving…' : 'Save category'
                  }}
                </button>
                <button
                  type="button"
                  class="echo-destructive-action rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
                  :disabled="props.categorySettingsSaving"
                  @click="props.deleteActiveRoleCategory()"
                >
                  Delete category
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          v-else-if="props.selectedRole"
          class="roles-panel roles-panel--right flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl p-5"
        >
          <div class="mb-3 shrink-0 block @min-[600px]:hidden">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
              @click="scrollToRolesListPanel"
            >
              <span class="text-base leading-none" aria-hidden="true">←</span>
              Roles list
            </button>
          </div>
          <div class="flex shrink-0 items-center justify-between gap-4">
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
              >
                <img
                  v-if="managedRoleIconSrc(props.selectedRole)"
                  :src="managedRoleIconSrc(props.selectedRole)"
                  alt=""
                  class="h-3.5 w-3.5 rounded-[4px] object-contain"
                />
                <span
                  v-else
                  class="role-color-dot h-3.5 w-3.5 shrink-0 rounded-full"
                  :class="
                    isColorlessRole(props.selectedRole.color)
                      ? 'role-color-dot--colorless'
                      : ''
                  "
                  :style="roleColorStyle(props.selectedRole.color)"
                />
              </span>
              <div class="min-w-0">
                <div class="settings-subtitle truncate">
                  {{ props.selectedRole.name }}
                </div>
              </div>
            </div>
            <div class="relative self-center">
              <button
                type="button"
                class="role-menu-trigger"
                @click.stop="$emit('update:roleMenuOpen', !props.roleMenuOpen)"
              >
                ···
              </button>
              <div
                v-if="props.roleMenuOpen"
                class="role-menu-popout"
                @click.stop
              >
                <button
                  v-if="devModeIdsEnabled"
                  type="button"
                  class="role-menu-item"
                  :disabled="props.selectedRole.id === props.previewedRoleId"
                  :class="
                    props.selectedRole.id === props.previewedRoleId
                      ? 'opacity-60 cursor-default'
                      : ''
                  "
                  @click="
                    props.selectedRole.id === props.previewedRoleId
                      ? undefined
                      : ($emit('preview-selected-role'),
                        $emit('update:roleMenuOpen', false))
                  "
                >
                  {{
                    props.selectedRole.id === props.previewedRoleId
                      ? 'Previewing this role'
                      : 'Preview as role'
                  }}
                </button>
                <button
                  type="button"
                  class="role-menu-item role-menu-item--danger"
                  @click="
                    props.deleteRole(props.selectedRole.id);
                    $emit('update:roleMenuOpen', false);
                  "
                >
                  Delete role
                </button>
              </div>
            </div>
          </div>

          <div class="mt-5 shrink-0">
            <div class="roles-editor-tabs inline-flex flex-wrap gap-1">
              <button
                type="button"
                class="roles-editor-tab"
                :class="
                  props.roleEditorTab === 'display'
                    ? 'roles-editor-tab--active'
                    : ''
                "
                @click="$emit('update:roleEditorTab', 'display')"
              >
                Overview
              </button>
              <button
                v-if="!isVisualRole"
                type="button"
                class="roles-editor-tab"
                :class="
                  props.roleEditorTab === 'permissions'
                    ? 'roles-editor-tab--active'
                    : ''
                "
                @click="$emit('update:roleEditorTab', 'permissions')"
              >
                Permissions
              </button>
              <button
                type="button"
                class="roles-editor-tab"
                :class="
                  props.roleEditorTab === 'members'
                    ? 'roles-editor-tab--active'
                    : ''
                "
                @click="$emit('update:roleEditorTab', 'members')"
              >
                Members
              </button>
              <button
                v-if="!isVisualRole"
                type="button"
                class="roles-editor-tab"
                :class="
                  permissionPreviewModalOpen ? 'roles-editor-tab--active' : ''
                "
                @click="permissionPreviewModalOpen = true"
              >
                Preview
              </button>
            </div>
          </div>

          <div
            class="custom-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
          >
            <div
              v-if="props.roleEditorTab === 'display'"
              class="server-settings-role-fields"
            >
              <div class="server-settings-role-field">
                <label class="settings-label">Name</label>
                <div class="flex items-stretch gap-2">
                  <RoleIconPickerField
                    v-if="props.selectedRole.name !== '@everyone'"
                    class="self-center"
                    :server-id="props.roleIconPickerServerId"
                    :disabled="props.echoRolesLocked"
                    :role-icon-url="props.selectedRole.roleIconUrl"
                    :accent-color="roleListResolvedColor(props.selectedRole)"
                    @pick-entry="
                      props.setSelectedRoleIconFromPickerEntry?.($event)
                    "
                    @pick-app-icon="
                      props.setSelectedRoleIconFromAppIcon?.($event)
                    "
                    @upload-file="props.uploadSelectedRoleIcon?.($event)"
                    @pick-external-url="
                      props.setSelectedRoleIconFromExternalUrl?.($event)
                    "
                    @clear="props.clearSelectedRoleIcon?.()"
                  />
                  <input
                    v-model="props.selectedRole.name"
                    class="server-input server-input--borderless min-w-0 flex-1 self-center"
                    type="text"
                  />
                </div>
              </div>
              <div
                v-if="
                  props.roleCategoryUiEnabled &&
                  props.selectedRole.name !== '@everyone'
                "
                class="server-settings-role-field"
              >
                <EchoDropdown
                  :model-value="props.selectedRole.roleCategoryId ?? ''"
                  :options="roleCategoryDropdownOptions"
                  label="Category"
                  surface="server"
                  borderless
                  teleport-menu
                  menu-match-trigger-width
                  @update:model-value="
                    props.assignRoleToCategory(
                      props.selectedRole!.id,
                      $event.trim() ? $event : null,
                    )
                  "
                />
                <p class="text-[11px] leading-snug text-fg-subtle">
                  Categories only organize this list (like emoji packs). Drag a
                  role onto a tab or pick here. Save changes to sync.
                </p>
              </div>
              <div
                v-if="props.selectedRole.name !== '@everyone'"
                class="server-settings-role-field"
              >
                <label
                  id="server-settings-role-type-label"
                  class="settings-label"
                  >Role type</label
                >
                <EchoSegmentedControl
                  class="w-full min-w-0"
                  :model-value="selectedEchoRoleType"
                  :options="ROLE_TYPE_UI_OPTIONS"
                  aria-labelledby="server-settings-role-type-label"
                  :disabled="props.echoRolesLocked"
                  @update:model-value="
                    props.setSelectedRoleType($event as EchoRoleType)
                  "
                />
                <p class="text-[11px] leading-snug text-fg-subtle">
                  Mixed matches the compact role model. Authority stays off the
                  public role list for members without Manage Roles. Visual is
                  cosmetic only (no permission grants).
                </p>
              </div>
              <template v-if="isMixedRole || isVisualRole">
                <template v-if="isMixedRole">
                  <div class="server-settings-role-field roles-display-color">
                    <div class="flex items-center justify-between gap-3">
                      <label class="settings-label">Color</label>
                      <label
                        class="inline-flex items-center gap-2 text-xs text-fg-soft"
                      >
                        <span>Split dark/light</span>
                        <input
                          type="checkbox"
                          class="server-toggle"
                          :checked="props.selectedRole.separateThemeColors"
                          @change="
                            props.setSeparateThemeColors(
                              ($event.target as HTMLInputElement).checked,
                            )
                          "
                        />
                      </label>
                    </div>

                    <div
                      v-if="!props.selectedRole.separateThemeColors"
                      class="mt-2 roles-color-layout"
                    >
                      <div class="roles-color-left">
                        <button
                          type="button"
                          class="roles-color-rect roles-color-rect--custom"
                          title="Custom color"
                          @click="props.openRoleCustomPanel('single')"
                        >
                          Custom
                        </button>
                        <div
                          class="roles-color-rect roles-color-rect--selected"
                          :class="
                            isColorlessRole(props.selectedRole.color)
                              ? 'roles-color-rect--colorless'
                              : ''
                          "
                          :style="roleColorStyle(props.selectedRole.color)"
                        />
                      </div>
                      <div class="roles-color-grid">
                        <button
                          v-for="preset in ROLE_COLOR_PRESETS"
                          :key="`single-${preset.value || 'colorless'}`"
                          type="button"
                          class="roles-color-rect roles-color-rect--swatch"
                          :class="[
                            isActivePreset(
                              props.selectedRole.color,
                              preset.value,
                            )
                              ? 'roles-color-rect--active'
                              : '',
                            isColorlessRole(preset.value)
                              ? 'roles-color-rect--colorless'
                              : '',
                          ]"
                          :style="roleColorStyle(preset.value)"
                          :title="preset.label"
                          :aria-label="preset.label"
                          @click="
                            props.selectRoleColorPreset('single', preset.value)
                          "
                        />
                      </div>
                    </div>

                    <template v-if="props.selectedRole.separateThemeColors">
                      <div class="mt-3">
                        <label class="settings-label settings-label--with-icon">
                          <img
                            :src="icons.moon"
                            alt=""
                            class="h-3.5 w-3.5 opacity-85 filter invert"
                          />
                          <span>Color Dark</span>
                        </label>
                        <div class="mt-2 roles-color-layout">
                          <div class="roles-color-left">
                            <button
                              type="button"
                              class="roles-color-rect roles-color-rect--custom"
                              @click="props.openRoleCustomPanel('dark')"
                            >
                              Custom
                            </button>
                            <div
                              class="roles-color-rect roles-color-rect--selected"
                              :class="
                                isColorlessRole(props.selectedRole.darkColor)
                                  ? 'roles-color-rect--colorless'
                                  : ''
                              "
                              :style="
                                roleColorStyle(props.selectedRole.darkColor)
                              "
                            />
                          </div>
                          <div class="roles-color-grid">
                            <button
                              v-for="preset in ROLE_COLOR_PRESETS"
                              :key="`dark-${preset.value || 'colorless'}`"
                              type="button"
                              class="roles-color-rect roles-color-rect--swatch"
                              :class="[
                                isActivePreset(
                                  props.selectedRole.darkColor,
                                  preset.value,
                                )
                                  ? 'roles-color-rect--active'
                                  : '',
                                isColorlessRole(preset.value)
                                  ? 'roles-color-rect--colorless'
                                  : '',
                              ]"
                              :style="roleColorStyle(preset.value)"
                              :title="preset.label"
                              :aria-label="preset.label"
                              @click="
                                props.selectRoleColorPreset(
                                  'dark',
                                  preset.value,
                                )
                              "
                            />
                          </div>
                        </div>
                      </div>
                      <div class="mt-3">
                        <label class="settings-label settings-label--with-icon">
                          <img
                            :src="icons.sun"
                            alt=""
                            class="h-3.5 w-3.5 opacity-85 filter invert"
                          />
                          <span>Color Light</span>
                        </label>
                        <div class="mt-2 roles-color-layout">
                          <div class="roles-color-left">
                            <button
                              type="button"
                              class="roles-color-rect roles-color-rect--custom"
                              @click="props.openRoleCustomPanel('light')"
                            >
                              Custom
                            </button>
                            <div
                              class="roles-color-rect roles-color-rect--selected"
                              :class="
                                isColorlessRole(props.selectedRole.lightColor)
                                  ? 'roles-color-rect--colorless'
                                  : ''
                              "
                              :style="
                                roleColorStyle(props.selectedRole.lightColor)
                              "
                            />
                          </div>
                          <div class="roles-color-grid">
                            <button
                              v-for="preset in ROLE_COLOR_PRESETS"
                              :key="`light-${preset.value || 'colorless'}`"
                              type="button"
                              class="roles-color-rect roles-color-rect--swatch"
                              :class="[
                                isActivePreset(
                                  props.selectedRole.lightColor,
                                  preset.value,
                                )
                                  ? 'roles-color-rect--active'
                                  : '',
                                isColorlessRole(preset.value)
                                  ? 'roles-color-rect--colorless'
                                  : '',
                              ]"
                              :style="roleColorStyle(preset.value)"
                              :title="preset.label"
                              :aria-label="preset.label"
                              @click="
                                props.selectRoleColorPreset(
                                  'light',
                                  preset.value,
                                )
                              "
                            />
                          </div>
                        </div>
                      </div>
                    </template>

                    <div
                      v-if="props.roleCustomPanelOpen"
                      class="roles-custom-panel mt-3"
                    >
                      <div class="roles-wheel-row">
                        <canvas
                          :ref="onColorWheelCanvasRef"
                          width="220"
                          height="220"
                          class="roles-color-wheel"
                          @mousedown.prevent="props.onWheelPointerDown"
                        />
                        <div class="roles-input-col">
                          <input
                            :value="props.roleHexInput"
                            class="roles-custom-hex"
                            type="text"
                            placeholder="#RRGGBB, rgb(...), hsl(...)"
                            @input="
                              $emit(
                                'update:roleHexInput',
                                ($event.target as HTMLInputElement).value,
                              )
                            "
                            @blur="props.onPickerHexBlur"
                            @keydown.enter.prevent="props.onPickerHexBlur"
                          />
                          <div class="roles-input-group mt-2">
                            <label class="roles-input-label">RGB</label>
                            <div class="roles-input-row">
                              <div class="roles-step-input">
                                <input
                                  :value="props.roleRInput"
                                  class="roles-mini-input roles-mini-input--step"
                                  type="number"
                                  min="0"
                                  max="255"
                                  @input="
                                    $emit(
                                      'update:roleRInput',
                                      Number(
                                        ($event.target as HTMLInputElement)
                                          .value,
                                      ),
                                    )
                                  "
                                  @blur="props.onRgbInputsBlur"
                                  @keydown.up.prevent="props.nudgeRgb('r', 1)"
                                  @keydown.down.prevent="
                                    props.nudgeRgb('r', -1)
                                  "
                                />
                                <div class="roles-step-stack">
                                  <button
                                    type="button"
                                    class="roles-step-btn roles-step-btn--up"
                                    @click="props.nudgeRgb('r', 1)"
                                  >
                                    ▴
                                  </button>
                                  <button
                                    type="button"
                                    class="roles-step-btn roles-step-btn--down"
                                    @click="props.nudgeRgb('r', -1)"
                                  >
                                    ▾
                                  </button>
                                </div>
                              </div>
                              <div class="roles-step-input">
                                <input
                                  :value="props.roleGInput"
                                  class="roles-mini-input roles-mini-input--step"
                                  type="number"
                                  min="0"
                                  max="255"
                                  @input="
                                    $emit(
                                      'update:roleGInput',
                                      Number(
                                        ($event.target as HTMLInputElement)
                                          .value,
                                      ),
                                    )
                                  "
                                  @blur="props.onRgbInputsBlur"
                                  @keydown.up.prevent="props.nudgeRgb('g', 1)"
                                  @keydown.down.prevent="
                                    props.nudgeRgb('g', -1)
                                  "
                                />
                                <div class="roles-step-stack">
                                  <button
                                    type="button"
                                    class="roles-step-btn roles-step-btn--up"
                                    @click="props.nudgeRgb('g', 1)"
                                  >
                                    ▴
                                  </button>
                                  <button
                                    type="button"
                                    class="roles-step-btn roles-step-btn--down"
                                    @click="props.nudgeRgb('g', -1)"
                                  >
                                    ▾
                                  </button>
                                </div>
                              </div>
                              <div class="roles-step-input">
                                <input
                                  :value="props.roleBInput"
                                  class="roles-mini-input roles-mini-input--step"
                                  type="number"
                                  min="0"
                                  max="255"
                                  @input="
                                    $emit(
                                      'update:roleBInput',
                                      Number(
                                        ($event.target as HTMLInputElement)
                                          .value,
                                      ),
                                    )
                                  "
                                  @blur="props.onRgbInputsBlur"
                                  @keydown.up.prevent="props.nudgeRgb('b', 1)"
                                  @keydown.down.prevent="
                                    props.nudgeRgb('b', -1)
                                  "
                                />
                                <div class="roles-step-stack">
                                  <button
                                    type="button"
                                    class="roles-step-btn roles-step-btn--up"
                                    @click="props.nudgeRgb('b', 1)"
                                  >
                                    ▴
                                  </button>
                                  <button
                                    type="button"
                                    class="roles-step-btn roles-step-btn--down"
                                    @click="props.nudgeRgb('b', -1)"
                                  >
                                    ▾
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div class="roles-input-group mt-2">
                            <label class="roles-input-label">HSL</label>
                            <div class="roles-input-row">
                              <div class="roles-step-input">
                                <input
                                  :value="props.roleHInput"
                                  class="roles-mini-input roles-mini-input--step"
                                  type="number"
                                  min="0"
                                  max="360"
                                  @input="
                                    $emit(
                                      'update:roleHInput',
                                      Number(
                                        ($event.target as HTMLInputElement)
                                          .value,
                                      ),
                                    )
                                  "
                                  @blur="props.onHslInputsBlur"
                                  @keydown.up.prevent="props.nudgeHsl('h', 1)"
                                  @keydown.down.prevent="
                                    props.nudgeHsl('h', -1)
                                  "
                                />
                                <div class="roles-step-stack">
                                  <button
                                    type="button"
                                    class="roles-step-btn roles-step-btn--up"
                                    @click="props.nudgeHsl('h', 1)"
                                  >
                                    ▴
                                  </button>
                                  <button
                                    type="button"
                                    class="roles-step-btn roles-step-btn--down"
                                    @click="props.nudgeHsl('h', -1)"
                                  >
                                    ▾
                                  </button>
                                </div>
                              </div>
                              <div class="roles-step-input">
                                <input
                                  :value="props.roleSInput"
                                  class="roles-mini-input roles-mini-input--step"
                                  type="number"
                                  min="0"
                                  max="100"
                                  @input="
                                    $emit(
                                      'update:roleSInput',
                                      Number(
                                        ($event.target as HTMLInputElement)
                                          .value,
                                      ),
                                    )
                                  "
                                  @blur="props.onHslInputsBlur"
                                  @keydown.up.prevent="props.nudgeHsl('s', 1)"
                                  @keydown.down.prevent="
                                    props.nudgeHsl('s', -1)
                                  "
                                />
                                <div class="roles-step-stack">
                                  <button
                                    type="button"
                                    class="roles-step-btn roles-step-btn--up"
                                    @click="props.nudgeHsl('s', 1)"
                                  >
                                    ▴
                                  </button>
                                  <button
                                    type="button"
                                    class="roles-step-btn roles-step-btn--down"
                                    @click="props.nudgeHsl('s', -1)"
                                  >
                                    ▾
                                  </button>
                                </div>
                              </div>
                              <div class="roles-step-input">
                                <input
                                  :value="props.roleLInput"
                                  class="roles-mini-input roles-mini-input--step"
                                  type="number"
                                  min="0"
                                  max="100"
                                  @input="
                                    $emit(
                                      'update:roleLInput',
                                      Number(
                                        ($event.target as HTMLInputElement)
                                          .value,
                                      ),
                                    )
                                  "
                                  @blur="props.onHslInputsBlur"
                                  @keydown.up.prevent="props.nudgeHsl('l', 1)"
                                  @keydown.down.prevent="
                                    props.nudgeHsl('l', -1)
                                  "
                                />
                                <div class="roles-step-stack">
                                  <button
                                    type="button"
                                    class="roles-step-btn roles-step-btn--up"
                                    @click="props.nudgeHsl('l', 1)"
                                  >
                                    ▴
                                  </button>
                                  <button
                                    type="button"
                                    class="roles-step-btn roles-step-btn--down"
                                    @click="props.nudgeHsl('l', -1)"
                                  >
                                    ▾
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
                <template v-else-if="isVisualRole">
                  <div class="server-settings-role-field roles-display-color">
                    <label class="settings-label">Color</label>
                    <div class="mt-2 roles-color-layout">
                      <div class="roles-color-left">
                        <button
                          type="button"
                          class="roles-color-rect roles-color-rect--custom"
                          title="Custom color"
                          @click="props.openRoleCustomPanel('single')"
                        >
                          Custom
                        </button>
                        <div
                          class="roles-color-rect roles-color-rect--selected"
                          :class="
                            isColorlessRole(props.selectedRole.color)
                              ? 'roles-color-rect--colorless'
                              : ''
                          "
                          :style="roleColorStyle(props.selectedRole.color)"
                        />
                      </div>
                      <div class="roles-color-grid">
                        <button
                          v-for="preset in ROLE_COLOR_PRESETS"
                          :key="`vis-${preset.value || 'colorless'}`"
                          type="button"
                          class="roles-color-rect roles-color-rect--swatch"
                          :class="[
                            isActivePreset(
                              props.selectedRole.color,
                              preset.value,
                            )
                              ? 'roles-color-rect--active'
                              : '',
                            isColorlessRole(preset.value)
                              ? 'roles-color-rect--colorless'
                              : '',
                          ]"
                          :style="roleColorStyle(preset.value)"
                          :title="preset.label"
                          :aria-label="preset.label"
                          @click="
                            props.selectRoleColorPreset('single', preset.value)
                          "
                        />
                      </div>
                    </div>
                    <p class="mt-3 text-xs leading-relaxed text-fg-subtle">
                      Visual roles only change how this role looks in the UI;
                      they never grant server permission flags.
                    </p>
                  </div>
                </template>

                <div class="mt-4 space-y-2">
                  <label class="role-permission-row roles-display-option">
                    <div>
                      <div class="font-medium text-fg">
                        Display role separately in member list
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      class="server-toggle"
                      :checked="props.selectedRole.displaySeparately"
                      @change="
                        props.setSelectedRoleDisplaySeparately(
                          ($event.target as HTMLInputElement).checked,
                        )
                      "
                    />
                  </label>
                  <label
                    v-if="props.selectedRole.name !== '@everyone'"
                    class="role-permission-row roles-display-option"
                  >
                    <div>
                      <div class="font-medium text-fg">
                        Default role — assign to new members
                      </div>
                      <div class="text-xs text-fg-subtle">
                        Everyone already has @everyone; use this for extra roles
                        (for example Member).
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      class="server-toggle"
                      :checked="props.selectedRole.defaultOnJoin"
                      @change="onDefaultOnJoinCheckboxChange"
                    />
                  </label>
                  <div
                    v-if="props.selectedRole.name !== '@everyone'"
                    class="mt-4 space-y-3 border-t border-border pt-4"
                    role="region"
                    aria-labelledby="linked-roles-section-title"
                  >
                    <div
                      id="linked-roles-section-title"
                      class="settings-subtitle"
                    >
                      Linked roles
                    </div>
                    <label class="role-permission-row roles-display-option">
                      <div>
                        <div class="font-medium text-fg">
                          Link other roles when this one is assigned
                        </div>
                        <div
                          v-if="!linkedRolesDisclosureOpen"
                          class="text-xs text-fg-subtle"
                        >
                          <template
                            v-if="(props.selectedRole.linkedRoles ?? []).length"
                          >
                            {{
                              (props.selectedRole.linkedRoles ?? []).length ===
                              1
                                ? '1 linked role is saved. Turn on to view or edit.'
                                : `${(props.selectedRole.linkedRoles ?? []).length} linked roles are saved. Turn on to view or edit.`
                            }}
                          </template>
                          <template v-else>
                            Optional — also assign other roles automatically.
                          </template>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        class="server-toggle"
                        :checked="linkedRolesDisclosureOpen"
                        aria-controls="linked-roles-panel"
                        @change="onLinkedRolesDisclosureChange"
                      />
                    </label>
                    <div
                      v-show="linkedRolesDisclosureOpen"
                      id="linked-roles-panel"
                      class="space-y-3"
                      role="group"
                      aria-label="Linked role picker and list"
                    >
                      <p class="text-xs text-fg-subtle">
                        When this role is assigned, also assign the roles below.
                        <span class="text-fg-subtle">One-way</span> applies from
                        this role only;
                        <span class="text-fg-subtle">two-way</span> mirrors when
                        the other role is assigned alone.
                      </p>
                      <ul
                        v-if="(props.selectedRole.linkedRoles ?? []).length"
                        class="space-y-2"
                      >
                        <li
                          v-for="(link, idx) in props.selectedRole.linkedRoles"
                          :key="`${link.linkedRoleId}-${idx}`"
                          class="flex flex-wrap items-center gap-2 rounded-lg bg-glass-1 px-3 py-2"
                        >
                          <span class="min-w-0 flex-1 truncate text-sm text-fg">
                            {{ roleLabelForLink(link.linkedRoleId) }}
                          </span>
                          <EchoDropdown
                            :model-value="link.twoWay ? 'two' : 'one'"
                            :options="LINK_DIRECTION_OPTIONS"
                            surface="server"
                            borderless
                            compact
                            teleport-menu
                            menu-match-trigger-width
                            class="min-w-[9rem] text-sm"
                            :disabled="props.echoRolesLocked"
                            @update:model-value="
                              props.setSelectedRoleLinkTwoWay(
                                Number(idx),
                                $event === 'two',
                              )
                            "
                          />
                          <button
                            type="button"
                            class="echo-destructive-link text-xs hover:underline disabled:opacity-40"
                            :disabled="props.echoRolesLocked"
                            @click="props.removeSelectedRoleLink(Number(idx))"
                          >
                            Remove
                          </button>
                        </li>
                      </ul>
                      <div class="flex flex-wrap items-end gap-2">
                        <label class="flex min-w-[10rem] flex-1 flex-col gap-1">
                          <span class="text-xs text-fg-subtle"
                            >Also assign</span
                          >
                          <EchoDropdown
                            v-model="linkAddRoleId"
                            :options="roleLinkPickDropdownOptions"
                            surface="server"
                            borderless
                            compact
                            teleport-menu
                            menu-match-trigger-width
                            class="w-full text-sm"
                            :disabled="
                              props.echoRolesLocked ||
                              !roleLinkPickOptions.length
                            "
                          />
                        </label>
                        <label class="flex min-w-[8rem] flex-col gap-1">
                          <span class="text-xs text-fg-subtle">Link type</span>
                          <EchoDropdown
                            v-model="linkAddDirection"
                            :options="LINK_DIRECTION_OPTIONS"
                            surface="server"
                            borderless
                            compact
                            teleport-menu
                            menu-match-trigger-width
                            class="w-full text-sm"
                            :disabled="props.echoRolesLocked"
                          />
                        </label>
                        <button
                          type="button"
                          class="rounded-lg bg-glass-2 px-3 py-2 text-sm font-medium hover:bg-glass-3 disabled:opacity-40"
                          :disabled="
                            props.echoRolesLocked ||
                            !linkAddRoleId ||
                            !roleLinkPickOptions.length
                          "
                          @click="submitAddRoleLink"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                  <label class="role-permission-row roles-display-option">
                    <div>
                      <div class="font-medium text-fg">
                        Allow anyone to mention role
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      class="server-toggle"
                      :checked="props.selectedRole.mentionable"
                      @change="
                        props.setSelectedRoleMentionable(
                          ($event.target as HTMLInputElement).checked,
                        )
                      "
                    />
                  </label>
                </div>
              </template>
              <template v-else-if="isAuthorityRole">
                <p class="text-xs leading-relaxed text-fg-subtle">
                  Authority roles skip color and visibility styling. They stay
                  hidden from members who cannot manage roles while still
                  contributing permission grants (see the Permissions tab).
                </p>
              </template>
            </div>

            <div
              v-else-if="props.roleEditorTab === 'permissions'"
              class="space-y-5"
            >
              <template v-if="!isVisualRole">
                <div class="settings-subtitle">Permissions</div>
                <div v-for="group in ROLE_PERMISSION_GROUPS" :key="group">
                  <div
                    v-if="
                      props.visibleRolePermissionDefs.some(
                        (d) => d.group === group,
                      )
                    "
                    class="settings-subtitle"
                  >
                    {{ group }}
                  </div>
                  <div
                    v-if="
                      props.visibleRolePermissionDefs.some(
                        (d) => d.group === group,
                      )
                    "
                    class="roles-permissions-list mt-3 grid gap-2"
                  >
                    <label
                      v-for="perm in props.visibleRolePermissionDefs.filter(
                        (d) => d.group === group,
                      )"
                      :key="perm.key"
                      class="role-permission-row"
                    >
                      <div class="min-w-0">
                        <div class="font-medium text-fg">{{ perm.label }}</div>
                      </div>
                      <input
                        type="checkbox"
                        class="server-toggle"
                        :checked="props.selectedRole.permissions[perm.key]"
                        @change="
                          props.onRolePermissionCheckboxChange(perm.key, $event)
                        "
                      />
                    </label>
                  </div>
                </div>
              </template>
              <p v-else class="text-sm leading-relaxed text-fg-soft">
                Visual roles never grant server permissions in Echo, so there is
                nothing to configure here.
              </p>
            </div>

            <div v-else-if="props.roleEditorTab === 'members'">
              <div
                class="flex flex-wrap items-center justify-between gap-y-2 gap-x-3"
              >
                <div class="settings-subtitle shrink-0">Members</div>
                <button
                  v-if="
                    props.roleQuickAddEnabled &&
                    props.selectedRole?.name !== '@everyone'
                  "
                  type="button"
                  class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-glass-1 px-2.5 py-1.5 text-[12px] font-semibold tracking-wide text-fg shadow-sm transition hover:bg-glass-hover hover:border-border"
                  @click="openQuickAddMembersModal"
                >
                  <span
                    class="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[var(--role-accent,#5865f2)] shadow-inner"
                    :style="{
                      '--role-accent': roleAccentHex(props.selectedRole?.color),
                    }"
                  >
                    <img
                      :src="icons.plus"
                      alt=""
                      class="h-3 w-3 brightness-0 invert opacity-95"
                    />
                  </span>
                  Add members
                </button>
              </div>
              <div
                v-if="props.selectedRoleMembers.length"
                class="mt-3 space-y-2"
              >
                <div
                  v-for="member in props.selectedRoleMembers"
                  :key="member.id"
                  class="role-member-row"
                >
                  <div class="relative h-8 w-8 overflow-hidden rounded-full">
                    <PausedGifAvatar
                      :src="safeImageUrl(member.pfp)"
                      :alt="member.name"
                      :session-key="member.id"
                      img-class="rounded-full object-cover"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-semibold text-fg">
                      {{ member.name }}
                    </div>
                  </div>
                  <span
                    class="text-[11px] uppercase tracking-[0.16em] text-fg-subtle"
                    >{{ member.status }}</span
                  >
                </div>
              </div>
              <div
                v-else
                class="mt-3 rounded-xl bg-glass-1 px-3 py-3 text-sm text-fg-soft"
              >
                No members currently use this role.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="props.roleManagerDirty" class="roles-change-bar shrink-0">
      <div class="text-sm text-fg-soft">You have unsaved role changes.</div>
      <div
        v-if="props.roleSaveError"
        class="echo-error-banner mt-2 rounded-lg px-3 py-2 text-sm"
      >
        {{ props.roleSaveError }}
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg bg-glass-2 px-3 py-1.5 text-xs font-semibold text-fg-soft transition-colors hover:bg-glass-hover"
          :disabled="props.roleSaveLoading"
          @click="props.discardRoleManagerChanges"
        >
          Discard
        </button>
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          :disabled="props.roleSaveLoading"
          @click="props.saveRoleManagerChanges()"
        >
          Save changes
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="permissionPreviewModalOpen"
        class="fixed inset-0 z-[160] flex items-center justify-center bg-overlay-dim px-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-preview-modal-title"
        @click.self="permissionPreviewModalOpen = false"
      >
        <div
          class="flex max-h-[min(90vh,800px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-5"
          @click.stop
        >
          <div
            class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4"
          >
            <h2
              id="permission-preview-modal-title"
              class="text-base font-semibold text-foreground"
            >
              Permission preview
            </h2>
            <button
              type="button"
              class="rounded-lg px-2 py-1 text-lg leading-none text-muted transition-colors hover:bg-glass-tint hover:text-foreground"
              aria-label="Close"
              @click="permissionPreviewModalOpen = false"
            >
              ×
            </button>
          </div>
          <div
            class="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
          >
            <p class="mb-4 text-sm text-muted">
              Effective permissions for your account (server fold, then category
              and channel layers). Requires manage roles or manage server.
            </p>
            <ServerSettingsPermissionPreviewSection
              v-if="props.echoServerIdForPermissionPreview"
              hide-chrome
              :server-id="props.echoServerIdForPermissionPreview"
              :users="props.allUsers"
            />
            <p v-else class="text-sm text-muted">
              Server context is not available for permission preview.
            </p>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="defaultOnJoinWarningOpen"
        class="fixed inset-0 z-[160] flex items-center justify-center bg-overlay-dim px-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="default-on-join-warning-title"
        @click.self="cancelDefaultOnJoinHighRisk"
      >
        <div
          class="flex max-h-[min(90vh,560px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-5"
          @click.stop
        >
          <div
            class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4"
          >
            <h2
              id="default-on-join-warning-title"
              class="text-base font-semibold text-foreground"
            >
              High permissions on default role
            </h2>
            <button
              type="button"
              class="rounded-lg px-2 py-1 text-lg leading-none text-muted transition-colors hover:bg-glass-tint hover:text-foreground"
              aria-label="Close"
              @click="cancelDefaultOnJoinHighRisk"
            >
              ×
            </button>
          </div>
          <div
            class="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4"
          >
            <p class="text-sm text-muted">
              This role has elevated permissions. If it is assigned to every new
              member automatically, everyone joining will receive those
              capabilities—including moderation or server management, if
              enabled.
            </p>
            <ul
              v-if="defaultOnJoinRiskLabels.length"
              class="mt-3 list-inside list-disc space-y-1 text-sm text-muted"
            >
              <li v-for="label in defaultOnJoinRiskLabels" :key="label">
                {{ label }}
              </li>
            </ul>
            <p class="mt-3 text-sm text-muted">
              Only continue if this is intentional (for example a private staff
              server).
            </p>
          </div>
          <div
            class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4"
          >
            <button
              type="button"
              class="rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-glass-tint hover:text-foreground"
              @click="cancelDefaultOnJoinHighRisk"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-amber-600/90 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
              @click="confirmDefaultOnJoinHighRisk"
            >
              Assign to new members anyway
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="quickAddMembersModalOpen"
        class="fixed inset-0 z-[165] flex items-center justify-center bg-overlay-dim px-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-role-members-title"
        @click.self="quickAddMembersModalOpen = false"
      >
        <div
          class="flex max-h-[min(85vh,640px)] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-5"
          @click.stop
        >
          <div
            class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4"
          >
            <div class="min-w-0">
              <h2
                id="quick-add-role-members-title"
                class="truncate text-base font-semibold text-foreground"
              >
                Add members
              </h2>
              <p
                v-if="props.selectedRole"
                class="mt-1 truncate text-xs text-muted"
              >
                <span
                  class="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  :style="{
                    backgroundColor: roleAccentHex(props.selectedRole.color),
                  }"
                />
                {{ props.selectedRole.name }}
              </p>
            </div>
            <button
              type="button"
              class="rounded-lg px-2 py-1 text-lg leading-none text-muted transition-colors hover:bg-glass-tint hover:text-foreground"
              aria-label="Close"
              @click="quickAddMembersModalOpen = false"
            >
              ×
            </button>
          </div>
          <div class="border-b border-border px-5 py-3">
            <label class="sr-only" for="quick-add-role-members-search"
              >Search members</label
            >
            <input
              id="quick-add-role-members-search"
              v-model="quickAddSearchQuery"
              type="search"
              autocomplete="off"
              placeholder="Search members…"
              class="server-input server-input--borderless w-full text-sm"
            />
          </div>
          <div
            class="custom-scrollbar min-h-[200px] flex-1 overflow-y-auto overscroll-contain px-3 py-3"
          >
            <div
              v-if="quickAddError"
              class="echo-error-banner mb-3 rounded-lg px-3 py-2 text-xs"
            >
              {{ quickAddError }}
            </div>
            <ul v-if="quickAddFilteredMembers.length" class="space-y-1.5">
              <li
                v-for="m in quickAddFilteredMembers"
                :key="m.id"
                class="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-glass-hover"
              >
                <div
                  class="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-border"
                >
                  <PausedGifAvatar
                    :src="safeImageUrl(m.pfp)"
                    :alt="m.name"
                    :session-key="m.id"
                    img-class="rounded-full object-cover"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-semibold text-fg">
                    {{ m.name }}
                  </div>
                </div>
                <button
                  v-if="memberAlreadyHasSelectedRole(m.id)"
                  type="button"
                  disabled
                  class="cursor-default rounded-lg bg-glass-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
                >
                  Added
                </button>
                <button
                  v-else
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
                  :disabled="quickAddBusyUserId !== null"
                  :style="{
                    backgroundColor: roleAccentHex(props.selectedRole?.color),
                  }"
                  @click="onQuickAddMember(m.id)"
                >
                  {{ quickAddBusyUserId === m.id ? 'Adding…' : 'Add' }}
                </button>
              </li>
            </ul>
            <p v-else class="px-2 py-8 text-center text-sm text-muted">
              No members match your search.
            </p>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <template v-if="roleListContextMenu">
        <div
          class="fixed inset-0 z-[300]"
          aria-hidden="true"
          @mousedown="closeRoleListContextMenu"
        />
        <div
          class="role-menu-popout z-[301] py-1"
          role="menu"
          :style="roleListContextMenuStyle"
          @mousedown.stop
        >
          <button
            v-if="
              roleListContextMenu.hasCategory && props.roleCategoryUiEnabled
            "
            type="button"
            class="role-menu-item w-full text-left"
            role="menuitem"
            @click="contextMenuRemoveFromCategory"
          >
            Remove from category
          </button>
          <button
            type="button"
            class="role-menu-item role-menu-item--danger w-full text-left"
            role="menuitem"
            @click="contextMenuDeleteRole"
          >
            Delete role
          </button>
        </div>
      </template>
    </Teleport>
  </div>
</template>
