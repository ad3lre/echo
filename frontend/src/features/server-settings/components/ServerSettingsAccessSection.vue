<script setup lang="ts">
import { computed } from 'vue';
import type { Ref } from 'vue';
import { icons } from '@/assets/icons';
import ServerSettingsApplicationsSection from '@/features/server-settings/components/ServerSettingsApplicationsSection.vue';

export type ServerAccessMode = 'public' | 'invite_only' | 'private';

const props = defineProps<{
  serverId: string;
  canManageServer: boolean;
  accessToken: string | null | undefined;
  workspaceServers: Ref<unknown[]>;
  listedInDirectoryEnabled: boolean;
  inviteJoinEnabled: boolean;
}>();

const emit = defineEmits<{
  'update:accessMode': [mode: ServerAccessMode];
  'echo-workspace-refresh': [];
}>();

const accessMode = computed((): ServerAccessMode => {
  if (props.listedInDirectoryEnabled) return 'public';
  if (props.inviteJoinEnabled) return 'invite_only';
  return 'private';
});

const modes: Array<{
  id: ServerAccessMode;
  label: string;
  hint: string;
  icon: string;
}> = [
  {
    id: 'public',
    label: 'Public',
    hint: 'Listed on Explore; anyone can discover and join from there.',
    icon: icons.globe,
  },
  {
    id: 'invite_only',
    label: 'Invite only',
    hint: 'Hidden from Explore; people can still join with a vanity or invite link.',
    icon: icons.communityFilled,
  },
  {
    id: 'private',
    label: 'Private',
    hint: 'Hidden from Explore; invite links cannot add new members.',
    icon: icons.chatLock,
  },
];

function selectMode(id: ServerAccessMode) {
  if (!props.canManageServer || id === accessMode.value) return;
  emit('update:accessMode', id);
}
</script>

<template>
  <div class="server-settings-panel-root space-y-5 pb-8">
    <div class="server-settings-panel rounded-2xl p-4 sm:p-5">
      <div class="settings-subtitle mb-1">Who can join</div>
      <p class="mb-4 text-sm text-fg-subtle">
        Choose how new members discover and enter this server.
      </p>

      <div
        v-if="!canManageServer"
        class="rounded-xl border border-[var(--border)] bg-[var(--set-card-bg)] px-4 py-3 text-sm text-muted"
      >
        You don’t have permission to change access settings.
      </div>

      <template v-else>
        <div
          class="relative grid grid-cols-3 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--set-card-bg)] p-1"
          role="radiogroup"
          aria-label="Server access level"
        >
          <button
            v-for="m in modes"
            :key="m.id"
            type="button"
            role="radio"
            :aria-checked="accessMode === m.id"
            class="relative z-10 flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-center transition-colors"
            :class="
              accessMode === m.id
                ? 'bg-[var(--accent)] text-[var(--accent-contrast-fg)] shadow-sm'
                : 'text-fg-soft hover:bg-[var(--set-action-hover-bg)] hover:text-fg'
            "
            @click="selectMode(m.id)"
          >
            <img
              :src="m.icon"
              alt=""
              class="h-5 w-5 shrink-0 opacity-90 filter invert"
            />
            <span class="text-[11px] font-bold leading-tight sm:text-xs">{{
              m.label
            }}</span>
          </button>
        </div>
        <p class="mt-3 text-xs leading-relaxed text-fg-subtle">
          {{ modes.find((x) => x.id === accessMode)?.hint }}
        </p>
      </template>
    </div>

    <div class="server-settings-panel rounded-2xl p-4 sm:p-5">
      <div class="settings-subtitle mb-1">Join applications</div>
      <p class="mb-4 text-sm text-fg-subtle">
        Optional waitlist and questionnaire for people joining your server.
      </p>
      <ServerSettingsApplicationsSection
        :server-id="serverId"
        :can-manage-server="canManageServer"
        :access-token="accessToken"
        :workspace-servers="workspaceServers"
        omit-outer-root
        @echo-workspace-refresh="emit('echo-workspace-refresh')"
      />
    </div>
  </div>
</template>
