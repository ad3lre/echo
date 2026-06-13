<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useServerSelfRolesStore } from '@/stores/serverSelfRoles';
import { useAuthSessionStore } from '@/stores/authSession';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { ECHO_SELF_ROLES_CHANNEL_NAME } from '@shared/types/selfAssignableRoles';
import type { SelfRolesPanelRole } from '@shared/types/selfAssignableRoles';

/** Matches `MessageList` top inset under the absolute guild chat header (`h-12`). */
const GUILD_CHAT_HEADER_INSET_PX = 44;

const props = defineProps<{
  serverId: string;
  channelId: string;
  channelType?: string;
  channelDisplayName?: string;
  headerOverlayInsetPx?: number;
}>();

const selfRolesStore = useServerSelfRolesStore();
const authSession = useAuthSessionStore();
const { mutating, loading } = storeToRefs(selfRolesStore);

const activeCategoryId = ref<string | null>(null);
const busyRoleId = ref<string | null>(null);
const panelLoading = ref(false);

const config = computed(() => selfRolesStore.configFor(props.serverId));
const panel = computed(() => selfRolesStore.panelFor(props.serverId));

const isStandalone = computed(() => props.channelType === 'selfRoles');

const isPanelChannel = computed(() => {
  if (config.value?.enabled !== true) return false;
  return isStandalone.value;
});

const topInsetPx = computed(() => {
  if (!isStandalone.value) return 0;
  if (
    typeof props.headerOverlayInsetPx === 'number' &&
    Number.isFinite(props.headerOverlayInsetPx) &&
    props.headerOverlayInsetPx > 0
  ) {
    return props.headerOverlayInsetPx;
  }
  return GUILD_CHAT_HEADER_INSET_PX;
});

const resolvedTitle = computed(() => {
  const raw = props.channelDisplayName?.trim();
  if (raw && raw !== ECHO_SELF_ROLES_CHANNEL_NAME) return raw;
  if (raw === ECHO_SELF_ROLES_CHANNEL_NAME) return 'Self-assignable roles';
  return config.value?.channelName?.trim() || 'Self-assignable roles';
});

const categories = computed(() => panel.value?.categories ?? []);
const assignedSet = computed(() => new Set(panel.value?.assignedRoleIds ?? []));

const assignedCount = computed(() => assignedSet.value.size);

const totalRoleCount = computed(() =>
  categories.value.reduce((n, cat) => n + cat.roles.length, 0),
);

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

async function refreshPanel() {
  const token = authSession.accessToken ?? '';
  if (!token || !isPanelChannel.value) return;
  panelLoading.value = true;
  try {
    await selfRolesStore.loadPanel(props.serverId, token);
  } finally {
    panelLoading.value = false;
  }
}

onMounted(async () => {
  const token = authSession.accessToken ?? '';
  if (!config.value) {
    await selfRolesStore.loadConfig(props.serverId, token);
  }
  await refreshPanel();
});

watch(isPanelChannel, (on) => {
  if (on) void refreshPanel();
});

async function onToggleRole(roleId: string, assign: boolean) {
  const token = authSession.accessToken ?? '';
  if (!token || busyRoleId.value) return;
  busyRoleId.value = roleId;
  try {
    const ok = await selfRolesStore.toggleRole(
      props.serverId,
      token,
      roleId,
      assign,
    );
    if (!ok && selfRolesStore.lastError) {
      dispatchAppToast(selfRolesStore.lastError, 'warning');
    }
  } finally {
    busyRoleId.value = null;
  }
}

function roleAccentStyle(role: SelfRolesPanelRole) {
  const c = role.color?.trim() || '#99aab5';
  return {
    '--role-accent': c,
    borderColor: `color-mix(in srgb, ${c} 40%, var(--border))`,
    background: `color-mix(in srgb, ${c} 10%, var(--bg-secondary))`,
  } as Record<string, string>;
}
</script>

