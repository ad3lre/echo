<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue';
import {
  roleHierarchyDisplayRank,
  type MemberProfile,
} from '@/utils/memberProfiles';
import type { EchoRoleCategoryDto } from '@/api/echo/types';
import { memberPopoutRoleAccentColor } from '@/utils/memberPopoutRoleChipStyle';
import { useThemeStore } from '@/stores/theme';
import { memberRoleIconImgSrc } from '@/utils/memberRoleIconDisplay';

const props = defineProps<{
  profile: MemberProfile;
  roleManagement: {
    enabled: boolean;
    assignableRoles: {
      id: string;
      name: string;
      color: string;
      darkColor?: string;
      lightColor?: string;
      separateThemeColors?: boolean;
      roleIconUrl?: string | null;
      roleIconEmojiId?: string | null;
      isEveryone?: boolean;
      position?: number;
      roleCategoryId?: string | null;
    }[];
    roleCategories?: EchoRoleCategoryDto[];
    canMutateMemberRole?: (
      targetUserId: string,
      roleId: string,
      assign: boolean,
    ) => boolean;
    busy?: boolean;
    resolveAssignedRoleIds: (userId: string) => string[];
    onToggleRole: (payload: {
      targetUserId: string;
      roleId: string;
      assign: boolean;
    }) => void | Promise<void>;
  };
  assignedRoleIds: string[];
  optimisticAssign: Record<string, boolean>;
  pendingRoleIds: Set<string>;
  popupStyle: CSSProperties;
}>();

defineEmits<{
  close: [];
}>();

const themeStore = useThemeStore();

function roleOptionDotStyle(role: {
  color: string;
  darkColor?: string;
  lightColor?: string;
  separateThemeColors?: boolean;
}): Record<string, string> {
  const fill = memberPopoutRoleAccentColor(
    role,
    themeStore.canonicalTheme === 'light',
  );
  if (!fill) return {};
  return { backgroundColor: fill, border: 'none' };
}

const roleSearchQuery = ref('');
const rolePopupPanelRef = ref<HTMLElement | null>(null);
/** `all` | category id | `uncategorized` */
const activeRoleGroupTabId = ref<'all' | 'uncategorized' | string>('all');

function roleManagementIconSrc(role: {
  roleIconUrl?: string | null;
  roleIconEmojiId?: string | null;
}) {
  return memberRoleIconImgSrc({
    iconUrl: role.roleIconUrl,
    iconEmojiId: role.roleIconEmojiId,
  });
}

const manageableRoles = computed(() => {
  const rm = props.roleManagement;
  if (!rm?.enabled) return [];
  const list = rm.assignableRoles.filter((role) => !role.isEveryone);
  const sorted = [...list].sort(
    (a, b) =>
      roleHierarchyDisplayRank(b.name, b.position) -
      roleHierarchyDisplayRank(a.name, a.position),
  );
  const gate = rm.canMutateMemberRole;
  if (!gate) return sorted;
  return sorted.filter((role) => {
    if (props.assignedRoleIds.includes(role.id)) return true;
    return gate(props.profile.id, role.id, true);
  });
});

const everyoneRole = computed(() => {
  const rm = props.roleManagement;
  if (!rm?.enabled) return null;
  return rm.assignableRoles.find((r) => r.isEveryone) ?? null;
});

const sortedRoleCategories = computed(() => {
  const rm = props.roleManagement;
  const raw = rm?.roleCategories;
  if (!raw?.length) return [];
  return [...raw].sort((a, b) => a.position - b.position);
});

const showRoleGroupTabs = computed(() => sortedRoleCategories.value.length > 0);

watch(
  () => props.profile.id,
  () => {
    activeRoleGroupTabId.value = 'all';
    roleSearchQuery.value = '';
  },
);

watch(showRoleGroupTabs, (on) => {
  if (!on) activeRoleGroupTabId.value = 'all';
});

