<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, onMounted, ref, watch } from 'vue';
import { icons } from '@/assets/icons';
import { useServerSelfRolesStore } from '@/features/self-roles/serverSelfRoles';
import type {
  EchoSelfRolesConfig,
  SelfRolesCustomCategory,
} from '@shared/types/selfAssignableRoles';
import {
  ECHO_SELF_ROLES_CHANNEL_NAME,
  ECHO_SELF_ROLES_DEFAULT_CHANNEL_NAME,
} from '@shared/types/selfAssignableRoles';
import { clampEchoChannelName } from '@shared/echoChannelLimits';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';

type RoleRow = {
  id: string;
  name: string;
  color?: string;
  roleCategoryId?: string | null;
  permissions?: string[];
};

const props = defineProps<{
  serverId: string;
  accessToken: string | null | undefined;
  roles?: RoleRow[];
  roleCategories?: Array<{
    id: string;
    name: string;
    selfAssignableDefaults?: boolean;
  }>;
}>();

const selfRolesStore = useServerSelfRolesStore();

const loading = ref(true);
const loadError = ref<string | null>(null);
const saving = ref(false);
const enabled = ref(false);
const channelName = ref('');
const customCategories = ref<SelfRolesCustomCategory[]>([]);
const savedSnapshot = ref('');

const selfSelectableRoles = computed(() =>
  (props.roles ?? []).filter(
    (r) =>
      r.name !== '@everyone' &&
      (r.permissions?.includes('SELF_SELECTABLE') ?? false),
  ),
);

const derivedCategories = computed(() =>
  (props.roleCategories ?? []).filter((c) => c.selfAssignableDefaults),
);

const derivedCategoryRows = computed(() =>
  derivedCategories.value.map((cat) => ({
    ...cat,
    roleCount: selfSelectableRoles.value.filter(
      (r) => r.roleCategoryId === cat.id,
    ).length,
  })),
);

const exposedRoleCount = computed(() => {
  const exposed = new Set<string>();
  for (const cat of derivedCategoryRows.value) {
    for (const role of selfSelectableRoles.value) {
      if (role.roleCategoryId === cat.id) exposed.add(role.id);
    }
  }
  const claimed = new Set<string>();
  for (const cat of customCategories.value) {
    if (!cat.randomEligible) {
      for (const rid of cat.roleIds) {
        exposed.add(rid);
        claimed.add(rid);
      }
    }
  }
  for (const cat of customCategories.value) {
    if (!cat.randomEligible) continue;
    for (const role of selfSelectableRoles.value) {
      if (!claimed.has(role.id)) exposed.add(role.id);
    }
  }
  return exposed.size;
});

const setupWarnings = computed(() => {
  if (!enabled.value) return [] as string[];
  const warnings: string[] = [];
  if (!selfSelectableRoles.value.length) {
    warnings.push(echoT('b12.selfRoles.warnNoRoles'));
  }
  if (
    selfSelectableRoles.value.length &&
    !derivedCategories.value.length &&
    !customCategories.value.length
  ) {
    warnings.push(echoT('b12.selfRoles.warnNoCategories'));
  }
  if (
    derivedCategories.value.length &&
    derivedCategoryRows.value.every((c) => c.roleCount === 0)
  ) {
    warnings.push(echoT('b12.selfRoles.warnEmptySynced'));
  }
  return warnings;
});

const channelNameError = computed(() => {
  if (!enabled.value) return null;
  if (!clampEchoChannelName(channelName.value)) {
    return echoT('b12.selfRoles.channelNameError');
  }
  return null;
});

const canSave = computed(() => !channelNameError.value);

const isDirty = computed(() => snapshotState() !== savedSnapshot.value);

function snapshotState(): string {
  return JSON.stringify({
    enabled: enabled.value,
    channelName: clampEchoChannelName(channelName.value),
    customCategories: customCategories.value.map((c, i) => ({
      ...c,
      position: i,
    })),
  });
}

function syncFromConfig(config: EchoSelfRolesConfig) {
  enabled.value = config.enabled;
  channelName.value =
    config.channelName?.trim() ||
    (config.enabled ? ECHO_SELF_ROLES_DEFAULT_CHANNEL_NAME : '');
  customCategories.value = config.customCategories.map((c) => ({ ...c }));
  savedSnapshot.value = snapshotState();
}

