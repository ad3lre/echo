<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { storeToRefs } from 'pinia';
import {
  getEchoDiscordBridge,
  putEchoDiscordBridge,
} from '@/api/echo/discordBridge';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { discordServerImportSeparateFromAccountLink } from '@/features/discord/discordIntegrationCopy';
import { useServerSettingsDiscordImport } from '@/features/server-settings/composables/useServerSettingsDiscordImport';
import { useAuthSessionStore } from '@/stores/authSession';
import { formatIsoDateTimeLocal } from '@/utils/formatTimestamp';

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
    bridgeHasWebhook.value = s.hasWebhook;
  } catch (e) {
    bridgeError.value =
      e instanceof Error ? e.message : 'Could not load bridge settings.';
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
    await putEchoDiscordBridge(token, props.serverId, cid, {
      inboundEnabled: bridgeInbound.value,
      outboundEnabled: bridgeOutbound.value,
      ...(url ? { discordWebhookUrl: url } : {}),
    });
    await loadBridgeSettings();
    await props.onWorkspaceRefresh?.();
  } catch (e) {
    bridgeError.value =
      e instanceof Error ? e.message : 'Could not save bridge settings.';
  } finally {
    bridgeSaving.value = false;
  }
}
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <div
      v-if="channelsReady"
      class="server-settings-panel xl:col-span-2 rounded-2xl p-5"
    >
      <div class="settings-subtitle mb-2">Discord realtime bridge</div>
      <p class="mb-4 text-xs leading-relaxed text-fg-subtle">
        Mirror messages between this Echo channel and Discord. Inbound requires
        the Echo export bot online with
        <code class="text-fg-soft">GuildMessages</code> + Message Content.
        Outbound uses a Discord incoming webhook (paste the URL from Channel
        settings → Integrations → Webhooks). Webhook messages show a custom name
        and avatar per Echo user — they are not real Discord accounts.
      </p>
      <div v-if="!canManageServer" class="text-sm text-fg-soft">
        You need permission to manage this server to configure the bridge.
      </div>
      <div v-else class="space-y-4">
        <div v-if="!textChannelOptions.length" class="text-sm text-fg-soft">
          No text channels in this server.
        </div>
        <template v-else>
          <div>
            <label class="settings-label">Echo text channel</label>
            <select
              v-model="bridgeChannelId"
              class="server-input mt-2 w-full max-w-md"
              :disabled="bridgeLoading || bridgeSaving"
            >
              <option
                v-for="opt in textChannelOptions"
                :key="opt.id"
                :value="opt.id"
              >
                {{ opt.name }}
              </option>
            </select>
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
              Discord → Echo (live)
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
              Echo → Discord
            </label>
          </div>
          <div>
            <label class="settings-label"
              >Discord webhook URL (for Echo → Discord)</label
            >
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
              A webhook is already stored; leave blank to keep it, or paste a
              new URL to replace.
            </p>
          </div>
          <div v-if="bridgeError" class="text-sm echo-destructive-text">
            {{ bridgeError }}
          </div>
          <div v-if="bridgeLoading" class="text-sm text-fg-subtle">
            Loading…
          </div>
          <button
            type="button"
            class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
            :disabled="bridgeLoading || bridgeSaving"
            @click="saveBridgeSettings"
          >
            {{ bridgeSaving ? 'Saving…' : 'Save bridge' }}
          </button>
        </template>
      </div>
    </div>

    <div class="server-settings-panel rounded-2xl p-5">
      <div class="settings-subtitle mb-4">Discord Import</div>
      <p class="mb-4 text-xs leading-relaxed text-fg-subtle">
        {{ discordServerImportSeparateFromAccountLink }}
      </p>
      <div v-if="!canManageServer" class="text-sm text-fg-soft">
        You need permission to manage this server to run Discord import.
      </div>
      <div v-else class="space-y-4">
        <div
          v-if="channelsReady"
          class="rounded-2xl bg-scrim-1 p-4 ring-1 ring-violet-500/25"
        >
          <div class="text-sm font-semibold text-fg">
            Refresh from Discord export
          </div>
          <p class="mt-2 text-sm leading-relaxed text-fg-soft">
            After the export bot writes a new bundle to the server folder, run
            this to re-apply branding and the imported emoji pack, then rebuild
            categories and channels from the export. Use it to fix a bad import,
            pick up new channels, or sync layout changes. All messages in guild
            channels are removed when channels are replaced.
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
                ? 'Refreshing…'
                : 'Refresh from latest export'
            }}
          </button>
        </div>

        <div class="rounded-2xl bg-scrim-1 p-4 ring-1 ring-white/8">
          <div class="text-sm font-semibold text-fg">Source</div>
          <div class="mt-1 text-sm text-fg-soft">
            The import reads from the fixed MTI export configured on the
            backend.
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
              Step 1
            </div>
            <div class="mt-1 text-lg font-semibold text-fg">
              Import metadata
            </div>
            <div class="mt-2 text-sm text-fg-soft">
              Pull the server name, description, icon, and banner from the
              Discord export.
            </div>
            <div class="mt-3 text-xs font-semibold text-fg-soft">
              {{
                metadataReady
                  ? 'Imported'
                  : activeStep === 'metadata'
                    ? 'Importing...'
                    : 'Run import'
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
              Step 2
            </div>
            <div class="mt-1 text-lg font-semibold text-fg">Import roles</div>
            <div class="mt-2 text-sm text-fg-soft">
              Translate Discord roles into Echo roles and restore hierarchy
              ordering.
            </div>
            <div class="mt-3 text-xs font-semibold text-fg-soft">
              {{
                rolesReady
                  ? `${state?.roleCount ?? 0} roles imported`
                  : activeStep === 'roles'
                    ? 'Importing...'
                    : 'Run import'
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
              Step 3
            </div>
            <div class="mt-1 text-lg font-semibold text-fg">
              Import members &amp; roles
            </div>
            <div class="mt-2 text-sm text-fg-soft">
              Build the Discord user -&gt; Echo user map from
              <code class="text-fg-soft">members.jsonl</code> and restore each
              member's roles so linked accounts keep them after merge.
            </div>
            <div class="mt-3 text-xs font-semibold text-fg-soft">
              {{
                membersReady
                  ? `${state?.userMapEntryCount ?? 0} users mapped`
                  : activeStep === 'members'
                    ? 'Importing...'
                    : 'Run import'
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
              Step 4
            </div>
            <div class="mt-1 text-lg font-semibold text-fg">
              Import channels
            </div>
            <div class="mt-2 text-sm text-fg-soft">
              Create categories, channels, and translated overwrite rows from
              the export.
            </div>
            <div class="mt-3 text-xs font-semibold text-fg-soft">
              {{
                channelsReady
                  ? `${state?.categoryCount ?? 0} categories, ${state?.channelCount ?? 0} channels`
                  : activeStep === 'channels'
                    ? 'Importing...'
                    : 'Run import'
              }}
            </div>
          </button>
        </div>
      </div>
    </div>

    <div class="flex min-w-0 flex-col gap-4">
      <div class="server-settings-card rounded-2xl p-5">
        <div class="settings-subtitle mb-3">Status</div>
        <div v-if="loading" class="text-sm text-fg-subtle">
          Loading Discord import state...
        </div>
        <div v-else class="space-y-3">
          <div class="server-toggle-row">
            <div>
              <div class="text-sm font-semibold text-fg">Metadata</div>
              <div class="mt-0.5 text-xs text-fg-subtle">
                Server branding and top-level details.
              </div>
              <div
                v-if="state?.metadataImportedAt"
                class="mt-0.5 text-[11px] text-fg-subtle"
              >
                Completed
                {{ formatIsoDateTimeLocal(state.metadataImportedAt) }}
              </div>
            </div>
            <div class="server-pill">
              {{ metadataReady ? 'Done' : 'Pending' }}
            </div>
          </div>
          <div class="server-toggle-row">
            <div>
              <div class="text-sm font-semibold text-fg">Roles</div>
              <div class="mt-0.5 text-xs text-fg-subtle">
                Translated Echo roles and role order.
              </div>
              <div
                v-if="state?.rolesImportedAt"
                class="mt-0.5 text-[11px] text-fg-subtle"
              >
                Completed
                {{ formatIsoDateTimeLocal(state.rolesImportedAt) }}
              </div>
            </div>
            <div class="server-pill">{{ rolesReady ? 'Done' : 'Pending' }}</div>
          </div>
          <div class="server-toggle-row">
            <div>
              <div class="text-sm font-semibold text-fg">
                Members &amp; user map
              </div>
              <div class="mt-0.5 text-xs text-fg-subtle">
                Discord -&gt; Echo user ids and per-member roles.
              </div>
              <div
                v-if="state?.membersImportedAt"
                class="mt-0.5 text-[11px] text-fg-subtle"
              >
                Completed
                {{ formatIsoDateTimeLocal(state.membersImportedAt) }}
              </div>
            </div>
            <div class="server-pill">
              {{ membersReady ? 'Done' : 'Pending' }}
            </div>
          </div>
          <div class="server-toggle-row">
            <div>
              <div class="text-sm font-semibold text-fg">Channels</div>
              <div class="mt-0.5 text-xs text-fg-subtle">
                Categories, channels, and role overwrite rows.
              </div>
              <div
                v-if="state?.channelsImportedAt"
                class="mt-0.5 text-[11px] text-fg-subtle"
              >
                Completed
                {{ formatIsoDateTimeLocal(state.channelsImportedAt) }}
              </div>
            </div>
            <div class="server-pill">
              {{ channelsReady ? 'Done' : 'Pending' }}
            </div>
          </div>
          <div class="rounded-xl bg-glass-1 px-4 py-3 text-sm text-fg-soft">
            <span class="font-semibold text-fg-soft">Resume behavior:</span>
            Import picks up from the next incomplete step. Current next step:
            <span class="font-semibold text-fg">{{
              state?.nextStep ?? 'complete'
            }}</span>
          </div>
        </div>
      </div>

      <div class="server-settings-panel rounded-2xl p-5">
        <div class="settings-subtitle mb-3">Warnings</div>
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
          <div class="font-semibold text-fg">Role import report</div>
          <ul class="mt-2 list-disc space-y-2 pl-5">
            <li
              v-for="(issue, idx) in state?.roleImportIssues ?? []"
              :key="idx"
            >
              <span class="font-medium text-fg">{{
                issue.roleName || issue.discordRoleId || 'Role'
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
          Fix the problem, then retry the failed step. Details above are also
          saved on the import state for this server.
        </div>
        <div
          v-else-if="
            (state?.warnings?.length ?? 0) === 0 &&
            (state?.roleImportIssues?.length ?? 0) === 0
          "
          class="text-sm text-fg-soft"
        >
          No import warnings yet.
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
