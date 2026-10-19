<script setup lang="ts">
import { echoT } from '@/i18n';
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

const modes = computed(
  (): Array<{
    id: ServerAccessMode;
    label: string;
    hint: string;
    icon: string;
  }> => [
    {
      id: 'public',
      label: echoT('b36.access.public'),
      hint: echoT('b36.access.publicHint'),
      icon: icons.globe,
    },
    {
      id: 'invite_only',
      label: echoT('b36.access.inviteOnly'),
      hint: echoT('b36.access.inviteOnlyHint'),
      icon: icons.communityFilled,
    },
    {
      id: 'private',
      label: echoT('b36.access.private'),
      hint: echoT('b36.access.privateHint'),
      icon: icons.chatLock,
    },
  ],
);

function selectMode(id: ServerAccessMode) {
  if (!props.canManageServer || id === accessMode.value) return;
  emit('update:accessMode', id);
}
</script>

<template>
  <div class="server-settings-sections--flat server-settings-panel-root pb-8">
    <section class="settings-section-stack">
      <div class="settings-subtitle mb-1">
        {{ echoT('b36.access.whoCanJoin') }}
      </div>
      <p class="mb-4 text-sm text-fg-subtle">
        {{ echoT('b36.access.whoCanJoinHint') }}
      </p>

      <div
        v-if="!canManageServer"
        class="rounded-xl bg-glass-2/60 px-4 py-3 text-sm text-muted"
      >
        {{ echoT('b36.access.noPermission') }}
      </div>

      <template v-else>
        <div
          class="access-mode-segmented relative grid grid-cols-3 gap-1 rounded-2xl p-1"
          role="radiogroup"
          :aria-label="echoT('b36.access.levelAria')"
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
    </section>

    <section class="settings-section-stack">
      <div class="settings-subtitle mb-1">
        {{ echoT('b36.access.joinApplications') }}
      </div>
      <p class="mb-4 text-sm text-fg-subtle">
        {{ echoT('b36.access.joinApplicationsHint') }}
      </p>
      <ServerSettingsApplicationsSection
        :server-id="serverId"
        :can-manage-server="canManageServer"
        :access-token="accessToken"
        :workspace-servers="workspaceServers"
        omit-outer-root
        flat-sections
        @echo-workspace-refresh="emit('echo-workspace-refresh')"
      />
    </section>
  </div>
</template>
