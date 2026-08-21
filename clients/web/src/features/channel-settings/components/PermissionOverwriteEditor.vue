<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  ChannelPermissionDef,
  PermissionOverwriteRowDraft,
  PermissionOverwriteSubjectOption,
} from '@/features/channel-settings/types';
import { groupChannelPermissionDefs } from '@/features/channel-settings/types';
import type { ChannelPermissionKey } from '@shared/types';
import ChannelPermissionIconBadge from '@/features/channel-settings/components/ChannelPermissionIconBadge.vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';

const props = withDefaults(
  defineProps<{
    rows: PermissionOverwriteRowDraft[];
    roles: PermissionOverwriteSubjectOption[];
    members: PermissionOverwriteSubjectOption[];
    permissionDefs: ChannelPermissionDef[];
    loading?: boolean;
    disabled?: boolean;
    disabledMessage?: string;
  }>(),
  {
    loading: false,
    disabled: false,
    disabledMessage: '',
  },
);

const emit = defineEmits<{
  'update:rows': [rows: PermissionOverwriteRowDraft[]];
}>();

/** @members is always listed first; may be absent from `rows` until a perm is set. */
const MEMBERS_ROW_DRAFT: PermissionOverwriteRowDraft = {
  targetType: 'members',
  partial: {},
};

const targetTab = ref<'roles' | 'members'>('roles');
const searchQuery = ref('');
const selectedRowKey = defineModel<string | null>('selectedRowKey', {
  default: null,
});

const permissionGroupsList = computed(() =>
  groupChannelPermissionDefs(props.permissionDefs),
);

const roleMap = computed(
  () => new Map(props.roles.map((role) => [role.id, role])),
);
const memberMap = computed(
  () => new Map(props.members.map((member) => [member.id, member])),
);

function rowKey(row: PermissionOverwriteRowDraft): string {
  return row.targetType === 'members'
    ? 'members'
    : `${row.targetType}:${row.targetId ?? ''}`;
}

function normalizeRow(
  row: PermissionOverwriteRowDraft,
): PermissionOverwriteRowDraft {
  return {
    targetType: row.targetType,
    ...(row.targetType === 'members' ? {} : { targetId: row.targetId ?? null }),
    partial: { ...(row.partial ?? {}) },
  };
}

function emitRows(rows: PermissionOverwriteRowDraft[]) {
  emit(
    'update:rows',
    rows.map((row) => normalizeRow(row)),
  );
}

const roleRows = computed(() =>
  props.rows
    .filter((row) => row.targetType === 'members' || row.targetType === 'role')
    .sort((a, b) => {
      if (a.targetType === 'members') return -1;
      if (b.targetType === 'members') return 1;
      const aIndex = props.roles.findIndex((role) => role.id === a.targetId);
      const bIndex = props.roles.findIndex((role) => role.id === b.targetId);
      return (aIndex === -1 ? 9999 : aIndex) - (bIndex === -1 ? 9999 : bIndex);
    }),
);

const memberRows = computed(() =>
  props.rows
    .filter((row) => row.targetType === 'member')
    .sort((a, b) => {
      const aLabel = memberMap.value.get(a.targetId ?? '')?.label ?? '';
      const bLabel = memberMap.value.get(b.targetId ?? '')?.label ?? '';
      return aLabel.localeCompare(bLabel);
    }),
);

const searchTrim = computed(() => searchQuery.value.trim().toLowerCase());

function rowMatches(row: PermissionOverwriteRowDraft): boolean {
  if (!searchTrim.value) return true;
  const described = describeRow(row);
  const label = described.label.toLowerCase();
  const subtitle = (described.subtitle ?? '').toLowerCase();
  return (
    label.includes(searchTrim.value) || subtitle.includes(searchTrim.value)
  );
}

const visibleRoleRows = computed(() => roleRows.value.filter(rowMatches));
const visibleMemberRows = computed(() => memberRows.value.filter(rowMatches));

const availableRoleOptions = computed(() =>
  props.roles.filter((role) => {
    const hasRow = props.rows.some(
      (row) => row.targetType === 'role' && row.targetId === role.id,
    );
    if (hasRow) return false;
    if (!searchTrim.value) return true;
    const hay = `${role.label} ${role.subtitle ?? ''}`.toLowerCase();
    return hay.includes(searchTrim.value);
  }),
);

