<script setup lang="ts">
import { computed, ref, watch, toRef } from 'vue';
import type { ChannelPermissionKey } from '@shared/types';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { icons } from '@/assets/icons';
import ChannelPermissionIconBadge from '@/features/channel-settings/components/ChannelPermissionIconBadge.vue';
import PermissionOverwriteEditor from '@/features/channel-settings/components/PermissionOverwriteEditor.vue';
import CategoryDiscordChatSyncPanel from '@/features/channel-settings/components/CategoryDiscordChatSyncPanel.vue';
import CategoryDiscordVoiceMirrorPanel from '@/features/channel-settings/components/CategoryDiscordVoiceMirrorPanel.vue';
import { canonicalizeEchoPermissionRowsForSave } from '@/features/channel-settings/domain/echoPermissionRows';
import { requestAppConfirm } from '@/utils/appDialogs';
import type {
  CategorySettingsSnapshot,
  CategorySettingsTab,
  ChannelPermissionDef,
  EchoPermissionEditorState,
  PermissionOverwriteRowDraft,
} from '@/features/channel-settings/types';
import {
  CATEGORY_TAB_COPY,
  getCategoryPermissionDefsForUi,
  groupChannelPermissionDefs,
  MESSAGE_AUTO_DELETE_OPTIONS,
} from '@/features/channel-settings/types';
import {
  messageAutoDeleteOptionValueToSeconds,
  messageAutoDeleteSecondsToOptionValue,
} from '@shared/messageAutoDelete';
import EchoDropdown from '@/components/EchoDropdown.vue';

const props = defineProps<{
  modelValue: boolean;
  serverName: string;
  isDiscordImportedServer?: boolean;
  categorySettings: CategorySettingsSnapshot | null;
  echoPermissionEditor?: EchoPermissionEditorState | null;
}>();

const categorySettingsTabs = computed((): CategorySettingsTab[] => {
  const tabs: CategorySettingsTab[] = ['overview', 'permissions'];
  if (props.isDiscordImportedServer) {
    tabs.push('discord_chat_sync', 'discord_voice_mirror');
  }
  tabs.push('danger_zone');
  return tabs;
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [payload: CategorySettingsSnapshot];
  delete: [];
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const activeTab = ref<CategorySettingsTab>('overview');
const categoryName = ref('');
const autoDeleteAfterSecondsStr = ref('');
const permissionOverrides = ref<Partial<Record<ChannelPermissionKey, boolean>>>(
  {},
);
const echoPermissionRows = ref<PermissionOverwriteRowDraft[]>([]);
/** Persists role/member pick while switching category-settings tabs. */
const permissionSelectedRowKey = ref<string | null>(null);

const permissionGroupsList = computed(() =>
  groupChannelPermissionDefs(getCategoryPermissionDefsForUi()),
);
const echoPermissionDefs = computed(() =>
  getCategoryPermissionDefsForUi().filter((def) => def.group !== 'Threads'),
);

function syncFromProps() {
  const cs = props.categorySettings;
  if (!cs) return;
  categoryName.value = cs.name;
  autoDeleteAfterSecondsStr.value = messageAutoDeleteSecondsToOptionValue(
    cs.autoDeleteAfterSeconds,
  );
  permissionOverrides.value = { ...cs.channelPermissionDefaults };
  const editor = props.echoPermissionEditor;
  if (editor?.loading) {
    echoPermissionRows.value = (editor.rows ?? []).map((row) => ({
      targetType: row.targetType,
      ...(row.targetType === 'everyone'
        ? {}
        : { targetId: row.targetId ?? null }),
      partial: { ...(row.partial ?? {}) },
    }));
  } else if (editor) {
    echoPermissionRows.value = (editor.rows ?? []).map((row) => ({
      targetType: row.targetType,
      ...(row.targetType === 'everyone'
        ? {}
        : { targetId: row.targetId ?? null }),
      partial: { ...(row.partial ?? {}) },
    }));
  }
}

watch(
  () => props.modelValue,
  (open, wasOpen) => {
    if (open && !wasOpen) {
      activeTab.value = 'overview';
      syncFromProps();
    }
    if (!open && wasOpen) {
      permissionSelectedRowKey.value = null;
    }
  },
);

watch(
  () => props.categorySettings?.categoryId,
  (categoryId, prevId) => {
    if (categoryId && categoryId !== prevId) {
      permissionSelectedRowKey.value = null;
    }
  },
);

watch(
  () => props.echoPermissionEditor?.loading,
  (loading, wasLoading) => {
    if (wasLoading && loading === false && props.modelValue) {
      permissionSelectedRowKey.value = null;
    }
  },
);

watch(
  () => [props.categorySettings, props.echoPermissionEditor] as const,
  () => {
    if (props.modelValue) syncFromProps();
  },
);

watch(categorySettingsTabs, (tabs) => {
  if (!tabs.includes(activeTab.value)) activeTab.value = 'overview';
});

function isPermAllowed(key: ChannelPermissionKey): boolean {
  return permissionOverrides.value[key] !== false;
}

function togglePermission(key: ChannelPermissionKey) {
  const next = { ...permissionOverrides.value };
  const effective = next[key] !== false;
  next[key] = !effective;
  permissionOverrides.value = next;
}

const trimmedName = computed(() => categoryName.value.trim());
const echoPermissionsReady = computed(
  () => !props.echoPermissionEditor || !props.echoPermissionEditor.loading,
);
const canSave = computed(
  () =>
    !!trimmedName.value &&
    !!props.categorySettings &&
    echoPermissionsReady.value,
);
const channelCount = computed(() => props.categorySettings?.channelCount ?? 0);
const initialCategorySnapshot = computed(() => {
  const cs = props.categorySettings;
  if (!cs) return null;
  return {
    name: cs.name ?? '',
    autoDeleteAfterSeconds: cs.autoDeleteAfterSeconds ?? null,
    channelPermissionDefaults: { ...(cs.channelPermissionDefaults ?? {}) },
    echoPermissionRows: props.echoPermissionEditor?.loading
      ? null
      : (props.echoPermissionEditor?.rows ?? []).map((row) => ({
          targetType: row.targetType,
          ...(row.targetType === 'everyone'
            ? {}
            : { targetId: row.targetId ?? null }),
          partial: { ...(row.partial ?? {}) },
        })),
  };
});

const categoryDirty = computed(() => {
  const snap = initialCategorySnapshot.value;
  if (!snap || !props.categorySettings) return false;
  if ((trimmedName.value || '') !== (snap.name || '').trim()) return true;
  if (
    messageAutoDeleteOptionValueToSeconds(autoDeleteAfterSecondsStr.value) !==
    (snap.autoDeleteAfterSeconds ?? null)
  )
    return true;
  if (props.echoPermissionEditor && echoPermissionsReady.value) {
    const snapRows = snap.echoPermissionRows;
    if (snapRows != null) {
      if (
        JSON.stringify(
          canonicalizeEchoPermissionRowsForSave(echoPermissionRows.value),
        ) !== JSON.stringify(canonicalizeEchoPermissionRowsForSave(snapRows))
      )
        return true;
    }
  } else if (
    JSON.stringify(permissionOverrides.value ?? {}) !==
    JSON.stringify(snap.channelPermissionDefaults ?? {})
  )
    return true;
  return false;
});

function blurModalFocus() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && modalRef.value?.contains(active)) {
    active.blur();
  }
}