const hasUncategorizedAssignable = computed(() =>
  manageableRoles.value.some((r) => !(r.roleCategoryId ?? '').trim()),
);

const filteredManageableRoles = computed(() => {
  let list = manageableRoles.value;
  if (showRoleGroupTabs.value && activeRoleGroupTabId.value !== 'all') {
    if (activeRoleGroupTabId.value === 'uncategorized') {
      list = list.filter((r) => !(r.roleCategoryId ?? '').trim());
    } else {
      const cid = activeRoleGroupTabId.value;
      list = list.filter((r) => (r.roleCategoryId ?? '').trim() === cid);
    }
  }
  const query = roleSearchQuery.value.trim().toLowerCase();
  if (!query) return list;
  return list.filter((role) => role.name.toLowerCase().includes(query));
});

const roleListEmptyHint = computed(() => {
  if (roleSearchQuery.value.trim()) return 'No matching roles.';
  if (
    showRoleGroupTabs.value &&
    activeRoleGroupTabId.value !== 'all' &&
    !filteredManageableRoles.value.length
  ) {
    return 'No roles in this group.';
  }
  const rm = props.roleManagement;
  const gate = rm?.canMutateMemberRole;
  const rawCount = rm?.assignableRoles.filter((r) => !r.isEveryone).length ?? 0;
  if (
    gate &&
    rawCount > 0 &&
    !manageableRoles.value.length &&
    !roleSearchQuery.value.trim()
  ) {
    return 'No roles you can assign from here (rank vs target or permissions).';
  }
  if (!manageableRoles.value.length) {
    return 'No roles yet. Create one in Server Settings → Roles.';
  }
  return 'No matching roles.';
});

function isRoleAssigned(roleId: string) {
  if (props.optimisticAssign[roleId] !== undefined)
    return Boolean(props.optimisticAssign[roleId]);
  return props.assignedRoleIds.includes(roleId);
}

function isRoleRowDisabled(role: {
  id: string;
  name: string;
  color: string;
  roleCategoryId?: string | null;
}) {
  const gate = props.roleManagement.canMutateMemberRole;
  if (!gate) return false;
  const assigned = isRoleAssigned(role.id);
  if (assigned) return !gate(props.profile.id, role.id, false);
  return !gate(props.profile.id, role.id, true);
}

function roleRowTitle(role: {
  id: string;
  name: string;
  color: string;
  roleCategoryId?: string | null;
}) {
  if (!isRoleRowDisabled(role)) return undefined;
  return isRoleAssigned(role.id)
    ? 'You cannot remove this role for this member (rank).'
    : 'You cannot assign this role (rank vs member, or missing permissions for self).';
}

async function toggleRole(role: {
  id: string;
  name: string;
  color: string;
  roleCategoryId?: string | null;
}) {
  const rm = props.roleManagement;
  const p = props.profile;
  if (!rm || !p) return;
  if (isRoleRowDisabled(role)) return;
  const currently = isRoleAssigned(role.id);
  const next = !currently;

  void rm.onToggleRole({ targetUserId: p.id, roleId: role.id, assign: next });
}

function setRoleGroupTab(id: 'all' | 'uncategorized' | string) {
  activeRoleGroupTabId.value = id;
}

defineExpose({
  rolePopupPanelRef,
});
</script>