<template>
  <div
    v-if="isPanelChannel"
    class="self-roles-widget"
    :class="{ 'self-roles-widget--standalone': isStandalone }"
    :style="isStandalone ? { paddingTop: `${topInsetPx}px` } : undefined"
  >
    <div class="self-roles-widget__scroll">
      <header class="self-roles-widget__hero">
        <div class="self-roles-widget__hero-copy">
          <h2 v-if="!isStandalone" class="self-roles-widget__title">
            {{ resolvedTitle }}
          </h2>
          <p class="self-roles-widget__desc">
            Choose the roles you qualify for. You can only pick roles whose
            permissions are a subset of what you already have.
          </p>
        </div>
        <div
          v-if="totalRoleCount > 0"
          class="self-roles-widget__stats"
          aria-label="Role assignment summary"
        >
          <span class="self-roles-widget__stat">
            <span class="self-roles-widget__stat-value">{{
              assignedCount
            }}</span>
            <span class="self-roles-widget__stat-label">assigned</span>
          </span>
          <span class="self-roles-widget__stat-divider" aria-hidden="true" />
          <span class="self-roles-widget__stat">
            <span class="self-roles-widget__stat-value">{{
              totalRoleCount
            }}</span>
            <span class="self-roles-widget__stat-label">available</span>
          </span>
        </div>
      </header>

      <div
        v-if="panelLoading || (loading && !panel)"
        class="self-roles-widget__loading text-sm text-fg-soft"
      >
        Loading roles…
      </div>

      <template v-else>
        <div
          v-if="categories.length > 1"
          class="self-roles-widget__tabs"
          role="tablist"
          :aria-label="`${resolvedTitle} categories`"
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
            <span class="truncate">{{ cat.name }}</span>
            <span class="self-roles-widget__tab-count">{{
              cat.roles.length
            }}</span>
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
          class="self-roles-widget__empty"
          role="status"
        >
          <p class="self-roles-widget__empty-title">Nothing to assign yet</p>
          <p class="self-roles-widget__empty-desc">
            A server admin needs to mark roles as
            <span class="text-fg-soft">Self-selectable</span> and expose them in
            synced role categories or channels under Server Settings.
          </p>
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
              :style="roleAccentStyle(role)"
              :class="{
                'self-roles-widget__role-label--assigned': assignedSet.has(
                  role.id,
                ),
              }"
            >
              <span class="self-roles-widget__role-leading">
                <span class="self-roles-widget__role-dot" aria-hidden="true" />
                <span class="self-roles-widget__role-name">{{
                  role.name
                }}</span>
              </span>
              <input
                type="checkbox"
                class="server-toggle shrink-0"
                :checked="assignedSet.has(role.id)"
                :disabled="mutating || busyRoleId === role.id"
                :aria-label="
                  assignedSet.has(role.id)
                    ? `Remove role ${role.name}`
                    : `Assign role ${role.name}`
                "
                @change="
                  onToggleRole(
                    role.id,
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              />
            </label>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.self-roles-widget {
  &--standalone {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 1rem 1.25rem;
  }

  &__hero {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.35rem 0 1rem;
  }

  &__title {
    font-size: 1.125rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    color: var(--color-fg, var(--fg));
  }

  &__desc {
    margin-top: 0.4rem;
    max-width: 36rem;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--color-fg-muted, var(--fg-subtle));
  }

  &__stats {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.55rem 0.85rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    background: var(--glass-1, var(--bg-secondary));
  }

  &__stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 3.25rem;
  }

  &__stat-value {
    font-size: 1.125rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
  }

  &__stat-label {
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-subtle);
  }

  &__stat-divider {
    width: 1px;
    align-self: stretch;
    background: var(--border);
  }

  &__loading {
    padding: 2rem 0;
    text-align: center;
  }

  &__tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-bottom: 0.85rem;
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 0.35rem 0 0.65rem;
    background: linear-gradient(
      to bottom,
      var(--echo-chat-view-bg, var(--bg-primary)) 70%,
      transparent
    );
  }

  &__tab {
    border-radius: 999px;
    border: 1px solid var(--border);
    background: transparent;
    padding: 0.32rem 0.55rem 0.32rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fg-soft);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    max-width: 100%;

    &--active {
      background: var(--glass-2);
      color: var(--fg);
      border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
    }
  }

  &__tab-count {
    min-width: 1.25rem;
    padding: 0.05rem 0.35rem;
    border-radius: 999px;
    background: var(--glass-2);
    font-size: 0.625rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  &__tab-badge {
    font-size: 0.5625rem;
    font-weight: 600;
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  &__roles {
    display: grid;
    gap: 0.5rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  &__role-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.65rem 0.85rem;
    border-radius: 0.65rem;
    border: 1px solid var(--border);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;

    &--assigned {
      box-shadow: inset 0 0 0 1px
        color-mix(in srgb, var(--role-accent, var(--accent)) 25%, transparent);
    }
  }

  &__role-leading {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  &__role-dot {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 999px;
    background: var(--role-accent, #99aab5);
    flex-shrink: 0;
  }

  &__role-name {
    font-size: 0.875rem;
    font-weight: 550;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__empty {
    margin-top: 0.5rem;
    padding: 2rem 1rem;
    text-align: center;
    border-radius: 0.85rem;
    border: 1px dashed var(--border);
    background: color-mix(in srgb, var(--glass-1) 65%, transparent);
  }

  &__empty-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--fg);
  }

  &__empty-desc {
    margin-top: 0.45rem;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--fg-subtle);
    max-width: 24rem;
    margin-inline: auto;
  }
}
</style>
