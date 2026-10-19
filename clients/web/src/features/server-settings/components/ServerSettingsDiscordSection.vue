<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref, toRef, watch } from 'vue';
import { storeToRefs } from 'pinia';
import {
  getEchoDiscordBridge,
  putEchoDiscordBridge,
} from '@/api/echo/discordBridge';
import { useEchoWorkspace } from '@/features/layout/echoWorkspace/useEchoWorkspace';
import { discordServerImportSeparateFromAccountLink } from '@/features/discord/integrationCopy';
import { useServerSettingsDiscordImport } from '@/features/server-settings/composables/useServerSettingsDiscordImport';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { formatIsoDateTimeLocal } from '@/features/chat/formatTimestamp';
import EchoDropdown from '@/components/EchoDropdown.vue';

const props = defineProps<{
  serverId: string;
  canManageServer: boolean;
  onWorkspaceRefresh?: () => void;
}>();

const {
  state,
  loading,
  activeStep,
  refreshFromExportBusy,
  localError,
  metadataReady,
  rolesReady,
  membersReady,
  channelsReady,
  runStep,
  refreshFromExport,
} = useServerSettingsDiscordImport({
  serverId: toRef(props, 'serverId'),
  canManageServer: toRef(props, 'canManageServer'),
  onWorkspaceRefresh: props.onWorkspaceRefresh,
});

const workspace = useEchoWorkspace();
const authSession = useAuthSessionStore();
const { accessToken } = storeToRefs(authSession);

const bridgeChannelId = ref('');
const bridgeInbound = ref(false);
const bridgeOutbound = ref(false);
const bridgeWebhookDraft = ref('');
const bridgeLoading = ref(false);
const bridgeSaving = ref(false);
const bridgeError = ref('');
const bridgeHasWebhook = ref(false);

const textChannelOptions = computed(() => {
  const cats = workspace.categoriesByServer.value[props.serverId] ?? [];
  const out: { id: string; name: string }[] = [];
  for (const cat of cats) {
    for (const ch of cat.channels) {
      if (ch.type === 'text') {
        out.push({ id: ch.id, name: `#${ch.name}` });
      }
    }
  }
  return out;
});

const textChannelDropdownOptions = computed(() =>
  textChannelOptions.value.map((opt) => ({
    value: opt.id,
    label: opt.name,
  })),
);

watch(
  textChannelOptions,
  (opts) => {
    if (!opts.length) return;
    if (
      !bridgeChannelId.value ||
      !opts.some((o) => o.id === bridgeChannelId.value)
    ) {
      bridgeChannelId.value = opts[0]!.id;
    }
  },
  { immediate: true },
);

async function loadBridgeSettings() {
  const cid = bridgeChannelId.value?.trim();
  if (!cid || !channelsReady.value) return;
  const token = accessToken.value?.trim() ?? '';
  bridgeLoading.value = true;
  bridgeError.value = '';
  try {
    const s = await getEchoDiscordBridge(token, props.serverId, cid);
    bridgeInbound.value = s.inboundEnabled;
    bridgeOutbound.value = s.outboundEnabled;
    bridgeHasWebhook.value =
      s.hasWebhook === true || s.bridgeConfigured === true;
  } catch (e) {
    bridgeError.value =
      e instanceof Error ? e.message : echoT('srvSettingsA.discord.loadFail');
  } finally {
    bridgeLoading.value = false;
  }
}

watch(
  () =>
    [
      channelsReady.value,
      bridgeChannelId.value,
      authSession.authStateGeneration,
    ] as const,
  () => {
    if (channelsReady.value) void loadBridgeSettings();
  },
);

