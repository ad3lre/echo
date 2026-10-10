<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useServerSelfRolesStore } from '@/features/self-roles/serverSelfRoles';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
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

<style scoped lang="scss" src="./styles/SelfAssignableRolesWidget.scss"></style>
