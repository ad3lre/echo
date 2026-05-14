<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  ChannelPermissionDef,
  PermissionOverwriteRowDraft,
  PermissionOverwriteSubjectOption,
} from '@/features/channel-settings/types';
import type { ChannelPermissionKey } from '@shared/types';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';

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

const targetTab = ref<'roles' | 'members'>('roles');
const searchQuery = ref('');
const selectedRowKey = ref<string>('everyone');

const permissionGroupsList = computed(() => {
  const map = new Map<string, ChannelPermissionDef[]>();
  for (const def of props.permissionDefs) {
    if (!map.has(def.group)) map.set(def.group, []);
    map.get(def.group)!.push(def);
  }
  return Array.from(map.entries());
});

const roleMap = computed(
  () => new Map(props.roles.map((role) => [role.id, role])),
);
const memberMap = computed(
  () => new Map(props.members.map((member) => [member.id, member])),
);

function rowKey(row: PermissionOverwriteRowDraft): string {
  return row.targetType === 'everyone'
    ? 'everyone'
    : `${row.targetType}:${row.targetId ?? ''}`;
}

function normalizeRow(
  row: PermissionOverwriteRowDraft,
): PermissionOverwriteRowDraft {
  return {
    targetType: row.targetType,
    ...(row.targetType === 'everyone'
      ? {}
      : { targetId: row.targetId ?? null }),
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
    .filter((row) => row.targetType === 'everyone' || row.targetType === 'role')
    .sort((a, b) => {
      if (a.targetType === 'everyone') return -1;
      if (b.targetType === 'everyone') return 1;
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
  const label = describeRow(row).label.toLowerCase();
  const subtitle = (describeRow(row).subtitle ?? '').toLowerCase();
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

const selectedRow = computed(
  () => props.rows.find((row) => rowKey(row) === selectedRowKey.value) ?? null,
);

watch(
  () => props.rows,
  (rows) => {
    const hasSelected = rows.some(
      (row) => rowKey(row) === selectedRowKey.value,
    );
    if (!hasSelected) {
      if (targetTab.value === 'roles') {
        // Default to @everyone when the current key is missing — e.g. everyone row
        // is omitted from `rows` until the user toggles a perm (normalize strips empty partials).
        selectedRowKey.value = 'everyone';
        const hasEveryone = rows.some((r) => r.targetType === 'everyone');
        if (!hasEveryone && !props.disabled) {
          emitRows([...rows, { targetType: 'everyone', partial: {} }]);
        }
      } else {
        const firstMember = rows.find((r) => r.targetType === 'member');
        selectedRowKey.value = firstMember ? rowKey(firstMember) : '';
      }
    }
  },
  { immediate: true, deep: true },
);

watch(targetTab, (tab) => {
  if (tab === 'roles') {
    selectedRowKey.value = 'everyone';
  } else {
    const first = memberRows.value[0];
    selectedRowKey.value = first ? rowKey(first) : '';
  }
});

function describeRow(row: PermissionOverwriteRowDraft): {
  label: string;
  subtitle?: string;
  color?: string;
  avatarUrl?: string;
} {
  if (row.targetType === 'everyone')
    return { label: '@everyone', subtitle: 'Base overwrite for all members' };
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
  targetType: 'everyone' | 'role' | 'member',
  targetId?: string | null,
) {
  if (props.disabled) return;
  const existing = props.rows.find(
    (row) =>
      row.targetType === targetType &&
      (targetType === 'everyone' || row.targetId === targetId),
  );
  if (existing) {
    selectedRowKey.value = rowKey(existing);
    return;
  }
  const next: PermissionOverwriteRowDraft = {
    targetType,
    ...(targetType === 'everyone' ? {} : { targetId: targetId ?? null }),
    partial: {},
  };
  emitRows([...props.rows, next]);
  selectedRowKey.value = rowKey(next);
}

function removeSelectedRow() {
  if (
    props.disabled ||
    !selectedRow.value ||
    selectedRow.value.targetType === 'everyone'
  )
    return;
  emitRows(
    props.rows.filter((row) => rowKey(row) !== rowKey(selectedRow.value!)),
  );
}

function setPermissionValue(
  key: ChannelPermissionKey,
  value: boolean | undefined,
) {
  if (props.disabled || !selectedRow.value) return;
  emitRows(
    props.rows.map((row) => {
      if (rowKey(row) !== rowKey(selectedRow.value!)) return normalizeRow(row);
      const partial = { ...(row.partial ?? {}) };
      if (value === undefined) delete partial[key];
      else partial[key] = value;
      return {
        ...normalizeRow(row),
        partial,
      };
    }),
  );
}

function permissionValue(key: ChannelPermissionKey): boolean | undefined {
  return selectedRow.value?.partial?.[key];
}

function explicitPermissionCount(
  row: PermissionOverwriteRowDraft | null,
): number {
  return row ? Object.keys(row.partial ?? {}).length : 0;
}
</script>

<template>
  <div class="overwrite-editor">
    <div class="overwrite-editor__toolbar">
      <div class="overwrite-editor__segmented">
        <button
          type="button"
          class="overwrite-editor__segment"
          :class="{
            'overwrite-editor__segment--active': targetTab === 'roles',
          }"
          @click="targetTab = 'roles'"
        >
          Roles
        </button>
        <button
          type="button"
          class="overwrite-editor__segment"
          :class="{
            'overwrite-editor__segment--active': targetTab === 'members',
          }"
          @click="targetTab = 'members'"
        >
          Members
        </button>
      </div>
      <input
        v-model="searchQuery"
        type="search"
        class="overwrite-editor__search"
        :placeholder="
          targetTab === 'roles' ? 'Search roles…' : 'Search members…'
        "
      />
    </div>

    <div v-if="loading" class="overwrite-editor__empty">
      Loading permission targets…
    </div>

    <div v-else class="overwrite-editor__layout">
      <aside
        class="overwrite-editor__sidebar"
        :class="{ 'opacity-50 pointer-events-none': disabled }"
      >
        <template v-if="targetTab === 'roles'">
          <button
            type="button"
            class="overwrite-editor__target"
            :class="{
              'overwrite-editor__target--active': selectedRowKey === 'everyone',
            }"
            @click="ensureRow('everyone')"
          >
            <span
              class="overwrite-editor__dot overwrite-editor__dot--everyone"
            ></span>
            <span class="truncate">@everyone</span>
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
                background: describeRow(row).color || 'rgba(255,255,255,0.24)',
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
                :style="{ background: role.color || 'rgba(255,255,255,0.24)' }"
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
            <div class="overwrite-editor__list-title">Add member overwrite</div>
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
      </aside>

      <section class="overwrite-editor__content">
        <p
          v-if="disabled && disabledMessage"
          class="overwrite-editor__disabled-message"
        >
          {{ disabledMessage }}
        </p>

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
              v-if="selectedRow.targetType !== 'everyone'"
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
              <span class="overwrite-editor__perm-label">{{ def.label }}</span>
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
  gap: 14px;
}

.overwrite-editor__toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}

.overwrite-editor__segmented {
  display: inline-flex;
  padding: 4px;
  border-radius: 999px;
  background: var(--vue-auto-005);
}

.overwrite-editor__segment {
  border: 0;
  background: transparent;
  color: var(--vue-auto-049);
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.overwrite-editor__segment--active {
  background: var(--vue-auto-003);
  color: var(--vue-auto-006);
}

.overwrite-editor__search {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: none;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--vue-auto-005);
  color: var(--vue-auto-006);
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
  padding: 10px;
  overflow-y: auto;
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

.overwrite-editor__dot--everyone {
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
.overwrite-editor__disabled-message,
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

.overwrite-editor__perm-label {
  min-width: 0;
  flex: 1;
  color: var(--vue-auto-009);
  font-size: 14px;
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