async function loadSettings() {
  if (!props.serverId) {
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = null;
  try {
    await selfRolesStore.loadConfig(props.serverId, props.accessToken ?? '');
    const cfg = selfRolesStore.configFor(props.serverId);
    if (cfg) syncFromConfig(cfg);
    loadError.value = selfRolesStore.lastError;
  } finally {
    loading.value = false;
  }
}

onMounted(() => void loadSettings());

watch(
  () => props.serverId,
  () => void loadSettings(),
);

function addCustomCategory() {
  const n = customCategories.value.length + 1;
  customCategories.value = [
    ...customCategories.value,
    {
      id: crypto.randomUUID(),
      name: echoT('b12.selfRoles.defaultName', { n }),
      position: customCategories.value.length,
      roleIds: [],
      randomEligible: false,
    },
  ];
}

watch(enabled, (on) => {
  if (on && !clampEchoChannelName(channelName.value)) {
    channelName.value = ECHO_SELF_ROLES_DEFAULT_CHANNEL_NAME;
  }
});

function removeCustomCategory(id: string) {
  customCategories.value = customCategories.value.filter((c) => c.id !== id);
}

function toggleRoleInCategory(catId: string, roleId: string) {
  customCategories.value = customCategories.value.map((c) => {
    if (c.id !== catId || c.randomEligible) return c;
    const has = c.roleIds.includes(roleId);
    return {
      ...c,
      roleIds: has
        ? c.roleIds.filter((id) => id !== roleId)
        : [...c.roleIds, roleId],
    };
  });
}

function discardChanges() {
  const cfg = selfRolesStore.configFor(props.serverId);
  if (cfg) syncFromConfig(cfg);
}

async function save() {
  if (!props.serverId || !canSave.value) return;
  saving.value = true;
  const trimmedChannelName = clampEchoChannelName(channelName.value);
  const result = await selfRolesStore.saveConfig(
    props.serverId,
    props.accessToken ?? '',
    {
      enabled: enabled.value,
      channelName: enabled.value ? trimmedChannelName : undefined,
      customCategories: customCategories.value.map((c, i) => ({
        ...c,
        position: i,
      })),
    },
  );
  saving.value = false;
  if (result) {
    syncFromConfig(result);
    dispatchAppToast(echoT('b12.selfRoles.saved'));
  } else if (selfRolesStore.lastError) {
    dispatchAppToast(selfRolesStore.lastError, 'warning');
  }
}

function roleChipStyle(color?: string) {
  const c = color?.trim() || '#99aab5';
  return {
    borderColor: `color-mix(in srgb, ${c} 45%, var(--border))`,
    background: `color-mix(in srgb, ${c} 12%, var(--bg-secondary))`,
  } as Record<string, string>;
}

function selectedRolesForCategory(cat: SelfRolesCustomCategory) {
  if (cat.randomEligible) return selfSelectableRoles.value;
  const byId = new Map(selfSelectableRoles.value.map((r) => [r.id, r]));
  return cat.roleIds.map((id) => byId.get(id)).filter((r): r is RoleRow => !!r);
}
</script>

<template>
  <div class="server-settings-sections--flat server-settings-panel-root pb-24">
    <div v-if="loading" class="py-6 text-sm text-fg-soft">
      {{ echoT('b12.selfRoles.loading') }}
    </div>

    <template v-else>
      <div
        v-if="loadError"
        class="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-fg"
        role="alert"
      >
        <p class="min-w-0">{{ loadError }}</p>
        <button
          type="button"
          class="shrink-0 rounded-lg bg-glass-2 px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-glass-3"
          @click="loadSettings"
        >
          {{ echoT('b12.selfRoles.retry') }}
        </button>
      </div>

      <section class="settings-section-stack">
        <div class="settings-subtitle">{{ echoT('b12.selfRoles.title') }}</div>
        <i18n-t
          keypath="b12.selfRoles.intro"
          tag="p"
          scope="global"
          class="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-subtle"
        >
          <template #perm>
            <span class="text-fg-soft">{{
              echoT('b12.selfRoles.permName')
            }}</span>
          </template>
        </i18n-t>

        <div class="server-settings-panel mt-4 rounded-2xl p-4 sm:p-5">
          <div class="server-toggle-row">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <div class="text-sm font-semibold text-fg">
                  {{ echoT('b12.selfRoles.enableWidget') }}
                </div>
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  :class="
                    enabled
                      ? 'bg-accent/15 text-accent'
                      : 'bg-glass-2 text-fg-subtle'
                  "
                >
                  {{
                    enabled
                      ? echoT('b12.selfRoles.active')
                      : echoT('b12.selfRoles.off')
                  }}
                </span>
              </div>
              <i18n-t
                keypath="b12.selfRoles.enableDesc"
                tag="p"
                scope="global"
                class="mt-1 text-xs leading-relaxed text-fg-subtle"
              >
                <template #name>
                  <span class="font-medium text-fg-soft"
                    >#{{ echoT('b12.selfRoles.yourName') }}</span
                  >
                </template>
              </i18n-t>
            </div>
            <input
              v-model="enabled"
              type="checkbox"
              class="server-toggle shrink-0"
              :aria-label="echoT('b12.selfRoles.enableAria')"
            />
          </div>

          <div v-if="enabled" class="mt-4 border-t border-border/70 pt-4">
            <label class="settings-label" for="self-roles-channel-name">
              {{ echoT('b12.selfRoles.channelName') }}
            </label>
            <input
              id="self-roles-channel-name"
              v-model="channelName"
              type="text"
              class="server-input mt-2 w-full max-w-md"
              :class="{ 'server-input--invalid': channelNameError }"
              maxlength="48"
              :placeholder="ECHO_SELF_ROLES_DEFAULT_CHANNEL_NAME"
              autocomplete="off"
            />
            <p
              v-if="channelNameError"
              class="mt-1.5 text-xs text-amber-400"
              role="alert"
            >
              {{ channelNameError }}
            </p>
            <p v-else class="mt-1.5 text-xs text-fg-subtle">
              {{ echoT('b12.selfRoles.preview') }}
              <span class="font-medium text-fg-soft"
                >#{{ clampEchoChannelName(channelName) || '…' }}</span
              >
              <span
                v-if="channelName.trim() === ECHO_SELF_ROLES_CHANNEL_NAME"
                class="text-fg-subtle"
              >
                {{ echoT('b12.selfRoles.legacy') }}
              </span>
            </p>
          </div>
        </div>
      </section>

      <template v-if="enabled">
        <section class="settings-section-stack">
          <div class="grid gap-3 sm:grid-cols-3">
            <div
              class="rounded-xl bg-glass-1 px-4 py-3"
              style="box-shadow: inset 0 0 0 1px var(--border)"
            >
              <div
                class="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
              >
                {{ echoT('b12.selfRoles.statSelectable') }}
              </div>
              <div class="mt-1 text-2xl font-semibold tabular-nums text-fg">
                {{ selfSelectableRoles.length }}
              </div>
            </div>
            <div
              class="rounded-xl bg-glass-1 px-4 py-3"
              style="box-shadow: inset 0 0 0 1px var(--border)"
            >
              <div
                class="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
              >
                {{ echoT('b12.selfRoles.statSynced') }}
              </div>
              <div class="mt-1 text-2xl font-semibold tabular-nums text-fg">
                {{ derivedCategories.length }}
              </div>
            </div>
            <div
              class="rounded-xl bg-glass-1 px-4 py-3"
              style="box-shadow: inset 0 0 0 1px var(--border)"
            >
              <div
                class="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
              >
                {{ echoT('b12.selfRoles.channels') }}
              </div>
              <div class="mt-1 text-2xl font-semibold tabular-nums text-fg">
                {{ customCategories.length }}
              </div>
            </div>
          </div>

          <div
            v-if="setupWarnings.length"
            class="mt-4 space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3"
          >
            <p
              v-for="(warning, i) in setupWarnings"
              :key="i"
              class="text-xs leading-relaxed text-fg-soft"
            >
              {{ warning }}
            </p>
          </div>

          <p
            v-else-if="exposedRoleCount > 0"
            class="mt-4 text-xs text-fg-subtle"
          >
            {{
              echoT(
                exposedRoleCount === 1
                  ? 'b12.selfRoles.readyOne'
                  : 'b12.selfRoles.readyMany',
                { count: exposedRoleCount },
              )
            }}
          </p>
        </section>

        <section class="settings-section-stack">
          <div class="mb-3">
            <div class="settings-subtitle">
              {{ echoT('b12.selfRoles.syncedFrom') }}
            </div>
            <i18n-t
              keypath="b12.selfRoles.syncedHelp"
              tag="p"
              scope="global"
              class="mt-1 text-xs leading-relaxed text-fg-subtle"
            >
              <template #opt>
                <span class="text-fg-soft">{{
                  echoT('b12.selfRoles.exposeOpt')
                }}</span>
              </template>
            </i18n-t>
          </div>

          <div v-if="derivedCategoryRows.length" class="flex flex-wrap gap-2">
            <div
              v-for="cat in derivedCategoryRows"
              :key="cat.id"
              class="inline-flex items-center gap-2 rounded-full bg-glass-1 px-3 py-1.5 text-sm text-fg"
              style="box-shadow: inset 0 0 0 1px var(--border)"
            >
              <span>{{ cat.name }}</span>
              <span
                class="rounded-full bg-glass-2 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-fg-subtle"
              >
                {{
                  echoT(
                    cat.roleCount === 1
                      ? 'b12.selfRoles.roleOne'
                      : 'b12.selfRoles.roleMany',
                    { count: cat.roleCount },
                  )
                }}
              </span>
              <span
                class="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent"
              >
                {{ echoT('b12.selfRoles.synced') }}
              </span>
            </div>
          </div>

          <div
            v-else
            class="rounded-xl border border-dashed border-border/80 bg-glass-1/40 px-4 py-5 text-center"
          >
            <p class="text-sm text-fg-subtle">
              {{ echoT('b12.selfRoles.noExposed') }}
            </p>
            <i18n-t
              keypath="b12.selfRoles.noExposedHelp"
              tag="p"
              scope="global"
              class="mt-1 text-xs text-fg-subtle"
            >
              <template #opt>
                <span class="text-fg-soft">{{
                  echoT('b12.selfRoles.exposeOpt')
                }}</span>
              </template>
            </i18n-t>
          </div>
        </section>

        <section class="settings-section-stack">
          <div
            class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div class="min-w-0">
              <div class="settings-subtitle">
                {{ echoT('b12.selfRoles.channels') }}
              </div>
              <i18n-t
                keypath="b12.selfRoles.channelsHelp"
                tag="p"
                scope="global"
                class="mt-1 text-xs leading-relaxed text-fg-subtle"
              >
                <template #pool>
                  <span class="text-fg-soft">{{
                    echoT('b12.selfRoles.eligiblePool')
                  }}</span>
                </template>
              </i18n-t>
            </div>
            <button
              type="button"
              class="h-fit shrink-0 self-start rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              :disabled="!selfSelectableRoles.length"
              @click="addCustomCategory"
            >
              {{ echoT('b12.selfRoles.addChannel') }}
            </button>
          </div>

          <div
            v-if="!customCategories.length"
            class="rounded-xl border border-dashed border-border/80 bg-glass-1/40 px-4 py-8 text-center"
          >
            <img
              :src="icons.userTag"
              alt=""
              class="mx-auto mb-3 h-8 w-8 opacity-60 filter invert"
            />
            <p class="text-sm text-fg-subtle">
              {{ echoT('b12.selfRoles.noChannels') }}
            </p>
            <p class="mt-1 text-xs text-fg-subtle">
              {{ echoT('b12.selfRoles.optional') }}
            </p>
            <button
              type="button"
              class="mt-4 rounded-lg bg-glass-2 px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-glass-3 disabled:opacity-50"
              :disabled="!selfSelectableRoles.length"
              @click="addCustomCategory"
            >
              {{ echoT('b12.selfRoles.createFirst') }}
            </button>
          </div>

          <div v-else class="space-y-3">
            <article
              v-for="cat in customCategories"
              :key="cat.id"
              class="server-settings-panel rounded-2xl p-4 sm:p-5"
            >
              <div
                class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div class="min-w-0 flex-1">
                  <label class="settings-label">{{
                    echoT('b12.selfRoles.channelName')
                  }}</label>
                  <input
                    v-model="cat.name"
                    type="text"
                    class="server-input mt-2 w-full"
                    :placeholder="echoT('b12.selfRoles.channelPlaceholder')"
                  />
                </div>
                <button
                  type="button"
                  class="shrink-0 self-end rounded-lg px-2 py-1 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10 sm:self-start"
                  @click="removeCustomCategory(cat.id)"
                >
                  {{ echoT('b12.selfRoles.remove') }}
                </button>
              </div>

              <label class="role-permission-row roles-display-option">
                <div>
                  <div class="font-medium text-fg">
                    {{ echoT('b12.selfRoles.poolTitle') }}
                  </div>
                  <div class="text-xs text-fg-subtle">
                    {{ echoT('b12.selfRoles.poolDesc') }}
                  </div>
                </div>
                <input
                  v-model="cat.randomEligible"
                  type="checkbox"
                  class="server-toggle shrink-0"
                />
              </label>

              <div v-if="cat.randomEligible" class="mt-3">
                <p
                  class="rounded-xl bg-glass-1 px-3 py-2 text-xs leading-relaxed text-fg-subtle"
                >
                  {{ echoT('b12.selfRoles.poolInfo') }}
                </p>
                <div
                  v-if="selectedRolesForCategory(cat).length"
                  class="mt-3 flex flex-wrap gap-2"
                >
                  <span
                    v-for="role in selectedRolesForCategory(cat)"
                    :key="role.id"
                    class="rounded-full border px-2.5 py-1 text-xs font-medium text-fg"
                    :style="roleChipStyle(role.color)"
                  >
                    {{ role.name }}
                  </span>
                </div>
              </div>

              <div v-else class="mt-4">
                <div class="mb-2 flex items-center justify-between gap-2">
                  <span class="settings-label mb-0">{{
                    echoT('b12.selfRoles.rolesInChannel')
                  }}</span>
                  <span class="text-[11px] tabular-nums text-fg-subtle">
                    {{
                      echoT('b12.selfRoles.selectedCount', {
                        count: cat.roleIds.length,
                      })
                    }}
                  </span>
                </div>

                <div
                  v-if="!selfSelectableRoles.length"
                  class="rounded-xl bg-glass-1 px-3 py-2 text-xs text-fg-subtle"
                >
                  {{ echoT('b12.selfRoles.noneEnabled') }}
                </div>

                <div v-else class="flex flex-wrap gap-2">
                  <button
                    v-for="role in selfSelectableRoles"
                    :key="role.id"
                    type="button"
                    class="rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity"
                    :class="
                      cat.roleIds.includes(role.id)
                        ? 'text-fg opacity-100'
                        : 'text-fg-subtle opacity-70 hover:opacity-100'
                    "
                    :style="roleChipStyle(role.color)"
                    :aria-pressed="cat.roleIds.includes(role.id)"
                    @click="toggleRoleInCategory(cat.id, role.id)"
                  >
                    {{ role.name }}
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>
      </template>

      <div
        v-if="isDirty"
        class="roles-change-bar mt-6"
        role="status"
        aria-live="polite"
      >
        <span class="text-sm text-fg-soft">{{
          echoT('b12.selfRoles.unsaved')
        }}</span>
        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :disabled="saving"
            @click="discardChanges"
          >
            {{ echoT('b12.selfRoles.discard') }}
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :disabled="saving || !canSave"
            @click="save"
          >
            {{
              saving
                ? echoT('b12.selfRoles.saving')
                : echoT('serverSettingsUi.saveChanges')
            }}
          </button>
        </div>
      </div>

      <div v-else class="mt-8 flex justify-end">
        <button
          type="button"
          class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          :disabled="saving || !canSave"
          @click="save"
        >
          {{
            saving
              ? echoT('b12.selfRoles.saving')
              : echoT('serverSettingsUi.saveChanges')
          }}
        </button>
      </div>
    </template>
  </div>
</template>