async function saveBridgeSettings() {
  const cid = bridgeChannelId.value?.trim();
  if (!cid || !props.canManageServer) return;
  const token = accessToken.value?.trim() ?? '';
  bridgeSaving.value = true;
  bridgeError.value = '';
  try {
    const url = bridgeWebhookDraft.value.trim();
    const saved = await putEchoDiscordBridge(token, props.serverId, cid, {
      inboundEnabled: bridgeInbound.value,
      outboundEnabled: bridgeOutbound.value,
      ...(url ? { discordWebhookUrl: url } : {}),
    });
    bridgeInbound.value = saved.inboundEnabled;
    bridgeOutbound.value = saved.outboundEnabled;
    bridgeHasWebhook.value =
      saved.hasWebhook === true || saved.bridgeConfigured === true;
    bridgeWebhookDraft.value = '';
    await props.onWorkspaceRefresh?.();
  } catch (e) {
    bridgeError.value =
      e instanceof Error ? e.message : echoT('srvSettingsA.discord.saveFail');
  } finally {
    bridgeSaving.value = false;
  }
}
function nextStepLabel(step: string | null | undefined): string {
  switch (step) {
    case 'metadata':
      return echoT('srvSettingsA.discord.stepMetadata');
    case 'roles':
      return echoT('srvSettingsA.discord.stepRoles');
    case 'members':
      return echoT('srvSettingsA.discord.stepMembers');
    case 'channels':
      return echoT('srvSettingsA.discord.stepChannels');
    case 'complete':
    case null:
    case undefined:
      return echoT('srvSettingsA.discord.stepComplete');
    default:
      return step;
  }
}
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <div
      v-if="channelsReady"
      class="server-settings-panel xl:col-span-2 rounded-2xl p-5"
    >
      <div class="settings-subtitle mb-2">
        {{ echoT('srvSettingsA.discord.bridgeTitle') }}
      </div>
      <i18n-t
        keypath="srvSettingsA.discord.bridgeIntro"
        tag="p"
        scope="global"
        class="mb-4 text-xs leading-relaxed text-fg-subtle"
      >
        <template #perm>
          <code class="text-fg-soft">GuildMessages</code>
        </template>
      </i18n-t>
      <div v-if="!canManageServer" class="text-sm text-fg-soft">
        {{ echoT('srvSettingsA.discord.needPermBridge') }}
      </div>
      <div v-else class="space-y-4">
        <div v-if="!textChannelOptions.length" class="text-sm text-fg-soft">
          {{ echoT('srvSettingsA.discord.noTextChannels') }}
        </div>
        <template v-else>
          <div class="max-w-md">
            <EchoDropdown
              v-model="bridgeChannelId"
              :label="echoT('srvSettingsA.discord.echoTextChannel')"
              :options="textChannelDropdownOptions"
              surface="server"
              teleport-menu
              :disabled="bridgeLoading || bridgeSaving"
            />
          </div>
          <div class="flex flex-wrap gap-6">
            <label
              class="flex cursor-pointer items-center gap-2 text-sm text-fg-soft"
            >
              <input
                v-model="bridgeInbound"
                type="checkbox"
                class="rounded border-border"
                :disabled="bridgeLoading || bridgeSaving"
              />
              {{ echoT('srvSettingsA.discord.inbound') }}
            </label>
            <label
              class="flex cursor-pointer items-center gap-2 text-sm text-fg-soft"
            >
              <input
                v-model="bridgeOutbound"
                type="checkbox"
                class="rounded border-border"
                :disabled="bridgeLoading || bridgeSaving"
              />
              {{ echoT('srvSettingsA.discord.outbound') }}
            </label>
          </div>
          <div>
            <label class="settings-label">{{
              echoT('srvSettingsA.discord.webhookUrl')
            }}</label>
            <input
              v-model="bridgeWebhookDraft"
              type="url"
              class="server-input mt-2 w-full max-w-2xl"
              placeholder="https://discord.com/api/webhooks/…"
              autocomplete="off"
              :disabled="bridgeLoading || bridgeSaving"
            />
            <p
              v-if="bridgeHasWebhook && !bridgeWebhookDraft.trim()"
              class="mt-1 text-[11px] text-fg-subtle"
            >
              {{ echoT('srvSettingsA.discord.webhookStored') }}
            </p>
          </div>
          <div v-if="bridgeError" class="text-sm echo-destructive-text">
            {{ bridgeError }}
          </div>
          <div v-if="bridgeLoading" class="text-sm text-fg-subtle">
            {{ echoT('srvSettingsA.discord.loading') }}
          </div>
          <button
            type="button"
            class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
            :disabled="bridgeLoading || bridgeSaving"
            @click="saveBridgeSettings"
          >
            {{
              bridgeSaving
                ? echoT('srvSettingsA.discord.saving')
                : echoT('srvSettingsA.discord.saveBridge')
            }}
          </button>
        </template>
      </div>
    </div>

    <div class="server-settings-panel rounded-2xl p-5">
      <div class="settings-subtitle mb-4">
        {{ echoT('srvSettingsA.discord.importTitle') }}
      </div>
      <p class="mb-4 text-xs leading-relaxed text-fg-subtle">
        {{ discordServerImportSeparateFromAccountLink() }}
      </p>
      <div v-if="!canManageServer" class="text-sm text-fg-soft">
        {{ echoT('srvSettingsA.discord.needPermImport') }}
      </div>
      <div v-else class="space-y-4">
        <div
          v-if="channelsReady"
          class="rounded-2xl bg-scrim-1 p-4 ring-1 ring-violet-500/25"
        >
          <div class="text-sm font-semibold text-fg">
            {{ echoT('srvSettingsA.discord.refreshFromExport') }}
          </div>
          <p class="mt-2 text-sm leading-relaxed text-fg-soft">
            {{ echoT('srvSettingsA.discord.refreshDesc') }}
          </p>
          <button
            type="button"
            class="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
            :disabled="
              !!activeStep ||
              refreshFromExportBusy ||
              bridgeSaving ||
              bridgeLoading
            "
            @click="refreshFromExport"
          >
            {{
              refreshFromExportBusy
                ? echoT('srvSettingsA.discord.refreshing')
                : echoT('srvSettingsA.discord.refreshLatest')
            }}
          </button>
        </div>

        <div class="rounded-2xl bg-scrim-1 p-4 ring-1 ring-white/8">
          <div class="text-sm font-semibold text-fg">
            {{ echoT('srvSettingsA.discord.source') }}
          </div>
          <div class="mt-1 text-sm text-fg-soft">
            {{ echoT('srvSettingsA.discord.sourceDesc') }}
          </div>
          <div
            v-if="state?.sourceLabel"
            class="mt-3 inline-flex rounded-full bg-glass-1 px-3 py-1 text-xs font-semibold text-fg-soft"
          >
            {{ state.sourceLabel }}
          </div>
        </div>

        <div class="grid gap-3">
          <button
            type="button"
            class="discord-import-card text-left"
            :class="metadataReady ? 'discord-import-card--done' : ''"
            :disabled="!!activeStep || refreshFromExportBusy || metadataReady"
            @click="runStep('metadata')"
          >
            <div class="text-xs uppercase tracking-[0.18em] text-fg-subtle">
              {{ echoT('srvSettingsA.discord.step1') }}
            </div>
            <div class="mt-1 text-lg font-semibold text-fg">
              {{ echoT('srvSettingsA.discord.importMetadata') }}
            </div>
            <div class="mt-2 text-sm text-fg-soft">
              {{ echoT('srvSettingsA.discord.importMetadataDesc') }}
            </div>
            <div class="mt-3 text-xs font-semibold text-fg-soft">
              {{
                metadataReady
                  ? echoT('srvSettingsA.discord.imported')
                  : activeStep === 'metadata'
                    ? echoT('serverSettingsUi.importing')
                    : echoT('serverSettingsUi.runImport')
              }}
            </div>
          </button>

          <button
            type="button"
            class="discord-import-card text-left"
            :class="rolesReady ? 'discord-import-card--done' : ''"
            :disabled="
              !!activeStep ||
              refreshFromExportBusy ||
              !metadataReady ||
              rolesReady
            "
            @click="runStep('roles')"
          >
            <div class="text-xs uppercase tracking-[0.18em] text-fg-subtle">
              {{ echoT('srvSettingsA.discord.step2') }}
            </div>
            <div class="mt-1 text-lg font-semibold text-fg">
              {{ echoT('srvSettingsA.discord.importRoles') }}
            </div>
            <div class="mt-2 text-sm text-fg-soft">
              {{ echoT('srvSettingsA.discord.importRolesDesc') }}
            </div>
            <div class="mt-3 text-xs font-semibold text-fg-soft">
              {{
                rolesReady
                  ? echoT('srvSettingsA.discord.rolesImported', {
                      n: state?.roleCount ?? 0,
                    })
                  : activeStep === 'roles'
                    ? echoT('serverSettingsUi.importing')
                    : echoT('serverSettingsUi.runImport')
              }}
            </div>
          </button>

          <button
            type="button"
            class="discord-import-card text-left"
            :class="membersReady ? 'discord-import-card--done' : ''"
            :disabled="
              !!activeStep ||
              refreshFromExportBusy ||
              !rolesReady ||
              membersReady
            "
            @click="runStep('members')"
          >
            <div class="text-xs uppercase tracking-[0.18em] text-fg-subtle">
              {{ echoT('srvSettingsA.discord.step3') }}
            </div>
            <div class="mt-1 text-lg font-semibold text-fg">
              {{ echoT('srvSettingsA.discord.importMembersRoles') }}
            </div>
            <i18n-t
              keypath="srvSettingsA.discord.step3Desc"
              tag="div"
              scope="global"
              class="mt-2 text-sm text-fg-soft"
            >
              <template #file>
                <code class="text-fg-soft">members.jsonl</code>
              </template>
            </i18n-t>
            <div class="mt-3 text-xs font-semibold text-fg-soft">
              {{
                membersReady
                  ? echoT('srvSettingsA.discord.usersMapped', {
                      n: state?.userMapEntryCount ?? 0,
                    })
                  : activeStep === 'members'
                    ? echoT('serverSettingsUi.importing')
                    : echoT('serverSettingsUi.runImport')
              }}
            </div>
          </button>

          <button
            type="button"
            class="discord-import-card text-left"
            :class="channelsReady ? 'discord-import-card--done' : ''"
            :disabled="
              !!activeStep ||
              refreshFromExportBusy ||
              !membersReady ||
              channelsReady
            "
            @click="runStep('channels')"
          >
            <div class="text-xs uppercase tracking-[0.18em] text-fg-subtle">
              {{ echoT('srvSettingsA.discord.step4') }}
            </div>
            <div class="mt-1 text-lg font-semibold text-fg">
              {{ echoT('srvSettingsA.discord.importChannels') }}
            </div>
            <div class="mt-2 text-sm text-fg-soft">
              {{ echoT('srvSettingsA.discord.importChannelsDesc') }}
            </div>
            <div class="mt-3 text-xs font-semibold text-fg-soft">
              {{
                channelsReady
                  ? echoT('srvSettingsA.discord.catsChans', {
                      cats: state?.categoryCount ?? 0,
                      chans: state?.channelCount ?? 0,
                    })
                  : activeStep === 'channels'
                    ? echoT('serverSettingsUi.importing')
                    : echoT('serverSettingsUi.runImport')
              }}
            </div>
          </button>
        </div>
      </div>
    </div>

    <div class="flex min-w-0 flex-col gap-4">
      <div class="server-settings-card rounded-2xl p-5">
        <div class="settings-subtitle mb-3">
          {{ echoT('srvSettingsA.discord.status') }}
        </div>
        <div v-if="loading" class="text-sm text-fg-subtle">
          {{ echoT('srvSettingsA.discord.loadingState') }}
        </div>
        <div v-else class="space-y-3">
          <div class="server-toggle-row">
            <div>
              <div class="text-sm font-semibold text-fg">
                {{ echoT('srvSettingsA.discord.metadata') }}
              </div>
              <div class="mt-0.5 text-xs text-fg-subtle">
                {{ echoT('srvSettingsA.discord.metadataDesc') }}
              </div>
              <div
                v-if="state?.metadataImportedAt"
                class="mt-0.5 text-[11px] text-fg-subtle"
              >
                {{ echoT('srvSettingsA.discord.completed') }}
                {{ formatIsoDateTimeLocal(state.metadataImportedAt) }}
              </div>
            </div>
            <div class="server-pill">
              {{
                metadataReady
                  ? echoT('srvSettingsA.discord.done')
                  : echoT('srvSettingsA.discord.pending')
              }}
            </div>
          </div>
          <div class="server-toggle-row">
            <div>
              <div class="text-sm font-semibold text-fg">
                {{ echoT('srvSettingsA.discord.roles') }}
              </div>
              <div class="mt-0.5 text-xs text-fg-subtle">
                {{ echoT('srvSettingsA.discord.rolesDesc') }}
              </div>
              <div
                v-if="state?.rolesImportedAt"
                class="mt-0.5 text-[11px] text-fg-subtle"
              >
                {{ echoT('srvSettingsA.discord.completed') }}
                {{ formatIsoDateTimeLocal(state.rolesImportedAt) }}
              </div>
            </div>
            <div class="server-pill">
              {{
                rolesReady
                  ? echoT('srvSettingsA.discord.done')
                  : echoT('srvSettingsA.discord.pending')
              }}
            </div>
          </div>
          <div class="server-toggle-row">
            <div>
              <div class="text-sm font-semibold text-fg">
                {{ echoT('srvSettingsA.discord.membersUserMap') }}
              </div>
              <div class="mt-0.5 text-xs text-fg-subtle">
                {{ echoT('srvSettingsA.discord.membersUserMapDesc') }}
              </div>
              <div
                v-if="state?.membersImportedAt"
                class="mt-0.5 text-[11px] text-fg-subtle"
              >
                {{ echoT('srvSettingsA.discord.completed') }}
                {{ formatIsoDateTimeLocal(state.membersImportedAt) }}
              </div>
            </div>
            <div class="server-pill">
              {{
                membersReady
                  ? echoT('srvSettingsA.discord.done')
                  : echoT('srvSettingsA.discord.pending')
              }}
            </div>
          </div>
          <div class="server-toggle-row">
            <div>
              <div class="text-sm font-semibold text-fg">
                {{ echoT('srvSettingsA.discord.channels') }}
              </div>
              <div class="mt-0.5 text-xs text-fg-subtle">
                {{ echoT('srvSettingsA.discord.channelsDesc') }}
              </div>
              <div
                v-if="state?.channelsImportedAt"
                class="mt-0.5 text-[11px] text-fg-subtle"
              >
                {{ echoT('srvSettingsA.discord.completed') }}
                {{ formatIsoDateTimeLocal(state.channelsImportedAt) }}
              </div>
            </div>
            <div class="server-pill">
              {{
                channelsReady
                  ? echoT('srvSettingsA.discord.done')
                  : echoT('srvSettingsA.discord.pending')
              }}
            </div>
          </div>
          <div class="rounded-xl bg-glass-1 px-4 py-3 text-sm text-fg-soft">
            <span class="font-semibold text-fg-soft">{{
              echoT('srvSettingsA.discord.resumeBehavior')
            }}</span>
            {{ echoT('srvSettingsA.discord.resumeDesc') }}
            <span class="font-semibold text-fg">{{
              nextStepLabel(state?.nextStep)
            }}</span>
          </div>
        </div>
      </div>

      <div class="server-settings-panel rounded-2xl p-5">
        <div class="settings-subtitle mb-3">
          {{ echoT('srvSettingsA.discord.warnings') }}
        </div>
        <div v-if="localError" class="text-sm echo-destructive-text">
          {{ localError }}
        </div>
        <div v-else-if="state?.lastError" class="text-sm echo-destructive-text">
          {{ state.lastError }}
        </div>
        <div
          v-if="(state?.roleImportIssues?.length ?? 0) > 0"
          class="mt-3 rounded-lg bg-glass-1 px-3 py-2 text-sm text-fg-soft"
        >
          <div class="font-semibold text-fg">
            {{ echoT('srvSettingsA.discord.roleReport') }}
          </div>
          <ul class="mt-2 list-disc space-y-2 pl-5">
            <li
              v-for="(issue, idx) in state?.roleImportIssues ?? []"
              :key="idx"
            >
              <span class="font-medium text-fg">{{
                issue.roleName ||
                issue.discordRoleId ||
                echoT('srvSettingsA.discord.role')
              }}</span>
              <span class="text-fg-subtle"> · {{ issue.code }}</span>
              <div class="mt-0.5 text-fg-soft">{{ issue.detail }}</div>
            </li>
          </ul>
        </div>
        <div
          v-if="localError || state?.lastError"
          class="mt-3 text-xs text-fg-subtle"
        >
          {{ echoT('srvSettingsA.discord.retryHint') }}
        </div>
        <div
          v-else-if="
            (state?.warnings?.length ?? 0) === 0 &&
            (state?.roleImportIssues?.length ?? 0) === 0
          "
          class="text-sm text-fg-soft"
        >
          {{ echoT('srvSettingsA.discord.noWarnings') }}
        </div>
        <ul
          v-else-if="(state?.warnings?.length ?? 0) > 0"
          class="list-disc space-y-2 pl-5 text-sm text-fg-soft"
        >
          <li v-for="warning in state?.warnings ?? []" :key="warning">
            {{ warning }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.discord-import-card {
  border-radius: 1rem;
  background: var(--vue-auto-299);
  padding: 1rem 1.05rem;
  box-shadow: inset 0 0 0 1px var(--vue-auto-001);
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.discord-import-card:hover:enabled {
  background: var(--vue-auto-005);
  transform: translateY(-1px);
}

.discord-import-card:disabled {
  cursor: default;
  opacity: 0.72;
}

.discord-import-card--done {
  background: var(--vue-auto-300);
  box-shadow: inset 0 0 0 1px var(--vue-auto-301);
}

/* preview UI removed */
</style>