function close() {
  blurModalFocus();
  emit('update:modelValue', false);
}

function onCategorySettingsNavClick(tab: CategorySettingsTab, e: MouseEvent) {
  activeTab.value = tab;
  (e.currentTarget as HTMLButtonElement | null)?.blur();
}

function save() {
  if (!canSave.value || !props.categorySettings) return;
  const snap = initialCategorySnapshot.value;
  const permissionRowsDirty =
    props.echoPermissionEditor &&
    echoPermissionsReady.value &&
    snap?.echoPermissionRows != null &&
    JSON.stringify(
      canonicalizeEchoPermissionRowsForSave(echoPermissionRows.value),
    ) !==
      JSON.stringify(
        canonicalizeEchoPermissionRowsForSave(snap.echoPermissionRows),
      );
  emit('save', {
    categoryId: props.categorySettings.categoryId,
    originalName: props.categorySettings.originalName,
    name: trimmedName.value,
    channelCount: props.categorySettings.channelCount,
    autoDeleteAfterSeconds: messageAutoDeleteOptionValueToSeconds(
      autoDeleteAfterSecondsStr.value,
    ),
    channelPermissionDefaults: { ...permissionOverrides.value },
    ...(permissionRowsDirty
      ? {
          echoPermissionRows: canonicalizeEchoPermissionRowsForSave(
            echoPermissionRows.value,
          ),
        }
      : {}),
  });
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

function tabIcon(tab: CategorySettingsTab) {
  if (tab === 'overview') return icons.list;
  if (tab === 'discord_chat_sync' || tab === 'discord_voice_mirror') {
    return icons.discordMark;
  }
  if (tab === 'danger_zone') return icons.trash;
  return icons.sliders;
}

function categorySettingsNavClass(tab: CategorySettingsTab) {
  if (activeTab.value === tab) {
    return 'server-settings-nav-item--active';
  }
  if (tab === 'danger_zone') {
    return 'category-settings-nav--danger';
  }
  return 'text-muted hover:text-foreground category-settings-nav--idle pointer-fine:hover:bg-glass-hover';
}

async function confirmDeleteCategory() {
  if (!props.categorySettings) return;
  const label = props.categorySettings.name;
  const n = channelCount.value;
  const ok = await requestAppConfirm({
    title: `Delete category “${label}”?`,
    message: `Delete this category and all ${n} channel${n === 1 ? '' : 's'} inside it? This cannot be undone.`,
    confirmLabel: 'Delete category',
    danger: true,
  });
  if (!ok) return;
  emit('delete');
  emit('update:modelValue', false);
}
</script>

<template>
  <Transition name="server-settings-modal">
    <div
      v-if="modelValue && categorySettings"
      class="fixed inset-0 z-[150] flex items-center justify-center bg-overlay-dim px-2"
      @click.self="close"
      @keydown="onKeydown"
    >
      <div
        ref="modalRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-settings-title"
        class="server-settings-modal relative flex h-[min(860px,94vh)] w-full max-w-6xl overflow-hidden rounded-2xl text-foreground"
      >
        <aside
          class="server-settings-sidebar custom-scrollbar w-full max-w-[280px] shrink-0 overflow-y-auto p-5"
        >
          <div class="mb-5 px-3">
            <div
              class="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-soft"
            >
              Category
            </div>
            <h2
              id="category-settings-title"
              class="mt-2 text-2xl font-bold leading-tight"
            >
              {{ categoryName || categorySettings.name }}
            </h2>
            <p class="mt-1 text-sm text-muted">
              Defaults for channels that sync with this category.
            </p>
          </div>

          <div class="mb-5">
            <div
              class="category-settings-sidebar-kicker px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
            >
              Settings
            </div>
            <div class="flex flex-col gap-1">
              <button
                v-for="tab in categorySettingsTabs"
                :key="tab"
                type="button"
                class="server-settings-nav-item rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border"
                :class="categorySettingsNavClass(tab)"
                @click="onCategorySettingsNavClick(tab, $event)"
              >
                <div class="flex items-center gap-2">
                  <img
                    :src="tabIcon(tab)"
                    alt=""
                    class="h-4 w-4 shrink-0 object-contain server-settings-inline-icon"
                  />
                  <span class="truncate">{{
                    CATEGORY_TAB_COPY[tab].title
                  }}</span>
                </div>
              </button>
            </div>
          </div>
        </aside>

        <section
          class="server-settings-content custom-scrollbar flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden p-6"
        >
          <div class="mb-4 flex shrink-0 items-start justify-between gap-4">
            <div>
              <div
                class="text-xs font-semibold uppercase tracking-[0.18em] text-fg-soft"
              >
                Category
              </div>
              <div class="mt-2 flex items-center gap-3">
                <img
                  :src="tabIcon(activeTab)"
                  alt=""
                  class="h-6 w-6 shrink-0 object-contain server-settings-inline-icon"
                />
                <h3 class="text-3xl font-bold text-foreground">
                  {{ CATEGORY_TAB_COPY[activeTab].title }}
                </h3>
              </div>
              <p class="mt-2 max-w-2xl text-sm text-muted">
                {{ CATEGORY_TAB_COPY[activeTab].description }}
              </p>
            </div>

            <button
              type="button"
              class="close-btn category-settings-close-btn shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
              @click="close"
            >
              Close
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto pr-1">
            <Transition name="server-settings-panel" mode="out-in">
              <div
                v-if="activeTab === 'overview'"
                key="overview"
                class="server-settings-panel-root server-settings-overview--borderless category-overview-flat pb-6"
              >
                <section class="overview-stack space-y-4">
                  <h4 class="overview-stack-heading">Basics</h4>
                  <div>
                    <label class="settings-label" for="category-settings-name"
                      >Category name</label
                    >
                    <input
                      id="category-settings-name"
                      v-model="categoryName"
                      type="text"
                      class="server-input mt-2 w-full max-w-xl"
                      maxlength="100"
                      placeholder="category-name"
                    />
                  </div>
                </section>
              </div>

              <div
                v-else-if="activeTab === 'danger_zone'"
                key="danger_zone"
                class="server-settings-panel-root pb-8"
              >
                <div class="max-w-lg space-y-8">
                  <p class="channel-settings-hint text-[15px] leading-relaxed">
                    These actions are sensitive and may be irreversible. Proceed
                    carefully.
                  </p>

                  <section class="space-y-3">
                    <div class="settings-label">Auto-delete messages</div>
                    <p class="channel-settings-hint mt-1.5 w-full min-w-0">
                      Messages in channels that sync with this category are
                      removed after this period. Deleted content stays in the
                      database for 14 days for compliance, then is purged.
                    </p>
                    <div class="channel-settings-dropdowns mt-3 w-full min-w-0">
                      <EchoDropdown
                        v-model="autoDeleteAfterSecondsStr"
                        :options="MESSAGE_AUTO_DELETE_OPTIONS"
                        label="Retention"
                        menu-match-trigger-width
                      />
                    </div>
                  </section>

                  <div
                    class="danger-row danger-row--flat max-w-xl flex-col items-stretch gap-3 sm:flex-row"
                  >
                    <div class="min-w-0">
                      <div
                        class="category-settings-danger-heading text-sm font-semibold"
                      >
                        Delete category
                      </div>
                      <p class="mt-1 text-sm text-fg-soft">
                        Permanently delete this category and all channels inside
                        it. Message history for those channels in the mock will
                        be removed.
                      </p>
                    </div>
                    <button
                      type="button"
                      class="danger-btn danger-btn--strong shrink-0 self-start sm:self-center"
                      @click="confirmDeleteCategory"
                    >
                      Delete category
                    </button>
                  </div>
                </div>
              </div>

              <div
                v-else-if="activeTab === 'permissions'"
                key="permissions"
                class="server-settings-panel-root space-y-5 pb-4"
              >
                <PermissionOverwriteEditor
                  v-if="echoPermissionEditor"
                  v-model:selected-row-key="permissionSelectedRowKey"
                  :rows="echoPermissionRows"
                  :roles="echoPermissionEditor.roles"
                  :members="echoPermissionEditor.members"
                  :permission-defs="echoPermissionDefs"
                  :loading="echoPermissionEditor.loading"
                  @update:rows="echoPermissionRows = $event"
                />

                <div
                  v-else
                  class="server-settings-panel w-full max-w-full rounded-2xl p-1"
                >
                  <div
                    v-for="[group, defs] in permissionGroupsList"
                    :key="group"
                    class="mb-4 w-full last:mb-0"
                  >
                    <div class="settings-subtitle px-3 pt-3 pb-2">
                      {{ group }}
                    </div>
                    <div
                      class="roles-permissions-list flex w-full flex-col gap-0.5"
                    >
                      <div
                        v-for="def in defs"
                        :key="def.key"
                        class="role-permission-row w-full min-w-0"
                      >
                        <div
                          class="flex min-w-0 flex-1 items-start gap-2.5 pr-3"
                        >
                          <ChannelPermissionIconBadge
                            :permission-key="def.key"
                          />
                          <span
                            class="min-w-0 flex-1 pt-1 text-sm leading-snug text-fg"
                            >{{ def.label }}</span
                          >
                        </div>
                        <input
                          type="checkbox"
                          class="server-toggle"
                          :checked="isPermAllowed(def.key)"
                          @click.prevent="togglePermission(def.key)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-else-if="activeTab === 'discord_chat_sync'"
                key="discord_chat_sync"
                class="server-settings-panel-root pb-4"
              >
                <CategoryDiscordChatSyncPanel
                  v-if="categorySettings?.serverId"
                  :server-id="categorySettings.serverId"
                  :category-id="categorySettings.categoryId"
                  :text-forum-channel-count="
                    categorySettings.textForumChannelCount
                  "
                />
                <div v-else class="text-sm text-fg-soft px-1">
                  Discord chat sync is available when this category belongs to a
                  server.
                </div>
              </div>

              <div
                v-else-if="activeTab === 'discord_voice_mirror'"
                key="discord_voice_mirror"
                class="server-settings-panel-root pb-4"
              >
                <CategoryDiscordVoiceMirrorPanel
                  v-if="categorySettings?.serverId"
                  :server-id="categorySettings.serverId"
                  :category-id="categorySettings.categoryId"
                />
                <div v-else class="text-sm text-fg-soft px-1">
                  Voice mirror is available when this category belongs to a
                  server.
                </div>
              </div>
            </Transition>
          </div>

          <div
            v-if="categoryDirty"
            class="roles-change-bar mt-4 shrink-0 border-t border-border pt-4"
          >
            <div class="text-sm text-fg-subtle">
              Changes apply when you save.
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-lg px-4 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover"
                @click="close"
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-glass-active disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="!canSave"
                @click="save"
              >
                Save changes
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
@use '@/features/server-settings/styles/serverSettingsModal.scss';

.category-settings-sidebar-kicker {
  color: var(--srv-label-fg);
}

.category-settings-close-btn {
  color: var(--muted);
}

.category-settings-close-btn:hover {
  background: var(--srv-row-hover);
  color: var(--text);
}

.category-settings-danger-heading {
  color: var(--srv-role-danger-fg);
}

.category-settings-nav--danger {
  color: var(--srv-role-danger-fg);
}

@media (hover: hover) and (pointer: fine) {
  .category-settings-nav--danger:hover {
    background: var(--srv-role-danger-hover-bg);
    color: var(--srv-role-danger-hover-fg);
  }
}
</style>