const availableMemberOptions = computed(() =>
  props.members.filter((member) => {
    const hasRow = props.rows.some(
      (row) => row.targetType === 'member' && row.targetId === member.id,
    );
    if (hasRow) return false;
    if (!searchTrim.value) return true;
    const hay = `${member.label} ${member.subtitle ?? ''}`.toLowerCase();
    return hay.includes(searchTrim.value);
  }),
);

function selectionKeyValidForTab(
  key: string | null | undefined,
  tab: 'roles' | 'members',
): boolean {
  if (!key) return false;
  if (tab === 'roles') {
    if (key === 'members') return true;
    return props.rows.some(
      (row) => row.targetType === 'role' && rowKey(row) === key,
    );
  }
  return props.rows.some(
    (row) => row.targetType === 'member' && rowKey(row) === key,
  );
}

function defaultSelectionKeyForTab(tab: 'roles' | 'members'): string {
  if (tab === 'roles') return 'members';
  const first = memberRows.value[0];
  return first ? rowKey(first) : '';
}

function ensureDefaultSelection() {
  if (props.loading) return;
  if (selectionKeyValidForTab(selectedRowKey.value, targetTab.value)) return;
  selectedRowKey.value = defaultSelectionKeyForTab(targetTab.value);
}

const selectedRow = computed(() => {
  const key = selectedRowKey.value;
  if (!key) return null;
  const found = props.rows.find((row) => rowKey(row) === key);
  if (found) return found;
  if (key === 'members' && targetTab.value === 'roles')
    return MEMBERS_ROW_DRAFT;
  return null;
});

watch(
  () => [props.rows, props.loading] as const,
  () => {
    if (props.loading) return;
    if (!selectionKeyValidForTab(selectedRowKey.value, targetTab.value)) {
      ensureDefaultSelection();
    }
  },
  { immediate: true },
);

watch(targetTab, (tab) => {
  searchQuery.value = '';
  if (!selectionKeyValidForTab(selectedRowKey.value, tab)) {
    ensureDefaultSelection();
  }
});

function describeRow(row: PermissionOverwriteRowDraft): {
  label: string;
  subtitle?: string;
  color?: string;
  avatarUrl?: string;
} {
  if (row.targetType === 'members')
    return { label: '@members', subtitle: 'Base overwrite for all members' };
  if (row.targetType === 'role') {
    const role = roleMap.value.get(row.targetId ?? '');
    return {
      label: role?.label ?? 'Unknown role',
      subtitle: role?.subtitle,
      color: role?.color,
    };
  }
  const member = memberMap.value.get(row.targetId ?? '');
  return {
    label: member?.label ?? 'Unknown member',
    subtitle: member?.subtitle,
    avatarUrl: member?.avatarUrl,
  };
}

function ensureRow(
  targetType: 'members' | 'role' | 'member',
  targetId?: string | null,
) {
  if (props.disabled) {
    notifyPermissionEditBlocked();
    if (targetType === 'members') selectedRowKey.value = 'members';
    return;
  }
  const existing = props.rows.find(
    (row) =>
      row.targetType === targetType &&
      (targetType === 'members' || row.targetId === targetId),
  );
  if (existing) {
    selectedRowKey.value = rowKey(existing);
    return;
  }
  const next: PermissionOverwriteRowDraft = {
    targetType,
    ...(targetType === 'members' ? {} : { targetId: targetId ?? null }),
    partial: {},
  };
  emitRows([...props.rows, next]);
  selectedRowKey.value = rowKey(next);
}

function removeSelectedRow() {
  const row = props.rows.find((r) => rowKey(r) === selectedRowKey.value);
  if (props.disabled || !row || row.targetType === 'members') return;
  emitRows(props.rows.filter((r) => rowKey(r) !== rowKey(row)));
  ensureDefaultSelection();
}

function notifyPermissionEditBlocked() {
  const msg =
    props.disabledMessage?.trim() ||
    'Permission overrides are not editable in the current mode.';
  dispatchAppToast(msg, 'info');
}

