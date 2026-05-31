<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useServerSelfRolesStore } from '@/stores/serverSelfRoles';
import { useAuthSessionStore } from '@/stores/authSession';
import { storeToRefs } from 'pinia';

const props = defineProps<{
  serverId: string;
  channelId: string;
}>();

const selfRolesStore = useServerSelfRolesStore();
const authSession = useAuthSessionStore();
const { mutating } = storeToRefs(selfRolesStore);

const activeCategoryId = ref<string | null>(null);
const busyRoleId = ref<string | null>(null);

const config = computed(() => selfRolesStore.configFor(props.serverId));
const panel = computed(() => selfRolesStore.panelFor(props.serverId));

const isPanelChannel = computed(
  () =>
    config.value?.enabled === true &&
    config.value.panelChannelId === props.channelId,
);

const categories = computed(() => panel.value?.categories ?? []);
const assignedSet = computed(() => new Set(panel.value?.assignedRoleIds ?? []));

const activeCategory = computed(() => {
  const cats = categories.value;
  if (!cats.length) return null;
  const id = activeCategoryId.value;
  if (id) return cats.find((c) => c.id === id) ?? cats[0]!;
  return cats[0]!;
});

watch(
  categories,
  (cats) => {
    if (!cats.length) {
      activeCategoryId.value = null;
      return;
    }
    if (
      !activeCategoryId.value ||
      !cats.some((c) => c.id === activeCategoryId.value)
    ) {
      activeCategoryId.value = cats[0]!.id;
    }
  },
  { immediate: true },
);

onMounted(async () => {
  const token = authSession.accessToken ?? '';
  if (!config.value) {
    await selfRolesStore.loadConfig(props.serverId, token);
  }
  if (isPanelChannel.value) {
    await selfRolesStore.loadPanel(props.serverId, token);
  }
});

watch(isPanelChannel, async (on) => {
  if (!on) return;
  const token = authSession.accessToken ?? '';
  await selfRolesStore.loadPanel(props.serverId, token);
});

async function onToggleRole(roleId: string, assign: boolean) {
  const token = authSession.accessToken ?? '';
  if (!token || busyRoleId.value) return;
  busyRoleId.value = roleId;
  try {
    await selfRolesStore.toggleRole(props.serverId, token, roleId, assign);
  } finally {
    busyRoleId.value = null;
  }
}

function roleChipStyle(role: { color: string }) {
  const c = role.color?.trim() || '#99aab5';
  return {
    '--role-chip-color': c,
    borderColor: `color-mix(in srgb, ${c} 45%, var(--border))`,
    background: `color-mix(in srgb, ${c} 12%, var(--bg-secondary))`,
  } as Record<string, string>;
}
</script>

<template>
  <div v-if="isPanelChannel" class="self-roles-widget">
    <div class="self-roles-widget__card">
      <div class="self-roles-widget__header">
        <h3 class="self-roles-widget__title">Self-assignable roles</h3>
        <p class="self-roles-widget__desc">
          Pick roles you qualify for. You can only assign roles whose
          permissions are a subset of what you already have.
        </p>
      </div>

      <div
        v-if="categories.length > 1"
        class="self-roles-widget__tabs"
        role="tablist"
        aria-label="Role categories"
      >
        <button
          v-for="cat in categories"
          :key="cat.id"
          type="button"
          role="tab"
          class="self-roles-widget__tab chat-focus-ring"
          :class="{
            'self-roles-widget__tab--active': activeCategory?.id === cat.id,
          }"
          :aria-selected="activeCategory?.id === cat.id"
          @click="activeCategoryId = cat.id"
        >
          {{ cat.name }}
          <span
            v-if="cat.source === 'derived'"
            class="self-roles-widget__tab-badge"
            title="Synced from role category"
          >
            synced
          </span>
        </button>
      </div>

      <div
        v-if="!categories.length"
        class="self-roles-widget__empty text-sm text-muted"
      >
        No self-assignable roles are configured yet. Ask a server admin to
        enable roles with the Self-selectable permission.
      </div>

      <ul
        v-else-if="activeCategory"
        class="self-roles-widget__roles"
        role="list"
      >
        <li
          v-for="role in activeCategory.roles"
          :key="role.id"
          class="self-roles-widget__role-row"
        >
          <label
            class="self-roles-widget__role-label chat-focus-ring"
            :style="roleChipStyle(role)"
          >
            <input
              type="checkbox"
              class="server-toggle"
              :checked="assignedSet.has(role.id)"
              :disabled="
                mutating || busyRoleId === role.id || busyRoleId != null
              "
              @change="
                onToggleRole(
                  role.id,
                  ($event.target as HTMLInputElement).checked,
                )
              "
            />
            <span class="self-roles-widget__role-name">{{ role.name }}</span>
          </label>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped lang="scss">
.self-roles-widget {
  padding: 0.75rem 1rem 0;

  &__card {
    background: var(--color-bg-secondary, var(--bg-secondary));
    border: 1px solid var(--color-border, var(--border));
    border-radius: 0.75rem;
    padding: 1.25rem 1.35rem;
  }

  &__header {
    margin-bottom: 0.85rem;
  }

  &__title {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--color-fg, var(--fg));
  }

  &__desc {
    margin-top: 0.35rem;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--color-fg-muted, var(--fg-subtle));
  }

  &__tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 0.85rem;
  }

  &__tab {
    border-radius: 999px;
    border: 1px solid var(--color-border, var(--border));
    background: transparent;
    padding: 0.28rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-fg-muted, var(--fg-soft));
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;

    &--active {
      background: var(--color-bg-tertiary, var(--glass-2));
      color: var(--color-fg, var(--fg));
    }
  }

  &__tab-badge {
    font-size: 0.625rem;
    font-weight: 500;
    opacity: 0.65;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  &__roles {
    display: grid;
    gap: 0.45rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  &__role-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.55rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid var(--color-border, var(--border));
    cursor: pointer;
  }

  &__role-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-fg, var(--fg));
  }

  &__empty {
    padding: 0.5rem 0;
    text-align: center;
  }
}
</style>
