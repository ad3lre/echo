<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { icons } from '@/assets/icons';
import { useServerSelfRolesStore } from '@/stores/serverSelfRoles';
import type {
  EchoSelfRolesConfig,
  SelfRolesCustomCategory,
} from '@shared/types/selfAssignableRoles';
import {
  ECHO_SELF_ROLES_CHANNEL_NAME,
  ECHO_SELF_ROLES_DEFAULT_CHANNEL_NAME,
} from '@shared/types/selfAssignableRoles';
import { clampEchoChannelName } from '@shared/echoChannelLimits';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

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
    warnings.push(
      'No roles have the Self-selectable permission yet. Edit roles under Server Settings → Roles.',
    );
  }
  if (
    selfSelectableRoles.value.length &&
    !derivedCategories.value.length &&
    !customCategories.value.length
  ) {
    warnings.push(
      'Add synced role categories or custom groups so members have roles to pick from.',
    );
  }
  if (
    derivedCategories.value.length &&
    derivedCategoryRows.value.every((c) => c.roleCount === 0)
  ) {
    warnings.push(
      'Synced categories are exposed but contain no self-selectable roles yet.',
    );
  }
  return warnings;
});

const channelNameError = computed(() => {
  if (!enabled.value) return null;
  if (!clampEchoChannelName(channelName.value)) {
    return 'Enter a channel name members will see in the sidebar.';
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
      name: `Custom category ${n}`,
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
    dispatchAppToast('Self-assignable roles settings saved.');
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
      Loading self-assignable roles settings…
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
          Retry
        </button>
      </div>

      <section class="settings-section-stack">
        <div class="settings-subtitle">Self-assignable roles</div>
        <p class="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-subtle">
          Give members a dedicated widget channel to pick up roles they qualify
          for. Roles must have the
          <span class="text-fg-soft">Self-selectable</span> permission and
          appear in a synced or custom category below.
        </p>

        <div class="server-settings-panel mt-4 rounded-2xl p-4 sm:p-5">
          <div class="server-toggle-row">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <div class="text-sm font-semibold text-fg">
                  Enable widget channel
                </div>
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  :class="
                    enabled
                      ? 'bg-accent/15 text-accent'
                      : 'bg-glass-2 text-fg-subtle'
                  "
                >
                  {{ enabled ? 'Active' : 'Off' }}
                </span>
              </div>
              <p class="mt-1 text-xs leading-relaxed text-fg-subtle">
                Creates a dedicated channel where members pick roles. Choose the
                sidebar name below — it appears as
                <span class="font-medium text-fg-soft">#your-name</span>.
              </p>
            </div>
            <input
              v-model="enabled"
              type="checkbox"
              class="server-toggle shrink-0"
              aria-label="Enable self-assignable roles widget channel"
            />
          </div>

          <div v-if="enabled" class="mt-4 border-t border-border/70 pt-4">
            <label class="settings-label" for="self-roles-channel-name">
              Channel name
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
              Preview:
              <span class="font-medium text-fg-soft"
                >#{{ clampEchoChannelName(channelName) || '…' }}</span
              >
              <span
                v-if="channelName.trim() === ECHO_SELF_ROLES_CHANNEL_NAME"
                class="text-fg-subtle"
              >
                (legacy slug — pick a friendlier name if you can)
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
                Self-selectable roles
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
                Synced categories
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
                Custom categories
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
            {{ exposedRoleCount }} role{{ exposedRoleCount === 1 ? '' : 's' }}
            ready for members in the widget channel.
          </p>
        </section>

        <section class="settings-section-stack">
          <div class="mb-3">
            <div class="settings-subtitle">Synced from role categories</div>
            <p class="mt-1 text-xs leading-relaxed text-fg-subtle">
              Turn on
              <span class="text-fg-soft">Expose in self-assign channel</span>
              in a role category’s settings to mirror its self-selectable roles
              here automatically.
            </p>
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
                {{ cat.roleCount }} role{{ cat.roleCount === 1 ? '' : 's' }}
              </span>
              <span
                class="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent"
              >
                synced
              </span>
            </div>
          </div>

          <div
            v-else
            class="rounded-xl border border-dashed border-border/80 bg-glass-1/40 px-4 py-5 text-center"
          >
            <p class="text-sm text-fg-subtle">
              No role categories are exposed yet.
            </p>
            <p class="mt-1 text-xs text-fg-subtle">
              Open Server Settings → Roles, pick a category, and enable
              <span class="text-fg-soft">Expose in self-assign channel</span>.
            </p>
          </div>
        </section>

        <section class="settings-section-stack">
          <div
            class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div class="min-w-0">
              <div class="settings-subtitle">Custom categories</div>
              <p class="mt-1 text-xs leading-relaxed text-fg-subtle">
                Group self-selectable roles manually, or use an
                <span class="text-fg-soft">eligible pool</span> category for
                every role not listed elsewhere.
              </p>
            </div>
            <button
              type="button"
              class="h-fit shrink-0 self-start rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              :disabled="!selfSelectableRoles.length"
              @click="addCustomCategory"
            >
              Add category
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
            <p class="text-sm text-fg-subtle">No custom categories yet.</p>
            <p class="mt-1 text-xs text-fg-subtle">
              Optional — synced role categories may be enough on their own.
            </p>
            <button
              type="button"
              class="mt-4 rounded-lg bg-glass-2 px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-glass-3 disabled:opacity-50"
              :disabled="!selfSelectableRoles.length"
              @click="addCustomCategory"
            >
              Create first category
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
                  <label class="settings-label">Category name</label>
                  <input
                    v-model="cat.name"
                    type="text"
                    class="server-input mt-2 w-full"
                    placeholder="e.g. Colors, Games, Region"
                  />
                </div>
                <button
                  type="button"
                  class="shrink-0 self-end rounded-lg px-2 py-1 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10 sm:self-start"
                  @click="removeCustomCategory(cat.id)"
                >
                  Remove
                </button>
              </div>

              <label class="role-permission-row roles-display-option">
                <div>
                  <div class="font-medium text-fg">Eligible roles pool</div>
                  <div class="text-xs text-fg-subtle">
                    Include every self-selectable role not explicitly assigned
                    to another custom category.
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
                  Members will see all unclaimed self-selectable roles in this
                  tab. Roles already listed in other custom categories stay
                  exclusive to those groups.
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
                  <span class="settings-label mb-0"
                    >Roles in this category</span
                  >
                  <span class="text-[11px] tabular-nums text-fg-subtle">
                    {{ cat.roleIds.length }} selected
                  </span>
                </div>

                <div
                  v-if="!selfSelectableRoles.length"
                  class="rounded-xl bg-glass-1 px-3 py-2 text-xs text-fg-subtle"
                >
                  No roles have Self-selectable enabled yet.
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
        <span class="text-sm text-fg-soft">You have unsaved changes</span>
        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :disabled="saving"
            @click="discardChanges"
          >
            Discard
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :disabled="saving || !canSave"
            @click="save"
          >
            {{ saving ? 'Saving…' : 'Save changes' }}
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
          {{ saving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </template>
  </div>
</template>
