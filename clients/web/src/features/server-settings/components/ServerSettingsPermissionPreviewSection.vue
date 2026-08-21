<script setup lang="ts">
import EchoDropdown from '@/components/EchoDropdown.vue';
import PermissionDiff from './PermissionDiff.vue';
import { toRef } from 'vue';
import { useServerSettingsPermissionPreview } from '@/features/server-settings/composables/useServerSettingsPermissionPreview';

const props = defineProps<{
  serverId: string;
  users?: { id: string; name: string; pfp?: string; status?: string }[];
  /** Omit outer panel chrome when hosted in a modal (header supplied by parent). */
  hideChrome?: boolean;
}>();

const {
  TRACE_OPTIONS,
  selectedChannelId,
  traceMode,
  compareRoleId,
  baselinePermissions,
  channelOptions,
  roleOptions,
  loading,
  error,
  summary,
  effective,
  ownerBypass,
  canLoad,
  loadExplain,
} = useServerSettingsPermissionPreview(toRef(props, 'serverId'));
</script>

<template>
  <div class="server-settings-panel rounded-2xl p-5">
    <div class="settings-subtitle mb-1">Permission preview</div>
    <p class="mb-4 text-sm text-fg-soft">
      Effective permissions for your account (server fold, then category and
      channel layers). Requires manage roles or manage server.
    </p>
    <div v-if="!canLoad" class="text-sm text-fg-subtle">
      Sign in with Echo (non-mock) to load this panel.
    </div>
    <template v-else>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <EchoDropdown
          v-model="selectedChannelId"
          :options="channelOptions"
          label="Channel context"
          surface="server"
          teleport-menu
        />
        <EchoDropdown
          v-model="traceMode"
          :options="TRACE_OPTIONS"
          label="Trace"
          surface="server"
          teleport-menu
        />
        <EchoDropdown
          v-model="compareRoleId"
          :options="roleOptions"
          label="Compare to role"
          surface="server"
          teleport-menu
        />
        <button
          type="button"
          class="mt-5 rounded-lg bg-glass-2 px-3 py-1.5 text-xs font-semibold text-fg-soft hover:bg-glass-hover"
          :disabled="loading"
          @click="loadExplain"
        >
          Refresh
        </button>
      </div>
      <div v-if="error" class="echo-error-banner rounded-lg px-3 py-2 text-sm">
        {{ error }}
      </div>
      <div v-else-if="loading" class="text-sm text-fg-subtle">Loading…</div>
      <div v-else class="space-y-3 text-sm">
        <div v-if="ownerBypass" class="echo-warn-banner rounded-lg px-3 py-2">
          Owner bypass: all permissions.
        </div>
        <div class="text-fg-soft">{{ summary }}</div>
        <div
          class="overflow-y-auto rounded-lg bg-scrim-1 px-3 py-2 font-mono text-[11px] text-fg-soft"
          :class="props.hideChrome ? 'max-h-[min(40vh,280px)]' : 'max-h-40'"
        >
          {{ effective.join(', ') }}
        </div>
        <div v-if="baselinePermissions !== null" class="pt-2">
          <PermissionDiff
            :baseline="baselinePermissions"
            :current="effective"
            :traces="[]"
          />
        </div>
      </div>
    </template>
  </div>
</template>
