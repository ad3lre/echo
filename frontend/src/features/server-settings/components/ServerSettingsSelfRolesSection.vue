<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useServerSelfRolesStore } from '@/stores/serverSelfRoles';
import type {
  EchoSelfRolesConfig,
  SelfRolesCustomCategory,
} from '@shared/types/selfAssignableRoles';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

const props = defineProps<{
  serverId: string;
  accessToken: string | null | undefined;
  categories?: Array<{
    id: string;
    name: string;
    channels?: Array<{ id: string; name: string }>;
  }>;
  roles?: Array<{ id: string; name: string; permissions?: string[] }>;
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
const panelChannelId = ref<string | null>(null);
const customCategories = ref<SelfRolesCustomCategory[]>([]);

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

const textChannels = computed(() => allChannels());

function allChannels(): Array<{ id: string; name: string }> {
  const all: Array<{ id: string; name: string }> = [];
  for (const cat of props.categories ?? []) {
    for (const ch of cat.channels ?? []) {
      all.push(ch);
    }
  }
  return all;
}

function syncFromConfig(config: EchoSelfRolesConfig) {
  enabled.value = config.enabled;
  panelChannelId.value = config.panelChannelId;
  customCategories.value = config.customCategories.map((c) => ({ ...c }));
}

async function loadSettings() {
  if (!props.serverId) {
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = null;
  try {
    /* Cookie session auth; bearer token is legacy only (see echoFetch). */
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

async function save() {
  if (!props.serverId) return;
  saving.value = true;
  const result = await selfRolesStore.saveConfig(
    props.serverId,
    props.accessToken ?? '',
    {
      enabled: enabled.value,
      panelChannelId: panelChannelId.value,
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
</script>

<template>
  <div class="server-settings-self-roles">
    <div v-if="loading" class="server-settings-self-roles__loading">
      Loading self-assignable roles settings…
    </div>
    <template v-else>
      <div
        v-if="loadError"
        class="server-settings-self-roles__error"
        role="alert"
      >
        <p>{{ loadError }}</p>
        <button
          type="button"
          class="server-settings-self-roles__add-btn chat-focus-ring"
          @click="loadSettings"
        >
          Retry
        </button>
      </div>

      <section class="server-settings-self-roles__section">
        <h3 class="server-settings-self-roles__heading">
          Self-assignable roles channel
        </h3>
        <p class="server-settings-self-roles__desc">
          Enable a built-in widget channel where members can pick up roles
          marked with the Self-selectable permission. This is not a custom
          channel type — choose an existing text channel as the panel.
        </p>
        <label class="server-settings-self-roles__toggle">
          <input v-model="enabled" type="checkbox" class="server-toggle" />
          <span>Enable self-assignable roles channel</span>
        </label>
      </section>

      <template v-if="enabled">
        <section class="server-settings-self-roles__section">
          <h4 class="server-settings-self-roles__subheading">Panel channel</h4>
          <p class="server-settings-self-roles__hint">
            Members see the role picker widget in this channel.
          </p>
          <select
            v-model="panelChannelId"
            class="server-settings-self-roles__select"
          >
            <option :value="null">— Select a channel —</option>
            <option v-for="ch in textChannels" :key="ch.id" :value="ch.id">
              #{{ ch.name }}
            </option>
          </select>
          <p
            v-if="!textChannels.length"
            class="server-settings-self-roles__empty-note"
          >
            No text channels available. Create a channel under Structure first.
          </p>
        </section>

        <section class="server-settings-self-roles__section">
          <h4 class="server-settings-self-roles__subheading">
            Derived from role categories
          </h4>
          <p class="server-settings-self-roles__hint">
            Role categories with “Expose in self-assign channel” enabled (Server
            Settings → Roles → Category settings) appear here automatically with
            their self-selectable roles.
          </p>
          <ul
            v-if="derivedCategories.length"
            class="server-settings-self-roles__derived-list"
          >
            <li v-for="cat in derivedCategories" :key="cat.id">
              {{ cat.name }}
            </li>
          </ul>
          <p v-else class="server-settings-self-roles__empty-note">
            No role categories are exposed yet.
          </p>
        </section>

        <section class="server-settings-self-roles__section">
          <div class="server-settings-self-roles__section-head">
            <h4 class="server-settings-self-roles__subheading">
              Custom categories
            </h4>
            <button
              type="button"
              class="server-settings-self-roles__add-btn chat-focus-ring"
              @click="addCustomCategory"
            >
              Add category
            </button>
          </div>
          <p class="server-settings-self-roles__hint">
            Group any self-selectable roles, or use “All eligible roles” to
            include every self-selectable role not listed in other custom
            categories.
          </p>

          <div
            v-if="!customCategories.length"
            class="server-settings-self-roles__empty-note"
          >
            No custom categories yet.
          </div>

          <article
            v-for="cat in customCategories"
            :key="cat.id"
            class="server-settings-self-roles__custom-card"
          >
            <div class="server-settings-self-roles__custom-head">
              <input
                v-model="cat.name"
                type="text"
                class="server-settings-self-roles__input"
                placeholder="Category name"
              />
              <button
                type="button"
                class="server-settings-self-roles__remove-btn chat-focus-ring"
                @click="removeCustomCategory(cat.id)"
              >
                Remove
              </button>
            </div>
            <label class="server-settings-self-roles__toggle">
              <input
                v-model="cat.randomEligible"
                type="checkbox"
                class="server-toggle"
              />
              <span>All eligible roles (random pool)</span>
            </label>
            <div
              v-if="!cat.randomEligible"
              class="server-settings-self-roles__role-list"
            >
              <label
                v-for="role in selfSelectableRoles"
                :key="role.id"
                class="server-settings-self-roles__role-item"
              >
                <input
                  type="checkbox"
                  :checked="cat.roleIds.includes(role.id)"
                  @change="toggleRoleInCategory(cat.id, role.id)"
                />
                <span>{{ role.name }}</span>
              </label>
              <p
                v-if="!selfSelectableRoles.length"
                class="server-settings-self-roles__empty-note"
              >
                No roles have Self-selectable enabled yet.
              </p>
            </div>
          </article>
        </section>
      </template>

      <div class="server-settings-self-roles__actions">
        <button
          type="button"
          class="server-settings-self-roles__save-btn chat-focus-ring"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.server-settings-self-roles {
  &__loading {
    padding: 1rem 0;
    color: var(--fg-subtle);
    font-size: 0.875rem;
  }

  &__error {
    margin-bottom: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 0.65rem;
    border: 1px solid var(--destructive, #e55);
    background: color-mix(in srgb, var(--destructive, #e55) 12%, transparent);
    color: var(--fg);
    font-size: 0.8125rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  &__section {
    margin-bottom: 1.5rem;
  }

  &__heading {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.35rem;
  }

  &__subheading {
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  &__desc,
  &__hint {
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--fg-subtle);
    margin-bottom: 0.65rem;
  }

  &__toggle {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  &__select,
  &__input {
    width: 100%;
    max-width: 28rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
    background: var(--glass-1);
    padding: 0.5rem 0.65rem;
    font-size: 0.875rem;
    color: var(--fg);
  }

  &__derived-list {
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.875rem;
    color: var(--fg-soft);
  }

  &__empty-note {
    font-size: 0.8125rem;
    color: var(--fg-subtle);
    font-style: italic;
  }

  &__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
  }

  &__add-btn,
  &__save-btn {
    border-radius: 0.5rem;
    padding: 0.45rem 0.85rem;
    font-size: 0.8125rem;
    font-weight: 600;
    background: var(--glass-2);
    color: var(--fg);
    border: 1px solid var(--border);
    cursor: pointer;
  }

  &__save-btn {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  }

  &__custom-card {
    border: 1px solid var(--border);
    border-radius: 0.65rem;
    padding: 0.85rem;
    margin-bottom: 0.75rem;
    background: var(--glass-1);
  }

  &__custom-head {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.65rem;
  }

  &__remove-btn {
    flex-shrink: 0;
    border: none;
    background: transparent;
    color: var(--destructive, #e55);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }

  &__role-list {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.65rem;
  }

  &__role-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    cursor: pointer;
  }

  &__actions {
    padding-top: 0.5rem;
  }
}
</style>