function setPermissionValue(
  key: ChannelPermissionKey,
  value: boolean | undefined,
) {
  if (props.disabled) {
    notifyPermissionEditBlocked();
    return;
  }
  const selKey = selectedRowKey.value;
  if (!selKey) return;

  const rows = props.rows.map((row) => normalizeRow(row));
  const idx = rows.findIndex((row) => rowKey(row) === selKey);
  if (idx === -1) {
    if (selKey !== 'members') return;
    const partial: Partial<Record<ChannelPermissionKey, boolean>> = {};
    if (value !== undefined) partial[key] = value;
    emitRows([...rows, { targetType: 'members', partial }]);
    return;
  }

  const partial = { ...(rows[idx].partial ?? {}) };
  if (value === undefined) delete partial[key];
  else partial[key] = value;
  rows[idx] = { ...rows[idx], partial };
  emitRows(rows);
}

function permissionValue(key: ChannelPermissionKey): boolean | undefined {
  const selKey = selectedRowKey.value;
  if (!selKey) return undefined;
  return props.rows.find((row) => rowKey(row) === selKey)?.partial?.[key];
}

function explicitPermissionCount(
  row: PermissionOverwriteRowDraft | null,
): number {
  return row ? Object.keys(row.partial ?? {}).length : 0;
}
</script>