<template>
  <div class="member-popout__role-popup" :style="popupStyle" @click.stop>
    <div ref="rolePopupPanelRef" class="member-popout__role-panel">
      <div class="member-popout__role-panel-head">
        <div>
          <div
            class="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle"
          >
            Manage Roles
          </div>
          <div class="mt-1 text-xs text-fg-soft">
            Assign roles for {{ profile.displayName }}
          </div>
        </div>
        <div v-if="roleManagement.busy" class="text-[11px] text-fg-subtle">
          Saving...
        </div>
      </div>

      <input
        v-model="roleSearchQuery"
        type="text"
        class="member-popout__role-search"
        placeholder="Search roles"
      />

      <div
        v-if="showRoleGroupTabs"
        class="member-popout__role-group-tabs custom-scrollbar"
        role="tablist"
        aria-label="Role groups"
      >
        <button
          type="button"
          role="tab"
          class="member-popout__role-group-tab"
          :class="{
            'member-popout__role-group-tab--active':
              activeRoleGroupTabId === 'all',
          }"
          :aria-selected="activeRoleGroupTabId === 'all'"
          @click="setRoleGroupTab('all')"
        >
          All
        </button>
        <button
          v-for="cat in sortedRoleCategories"
          :key="cat.id"
          type="button"
          role="tab"
          class="member-popout__role-group-tab"
          :class="{
            'member-popout__role-group-tab--active':
              activeRoleGroupTabId === cat.id,
          }"
          :aria-selected="activeRoleGroupTabId === cat.id"
          :title="cat.name"
          @click="setRoleGroupTab(cat.id)"
        >
          <span class="member-popout__role-group-tab-label">{{
            cat.name
          }}</span>
        </button>
        <button
          v-if="hasUncategorizedAssignable"
          type="button"
          role="tab"
          class="member-popout__role-group-tab"
          :class="{
            'member-popout__role-group-tab--active':
              activeRoleGroupTabId === 'uncategorized',
          }"
          :aria-selected="activeRoleGroupTabId === 'uncategorized'"
          title="Roles not in any group"
          @click="setRoleGroupTab('uncategorized')"
        >
          Uncategorized
        </button>
      </div>

      <div class="member-popout__role-list custom-scrollbar">
        <div
          v-if="everyoneRole"
          class="member-popout__role-option member-popout__role-option--everyone"
        >
          <span class="member-popout__role-option-main">
            <span class="member-popout__role-option-dot-wrap">
              <img
                v-if="roleManagementIconSrc(everyoneRole)"
                :src="roleManagementIconSrc(everyoneRole)"
                alt=""
                class="member-popout__role-option-icon"
              />
              <span
                v-else
                class="member-popout__role-option-dot"
                :style="roleOptionDotStyle(everyoneRole)"
              />
            </span>
            <span class="truncate">{{
              everyoneRole.name === '@everyone' ? 'Member' : everyoneRole.name
            }}</span>
          </span>
          <span class="member-popout__role-option-state">Everyone</span>
        </div>
        <button
          v-for="role in filteredManageableRoles"
          :key="role.id"
          type="button"
          class="member-popout__role-option"
          :class="{
            'member-popout__role-option--active': isRoleAssigned(role.id),
            'member-popout__role-option--blocked': isRoleRowDisabled(role),
          }"
          :disabled="
            roleManagement.busy ||
            pendingRoleIds.has(role.id) ||
            isRoleRowDisabled(role)
          "
          :title="roleRowTitle(role)"
          @click="toggleRole(role)"
        >
          <span class="member-popout__role-option-main">
            <span class="member-popout__role-option-dot-wrap">
              <img
                v-if="roleManagementIconSrc(role)"
                :src="roleManagementIconSrc(role)"
                alt=""
                class="member-popout__role-option-icon"
              />
              <span
                v-else
                class="member-popout__role-option-dot"
                :style="roleOptionDotStyle(role)"
              />
            </span>
            <span class="truncate">{{ role.name }}</span>
          </span>
          <span class="member-popout__role-option-state">
            {{ isRoleAssigned(role.id) ? 'Added' : 'Add' }}
          </span>
        </button>

        <div
          v-if="!filteredManageableRoles.length"
          class="member-popout__role-empty"
        >
          {{ roleListEmptyHint }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.member-popout__role-panel {
  border-radius: 18px;
  padding: 0.8rem;
  background:
    linear-gradient(180deg, var(--vue-auto-191), var(--vue-auto-192)),
    var(--vue-auto-010);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.member-popout__role-popup {
  position: fixed;
  z-index: 170;
  width: min(288px, calc(100vw - 24px));
}

.member-popout__role-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.member-popout__role-search {
  width: 100%;
  margin-top: 0.75rem;
  border: 0;
  border-radius: 999px;
  background: var(--vue-auto-002);
  box-shadow: inset 0 0 0 1px var(--vue-auto-002);
  padding: 0.62rem 0.8rem;
  color: var(--vue-auto-009);
  font-size: 12px;
  outline: none;
}

.member-popout__role-search::placeholder {
  color: var(--vue-auto-193);
}

.member-popout__role-search:focus {
  box-shadow:
    inset 0 0 0 1px var(--vue-auto-194),
    0 0 0 3px var(--vue-auto-085);
}

.member-popout__role-group-tabs {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.55rem;
  padding-bottom: 0.1rem;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}

.member-popout__role-group-tab {
  flex: 0 0 auto;
  max-width: 8.5rem;
  border: 0;
  border-radius: 999px;
  padding: 0.32rem 0.62rem;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
  color: color-mix(in srgb, var(--vue-auto-195) 72%, transparent);
  background: color-mix(in srgb, white 6%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, white 10%, transparent);
  cursor: pointer;
  outline: none;
  transition:
    background-color 0.14s ease,
    color 0.14s ease,
    box-shadow 0.14s ease;
}

.member-popout__role-group-tab:hover {
  color: var(--vue-auto-195);
  background: color-mix(in srgb, white 10%, transparent);
}

.member-popout__role-group-tab:focus-visible {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, white 16%, transparent),
    0 0 0 2px color-mix(in srgb, var(--accent) 42%, transparent);
}

.member-popout__role-group-tab--active {
  color: var(--vue-auto-009);
  background: color-mix(in srgb, white 14%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, white 22%, transparent),
    0 1px 4px color-mix(in srgb, black 22%, transparent);
}

.member-popout__role-group-tab-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-popout__role-list {
  margin-top: 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 0.1rem;
}

.member-popout__role-option--everyone {
  opacity: 0.9;
  pointer-events: none;
  background: transparent;
}

.member-popout__role-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  width: 100%;
  min-width: 0;
  border: 0;
  border-radius: 14px;
  padding: 0.72rem 0.8rem;
  background: transparent;
  color: var(--vue-auto-195);
  text-align: left;
  transition:
    background-color 140ms ease,
    transform 140ms ease;
  box-sizing: border-box;
}

