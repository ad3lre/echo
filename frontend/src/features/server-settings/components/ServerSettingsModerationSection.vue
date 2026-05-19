<script setup lang="ts">
import type { ChannelCategory } from '@/composables/useChannels';
import { isEchoGraphId } from '@/utils/echoIds';
import AutomodRulesPanel from '@/features/server-settings/components/automod/AutomodRulesPanel.vue';

type ServerModerationForm = {
  explicitMediaFilterEnabled: boolean;
  raidProtectionEnabled: boolean;
  raidJoinThresholdCount: number;
  raidJoinWindowSeconds: number;
  automodSpamEnabled: boolean;
  mentionsRequireRole: boolean;
};

const props = defineProps<{
  form: ServerModerationForm;
  serverId: string;
  accessToken: string | null | undefined;
  canManageServer: boolean;
  structureCategories: ChannelCategory[];
  echoRoles: { id: string; name: string }[];
}>();

const emit = defineEmits<{
  'patch-form': [patch: Partial<ServerModerationForm>];
}>();

const EXPLICIT_MEDIA_FILTER_COMING_SOON = true;

function patchForm(patch: Partial<ServerModerationForm>) {
  emit('patch-form', patch);
}
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <div class="server-settings-panel rounded-2xl p-5">
      <div class="settings-subtitle mb-4">Protection Signals</div>
      <div class="space-y-3">
        <p
          v-if="EXPLICIT_MEDIA_FILTER_COMING_SOON"
          class="rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-3 text-xs text-fg-soft"
        >
          Explicit media filtering is
          <span class="font-semibold text-accent">coming soon</span>.
        </p>
        <label
          class="flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-glass-1"
        >
          <div>
            <div class="font-semibold text-fg">Raid Protection</div>
            <div class="text-xs text-fg-subtle">
              Detect burst joins and throttle suspicious activity automatically.
            </div>
          </div>
          <input
            type="checkbox"
            class="server-toggle shrink-0"
            :checked="props.form.raidProtectionEnabled"
            @change="
              patchForm({
                raidProtectionEnabled: ($event.target as HTMLInputElement)
                  .checked,
              })
            "
          />
        </label>

        <label
          class="flex items-center justify-between gap-4 rounded-xl px-4 py-3"
          :class="
            EXPLICIT_MEDIA_FILTER_COMING_SOON
              ? 'cursor-not-allowed opacity-60'
              : 'hover:bg-glass-1'
          "
        >
          <div>
            <div class="font-semibold text-fg">Explicit Media Filter</div>
            <div class="text-xs text-fg-subtle">
              {{
                EXPLICIT_MEDIA_FILTER_COMING_SOON
                  ? 'Coming soon - this server control is temporarily unavailable.'
                  : 'Scan and blur media flagged as explicit by default.'
              }}
            </div>
          </div>
          <input
            type="checkbox"
            class="server-toggle shrink-0"
            :disabled="EXPLICIT_MEDIA_FILTER_COMING_SOON"
            :checked="props.form.explicitMediaFilterEnabled"
            @change="
              !EXPLICIT_MEDIA_FILTER_COMING_SOON &&
              patchForm({
                explicitMediaFilterEnabled: ($event.target as HTMLInputElement)
                  .checked,
              })
            "
          />
        </label>

        <label class="block rounded-xl px-4 py-3 hover:bg-glass-1">
          <div class="mb-2">
            <div class="font-semibold text-fg">Join threshold</div>
            <div class="text-xs text-fg-subtle">
              Block new joins when this many accounts join inside the raid
              window.
            </div>
          </div>
          <input
            type="number"
            min="2"
            max="100"
            class="w-full rounded-lg border border-border bg-scrim-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-border"
            :disabled="!props.form.raidProtectionEnabled"
            :value="props.form.raidJoinThresholdCount"
            @change="
              patchForm({
                raidJoinThresholdCount: Math.min(
                  100,
                  Math.max(
                    2,
                    Math.floor(
                      Number(
                        ($event.target as HTMLInputElement).value ||
                          props.form.raidJoinThresholdCount,
                      ),
                    ),
                  ),
                ),
              })
            "
          />
        </label>

        <label class="block rounded-xl px-4 py-3 hover:bg-glass-1">
          <div class="mb-2">
            <div class="font-semibold text-fg">Raid window (seconds)</div>
            <div class="text-xs text-fg-subtle">
              Time window used to count recent joins for raid detection.
            </div>
          </div>
          <input
            type="number"
            min="10"
            max="3600"
            class="w-full rounded-lg border border-border bg-scrim-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-border"
            :disabled="!props.form.raidProtectionEnabled"
            :value="props.form.raidJoinWindowSeconds"
            @change="
              patchForm({
                raidJoinWindowSeconds: Math.min(
                  3600,
                  Math.max(
                    10,
                    Math.floor(
                      Number(
                        ($event.target as HTMLInputElement).value ||
                          props.form.raidJoinWindowSeconds,
                      ),
                    ),
                  ),
                ),
              })
            "
          />
        </label>
      </div>
    </div>

    <div class="server-settings-panel rounded-2xl p-5">
      <div class="settings-subtitle mb-4">AutoMod Defaults</div>
      <div class="space-y-3">
        <label
          class="flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-glass-1"
        >
          <div>
            <div class="font-semibold text-fg">Spam Filter</div>
            <div class="text-xs text-fg-subtle">
              Rate-limit repeated messages and excessive mention behavior.
            </div>
          </div>
          <input
            type="checkbox"
            class="server-toggle shrink-0"
            :checked="props.form.automodSpamEnabled"
            @change="
              patchForm({
                automodSpamEnabled: ($event.target as HTMLInputElement).checked,
              })
            "
          />
        </label>

        <label
          class="flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-glass-1"
        >
          <div>
            <div class="font-semibold text-fg">Mentions Require Role</div>
            <div class="text-xs text-fg-subtle">
              Only trusted roles can mass-mention server members.
            </div>
          </div>
          <input
            type="checkbox"
            class="server-toggle shrink-0"
            :checked="props.form.mentionsRequireRole"
            @change="
              patchForm({
                mentionsRequireRole: ($event.target as HTMLInputElement)
                  .checked,
              })
            "
          />
        </label>
      </div>
    </div>
    </div>

    <AutomodRulesPanel
      v-if="isEchoGraphId(serverId)"
      :server-id="serverId"
      :access-token="accessToken"
      :can-manage="canManageServer"
      :structure-categories="structureCategories"
      :echo-roles="echoRoles"
    />
  </div>
</template>