<template>
  <div class="overwrite-editor">
    <div v-if="loading" class="overwrite-editor__empty">
      Loading permission targets…
    </div>

    <div
      v-else
      class="overwrite-editor__layout"
      :class="{ 'opacity-50 pointer-events-none': disabled }"
    >
      <aside class="overwrite-editor__sidebar">
        <div class="overwrite-editor__sidebar-head">
          <input
            v-model="searchQuery"
            type="search"
            class="overwrite-editor__search"
            :placeholder="
              targetTab === 'roles' ? 'Search roles…' : 'Search members…'
            "
          />
          <div
            class="overwrite-editor__tabs"
            role="tablist"
            aria-label="Permission target type"
          >
            <button
              type="button"
              role="tab"
              class="overwrite-editor__tab"
              :class="{
                'overwrite-editor__tab--active': targetTab === 'roles',
              }"
              :aria-selected="targetTab === 'roles'"
              @click="targetTab = 'roles'"
            >
              Roles
            </button>
            <button
              type="button"
              role="tab"
              class="overwrite-editor__tab"
              :class="{
                'overwrite-editor__tab--active': targetTab === 'members',
              }"
              :aria-selected="targetTab === 'members'"
              @click="targetTab = 'members'"
            >
              Members
            </button>
          </div>
        </div>

        <div class="overwrite-editor__sidebar-body">
          <template v-if="targetTab === 'roles'">
            <button
              type="button"
              class="overwrite-editor__target"
              :class="{
                'overwrite-editor__target--active':
                  selectedRowKey === 'members',
              }"
              @click="ensureRow('members')"
            >
              <span
                class="overwrite-editor__dot overwrite-editor__dot--members"
              ></span>
              <span class="truncate">@members</span>
            </button>

            <button
              v-for="row in visibleRoleRows.filter(
                (row) => row.targetType === 'role',
              )"
              :key="rowKey(row)"
              type="button"
              class="overwrite-editor__target"
              :class="{
                'overwrite-editor__target--active':
                  selectedRowKey === rowKey(row),
              }"
              @click="selectedRowKey = rowKey(row)"
            >
              <span
                class="overwrite-editor__dot"
                :style="{
                  background:
                    describeRow(row).color || 'rgba(255,255,255,0.24)',
                }"
              ></span>
              <span class="truncate">{{ describeRow(row).label }}</span>
            </button>

            <div class="overwrite-editor__add-list">
              <div class="overwrite-editor__list-title">Add role overwrite</div>
              <button
                v-for="role in availableRoleOptions.slice(0, 8)"
                :key="role.id"
                type="button"
                class="overwrite-editor__add-item"
                @click="ensureRow('role', role.id)"
              >
                <span
                  class="overwrite-editor__dot"
                  :style="{
                    background: role.color || 'rgba(255,255,255,0.24)',
                  }"
                ></span>
                <span class="truncate">{{ role.label }}</span>
              </button>
              <div
                v-if="availableRoleOptions.length === 0"
                class="overwrite-editor__hint"
              >
                No more roles match.
              </div>
            </div>
          </template>

          <template v-else>
            <button
              v-for="row in visibleMemberRows"
              :key="rowKey(row)"
              type="button"
              class="overwrite-editor__target"
              :class="{
                'overwrite-editor__target--active':
                  selectedRowKey === rowKey(row),
              }"
              @click="selectedRowKey = rowKey(row)"
            >
              <div
                v-if="describeRow(row).avatarUrl"
                class="relative h-[18px] w-[18px] shrink-0 overflow-hidden rounded-full"
              >
                <PausedGifAvatar
                  :src="safeImageUrl(describeRow(row).avatarUrl)"
                  alt=""
                  :session-key="row.targetId ?? 'perm-row'"
                  img-class="object-cover"
                />
              </div>
              <span
                v-else
                class="overwrite-editor__dot overwrite-editor__dot--member"
              ></span>
              <span class="truncate">{{ describeRow(row).label }}</span>
            </button>

            <div class="overwrite-editor__add-list">
              <div class="overwrite-editor__list-title">
                Add member overwrite
              </div>
              <button
                v-for="member in availableMemberOptions.slice(0, 8)"
                :key="member.id"
                type="button"
                class="overwrite-editor__add-item"
                @click="ensureRow('member', member.id)"
              >
                <div
                  v-if="member.avatarUrl"
                  class="relative h-[18px] w-[18px] shrink-0 overflow-hidden rounded-full"
                >
                  <PausedGifAvatar
                    :src="safeImageUrl(member.avatarUrl)"
                    alt=""
                    :session-key="member.id"
                    img-class="object-cover"
                  />
                </div>
                <span
                  v-else
                  class="overwrite-editor__dot overwrite-editor__dot--member"
                ></span>
                <span class="truncate">{{ member.label }}</span>
              </button>
              <div
                v-if="availableMemberOptions.length === 0"
                class="overwrite-editor__hint"
              >
                No more members match.
              </div>
            </div>
          </template>
        </div>
      </aside>

      <section class="overwrite-editor__content">
        <div v-if="selectedRow" class="overwrite-editor__panel">
          <div class="overwrite-editor__panel-head">
            <div>
              <div class="overwrite-editor__panel-title">
                {{ describeRow(selectedRow).label }}
              </div>
              <div class="overwrite-editor__panel-subtitle">
                {{
                  describeRow(selectedRow).subtitle ||
                  `${explicitPermissionCount(selectedRow)} explicit permission overrides`
                }}
              </div>
            </div>
            <button
              v-if="selectedRow.targetType !== 'members'"
              type="button"
              class="overwrite-editor__remove"
              :disabled="disabled"
              @click="removeSelectedRow"
            >
              Remove
            </button>
          </div>

          <div
            v-for="[group, defs] in permissionGroupsList"
            :key="group"
            class="overwrite-editor__group"
          >
            <div class="overwrite-editor__group-title">{{ group }}</div>
            <div
              v-for="def in defs"
              :key="def.key"
              class="overwrite-editor__perm-row"
            >
              <div class="overwrite-editor__perm-label-wrap">
                <ChannelPermissionIconBadge :permission-key="def.key" />
                <span class="overwrite-editor__perm-label">{{
                  def.label
                }}</span>
              </div>
              <div class="overwrite-editor__perm-actions">
                <button
                  type="button"
                  class="overwrite-editor__perm-btn overwrite-editor__perm-btn--deny"
                  :class="{
                    'overwrite-editor__perm-btn--active':
                      permissionValue(def.key) === false,
                  }"
                  :disabled="disabled"
                  @click="setPermissionValue(def.key, false)"
                >
                  Deny
                </button>
                <button
                  type="button"
                  class="overwrite-editor__perm-btn"
                  :class="{
                    'overwrite-editor__perm-btn--active':
                      permissionValue(def.key) === undefined,
                  }"
                  :disabled="disabled"
                  @click="setPermissionValue(def.key, undefined)"
                >
                  Inherit
                </button>
                <button
                  type="button"
                  class="overwrite-editor__perm-btn overwrite-editor__perm-btn--allow"
                  :class="{
                    'overwrite-editor__perm-btn--active':
                      permissionValue(def.key) === true,
                  }"
                  :disabled="disabled"
                  @click="setPermissionValue(def.key, true)"
                >
                  Allow
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="overwrite-editor__empty">
          Select or add a {{ targetTab === 'roles' ? 'role' : 'member' }} to
          edit its permissions.
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.overwrite-editor {
  display: flex;
  flex-direction: column;
}

