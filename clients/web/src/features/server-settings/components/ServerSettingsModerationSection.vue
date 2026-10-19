<script setup lang="ts">
import { echoT } from '@/i18n';
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
        <div class="settings-subtitle mb-4">
          {{ echoT('b11.mod.protectionSignals') }}
        </div>
        <div class="space-y-3">
          <p
            v-if="EXPLICIT_MEDIA_FILTER_COMING_SOON"
            class="rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-3 text-xs text-fg-soft"
          >
            <i18n-t keypath="b11.mod.comingSoonBanner" scope="global">
              <template #soon>
                <span class="font-semibold text-accent">{{
                  echoT('b11.mod.comingSoonWord')
                }}</span>
              </template>
            </i18n-t>
          </p>
          <label
            class="flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-glass-1"
          >
            <div>
              <div class="font-semibold text-fg">
                {{ echoT('b11.mod.raidProtection') }}
              </div>
              <div class="text-xs text-fg-subtle">
                {{ echoT('b11.mod.raidProtectionDesc') }}
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
              <div class="font-semibold text-fg">
                {{ echoT('b11.mod.explicitFilter') }}
              </div>
              <div class="text-xs text-fg-subtle">
                {{
                  EXPLICIT_MEDIA_FILTER_COMING_SOON
                    ? echoT('b11.mod.comingSoonUnavailable')
                    : echoT('b11.mod.explicitFilterDesc')
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
                  explicitMediaFilterEnabled: (
                    $event.target as HTMLInputElement
                  ).checked,
                })
              "
            />
          </label>

          <label class="block rounded-xl px-4 py-3 hover:bg-glass-1">
            <div class="mb-2">
              <div class="font-semibold text-fg">
                {{ echoT('b11.mod.joinThreshold') }}
              </div>
              <div class="text-xs text-fg-subtle">
                {{ echoT('b11.mod.joinThresholdDesc') }}
              </div>
            </div>
            <input
              type="number"
              min="2"
              max="100"
              class="echo-settings-field w-full rounded-lg px-3 py-2 text-sm outline-none transition focus:border-[var(--echo-control-border-focus)]"
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
              <div class="font-semibold text-fg">
                {{ echoT('b11.mod.raidWindow') }}
              </div>
              <div class="text-xs text-fg-subtle">
                {{ echoT('b11.mod.raidWindowDesc') }}
              </div>
            </div>
            <input
              type="number"
              min="10"
              max="3600"
              class="echo-settings-field w-full rounded-lg px-3 py-2 text-sm outline-none transition focus:border-[var(--echo-control-border-focus)]"
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
        <div class="settings-subtitle mb-4">
          {{ echoT('b11.mod.automodDefaults') }}
        </div>
        <div class="space-y-3">
          <label
            class="flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-glass-1"
          >
            <div>
              <div class="font-semibold text-fg">
                {{ echoT('b11.mod.spamFilter') }}
              </div>
              <div class="text-xs text-fg-subtle">
                {{ echoT('b11.mod.spamFilterDesc') }}
              </div>
            </div>
            <input
              type="checkbox"
              class="server-toggle shrink-0"
              :checked="props.form.automodSpamEnabled"
              @change="
                patchForm({
                  automodSpamEnabled: ($event.target as HTMLInputElement)
                    .checked,
                })
              "
            />
          </label>

          <label
            class="flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-glass-1"
          >
            <div>
              <div class="font-semibold text-fg">
                {{ echoT('b11.mod.mentionsRequireRole') }}
              </div>
              <div class="text-xs text-fg-subtle">
                {{ echoT('b11.mod.mentionsRequireRoleDesc') }}
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
  </div>
</template>