.member-popout__role-option:hover:not(:disabled) {
  background: var(--vue-auto-010);
  transform: translateY(-1px);
}

.member-popout__role-option:disabled {
  opacity: 0.55;
  cursor: default;
}

.member-popout__role-option--blocked:not(.member-popout__role-option--active) {
  opacity: 0.42;
}

.member-popout__role-option--active {
  background: linear-gradient(135deg, var(--vue-auto-196), var(--vue-auto-197));
}

.member-popout__role-option-main {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  flex: 1 1 auto;
}

.member-popout__role-option-dot {
  width: 0.6rem;
  height: 0.6rem;
  flex-shrink: 0;
  border-radius: 999px;
  background: transparent;
  border: 1px solid var(--vue-auto-004);
}

.member-popout__role-option-dot-wrap {
  width: 0.75rem;
  height: 0.75rem;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.member-popout__role-option-icon {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 3px;
  object-fit: cover;
  display: block;
}

.member-popout__role-option-state {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 0.24rem 0.55rem;
  background: var(--vue-auto-002);
  color: var(--vue-auto-198);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.member-popout__role-option--active .member-popout__role-option-state {
  background: var(--vue-auto-085);
  color: var(--vue-auto-199);
}

.member-popout__role-option--active .member-popout__role-option-dot {
  background: currentColor;
  border-color: transparent;
}

.member-popout__role-empty {
  border-radius: 14px;
  padding: 0.85rem 0.9rem;
  background: var(--vue-auto-010);
  color: var(--vue-auto-028);
  font-size: 12px;
  text-align: center;
}
</style>