.overwrite-editor__layout {
  display: grid;
  grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);
  gap: 14px;
  min-height: 420px;
}

.overwrite-editor__sidebar,
.overwrite-editor__panel {
  border-radius: 18px;
  background: var(--vue-auto-007);
  border: 1px solid var(--vue-auto-002);
}

.overwrite-editor__sidebar {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.overwrite-editor__sidebar-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 10px 8px;
  border-bottom: 1px solid var(--vue-auto-002);
  flex-shrink: 0;
}

.overwrite-editor__search {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: none;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--vue-auto-005);
  color: var(--vue-auto-006);
  font-size: 14px;
}

.overwrite-editor__tabs {
  display: flex;
  align-items: center;
  gap: 4px;
}

.overwrite-editor__tab {
  border: 0;
  border-radius: 8px;
  padding: 6px 10px;
  background: transparent;
  color: var(--vue-auto-049);
  font-size: 11px;
  font-weight: 700;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.overwrite-editor__tab:hover {
  background: var(--vue-auto-005);
  color: var(--vue-auto-030);
}

.overwrite-editor__tab--active {
  background: var(--vue-auto-003);
  color: var(--vue-auto-006);
  box-shadow: 0 0 0 1px var(--vue-auto-002);
}

.overwrite-editor__sidebar-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.overwrite-editor__target,
.overwrite-editor__add-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  color: var(--vue-auto-030);
  padding: 10px 12px;
  border-radius: 12px;
  text-align: left;
}

.overwrite-editor__target:hover,
.overwrite-editor__add-item:hover {
  background: var(--vue-auto-005);
}

.overwrite-editor__target--active {
  background: var(--vue-auto-048);
  color: var(--vue-auto-006);
}

.overwrite-editor__add-list {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--vue-auto-002);
}

.overwrite-editor__list-title,
.overwrite-editor__group-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--vue-auto-028);
  margin-bottom: 8px;
}

.overwrite-editor__dot,
.overwrite-editor__avatar {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.overwrite-editor__dot {
  background: var(--vue-auto-063);
}

.overwrite-editor__dot--members {
  background: linear-gradient(135deg, var(--vue-auto-286), var(--vue-auto-287));
}

.overwrite-editor__dot--member {
  background: var(--vue-auto-050);
}

.overwrite-editor__avatar {
  object-fit: cover;
}

.overwrite-editor__content {
  min-width: 0;
}

.overwrite-editor__panel {
  padding: 16px;
}

.overwrite-editor__panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.overwrite-editor__panel-title {
  font-size: 18px;
  font-weight: 800;
  color: var(--vue-auto-006);
}

.overwrite-editor__panel-subtitle,
.overwrite-editor__hint,
.overwrite-editor__empty {
  color: var(--vue-auto-288);
  font-size: 13px;
}

.overwrite-editor__group + .overwrite-editor__group {
  margin-top: 16px;
}

.overwrite-editor__perm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--vue-auto-005);
}

.overwrite-editor__perm-label-wrap {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.overwrite-editor__perm-label {
  min-width: 0;
  flex: 1;
  padding-top: 5px;
  color: var(--vue-auto-009);
  font-size: 14px;
  line-height: 1.35;
}

.overwrite-editor__perm-actions {
  display: inline-flex;
  gap: 6px;
}

.overwrite-editor__perm-btn,
.overwrite-editor__remove {
  border: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--vue-auto-005);
  color: var(--vue-auto-043);
  font-size: 12px;
  font-weight: 700;
}

.overwrite-editor__perm-btn--active {
  background: var(--vue-auto-004);
  color: var(--vue-auto-006);
}

.overwrite-editor__perm-btn--allow.overwrite-editor__perm-btn--active {
  background: var(--vue-auto-289);
  color: var(--vue-auto-290);
}

.overwrite-editor__perm-btn--deny.overwrite-editor__perm-btn--active {
  background: var(--vue-auto-291);
  color: var(--vue-auto-292);
}

@media (max-width: 960px) {
  .overwrite-editor__layout {
    grid-template-columns: 1fr;
  }
}
</style>
