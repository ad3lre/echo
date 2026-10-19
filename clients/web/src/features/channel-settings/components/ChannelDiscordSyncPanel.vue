<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref, watch } from 'vue';
import EchoDropdown from '@/components/EchoDropdown.vue';
import { icons } from '@/assets/icons';
import { useAuthSessionStore } from '@/features/auth/authSession';
import {
  deleteEchoDiscordBridge,
  getEchoDiscordBridge,
  getEchoDiscordBridgeChannels,
  getEchoDiscordBridgeGuilds,
  putEchoDiscordBridge,
  type EchoDiscordBridgeChannelOption,
  type EchoDiscordBridgeGuildOption,
} from '@/api/echo/discordBridge';

const props = defineProps<{
  serverId: string;
  channelId: string;
  channelType: 'text' | 'forum';
}>();

const authSession = useAuthSessionStore();

const loading = ref(false);
const saving = ref(false);
const clearing = ref(false);
const error = ref('');

const guildsLoading = ref(false);
const guilds = ref<EchoDiscordBridgeGuildOption[]>([]);
const guildsMeta = ref({
  linked: true,
  tokenExpired: false,
  missingGuildsScope: false,
  botConfigured: true,
});

const channelsLoading = ref(false);
const channels = ref<EchoDiscordBridgeChannelOption[]>([]);

const selectedGuildId = ref('');
const selectedChannelId = ref('');

const inboundEnabled = ref(false);
const outboundEnabled = ref(false);
const hasWebhook = ref(false);
const hasBridge = ref(false);
/** Suppress guild→channel reset while bridge state is loaded from the API. */
const syncingFromBridgeLoad = ref(false);
/** Optional manual webhook override (advanced). */
const webhookOverride = ref('');
const clearWebhook = ref(false);

/** Cookie sessions have no client `accessToken`; `echoFetch` uses `credentials: 'include'`. */
const canUse = computed(
  () =>
    authSession.isAuthenticated && authSession.backendUser?.isGuest !== true,
);

const guildsWithBot = computed(() => guilds.value.filter((g) => g.botInGuild));

/** Guild rows for the server picker — includes current bridge guild even if list omitted it. */
const guildSelectOptions = computed((): EchoDiscordBridgeGuildOption[] => {
  const base = [...guildsWithBot.value];
  const bridged = selectedGuildId.value.trim();
  if (bridged && !base.some((g) => g.id === bridged)) {
    base.unshift({
      id: bridged,
      name: echoT('b19.dsp.currentBridgeServer'),
      iconUrl: null,
      botInGuild: true,
      botInviteUrl: '',
    });
  }
  return base;
});

function channelLabel(c: EchoDiscordBridgeChannelOption): string {
  const prefix = c.categoryName ? `${c.categoryName} › ` : '';
  const hash = c.type === 15 ? 'forum' : '#';
  return `${prefix}${hash}${c.name}`;
}

const guildDropdownOptions = computed(() => {
  const rows = guildSelectOptions.value.map((g) => ({
    label: g.name,
    value: g.id,
  }));
  return [{ label: echoT('b19.dsp.selectServer'), value: '' }, ...rows];
});

const channelDropdownOptions = computed(() => {
  const fromApi = channels.value.map((c) => ({
    label: channelLabel(c),
    value: c.id,
  }));
  const rows: { label: string; value: string }[] = [
    { label: echoT('b19.dsp.selectChannel'), value: '' },
    ...fromApi,
  ];
  const sid = selectedChannelId.value.trim();
  if (sid && !channels.value.some((c) => c.id === sid)) {
    rows.push({
      label: echoT('b19.dsp.current', { id: sid }),
      value: sid,
    });
  }
  return rows;
});

async function loadGuilds() {
  if (!canUse.value || !props.serverId || !props.channelId) return;
  const token = authSession.accessToken?.trim() ?? '';
  guildsLoading.value = true;
  try {
    const res = await getEchoDiscordBridgeGuilds(
      token,
      props.serverId,
      props.channelId,
    );
    guildsMeta.value = {
      linked: res.linked,
      tokenExpired: res.linked ? res.tokenExpired : false,
      missingGuildsScope: res.linked ? res.missingGuildsScope : false,
      botConfigured: res.botConfigured,
    };
    guilds.value = res.linked ? [...res.guilds] : [];
  } catch {
    guilds.value = [];
  } finally {
    guildsLoading.value = false;
  }
}

function applyBridgeState(s: Awaited<ReturnType<typeof getEchoDiscordBridge>>) {
  selectedGuildId.value = (s.discordGuildId ?? '').trim();
  selectedChannelId.value = (s.discordChannelId ?? '').trim();
  inboundEnabled.value = s.inboundEnabled === true;
  outboundEnabled.value = s.outboundEnabled === true;
  const configured =
    s.bridgeConfigured === true ||
    s.hasBridge === true ||
    s.hasWebhook === true;
  hasBridge.value = configured;
  hasWebhook.value = s.hasWebhook === true || s.bridgeConfigured === true;
  webhookOverride.value = '';
  clearWebhook.value = false;
}

async function loadChannels(guildId: string) {
  if (!canUse.value || !guildId.trim()) {
    channels.value = [];
    return;
  }
  const token = authSession.accessToken?.trim() ?? '';
  channelsLoading.value = true;
  error.value = '';
  try {
    const res = await getEchoDiscordBridgeChannels(
      token,
      props.serverId,
      props.channelId,
      guildId.trim(),
    );
    channels.value = res.channels ?? [];
  } catch (e) {
    channels.value = [];
    error.value =
      e instanceof Error ? e.message : echoT('b19.dsp.errLoadChannels');
  } finally {
    channelsLoading.value = false;
  }
}

async function load() {
  if (!canUse.value || !props.serverId || !props.channelId) return;
  const token = authSession.accessToken?.trim() ?? '';
  loading.value = true;
  syncingFromBridgeLoad.value = true;
  error.value = '';
  try {
    const bridgePromise = getEchoDiscordBridge(
      token,
      props.serverId,
      props.channelId,
    );
    const guildsPromise = loadGuilds();
    const bridgeState = await bridgePromise;
    applyBridgeState(bridgeState);

    let channelsPromise: Promise<void> | undefined;
    if (selectedGuildId.value) {
      channelsPromise = loadChannels(selectedGuildId.value);
    } else {
      channels.value = [];
    }
    await Promise.all([guildsPromise, channelsPromise ?? Promise.resolve()]);
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : echoT('b19.dsp.errLoadSettings');
  } finally {
    loading.value = false;
    syncingFromBridgeLoad.value = false;
  }
}

watch(
  () =>
    [props.serverId, props.channelId, authSession.authStateGeneration] as const,
  () => {
    if (canUse.value) void load();
  },
  { immediate: true },
);

watch(selectedGuildId, (guild) => {
  if (syncingFromBridgeLoad.value) return;
  selectedChannelId.value = '';
  if (guild.trim()) {
    void loadChannels(guild);
  } else {
    channels.value = [];
  }
});

async function save() {
  if (!canUse.value || !props.serverId || !props.channelId) return;
  const token = authSession.accessToken?.trim() ?? '';
  saving.value = true;
  error.value = '';
  try {
    const guild = selectedGuildId.value.trim();
    const chan = selectedChannelId.value.trim();
    const override = webhookOverride.value.trim();
    const saved = await putEchoDiscordBridge(
      token,
      props.serverId,
      props.channelId,
      {
        inboundEnabled: inboundEnabled.value,
        outboundEnabled: outboundEnabled.value,
        ...(guild ? { discordGuildId: guild } : {}),
        ...(chan ? { discordChannelId: chan } : {}),
        ...(clearWebhook.value
          ? { discordWebhookUrl: null }
          : override
            ? { discordWebhookUrl: override }
            : {}),
      },
    );
    applyBridgeState(saved);
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : echoT('b19.dsp.errSaveSettings');
  } finally {
    saving.value = false;
  }
}

async function clearSync() {
  if (
    !canUse.value ||
    !props.serverId ||
    !props.channelId ||
    !hasBridge.value
  ) {
    return;
  }
  const ok = window.confirm(echoT('b19.dsp.confirmStop'));
  if (!ok) return;
  const token = authSession.accessToken?.trim() ?? '';
  clearing.value = true;
  error.value = '';
  try {
    const cleared = await deleteEchoDiscordBridge(
      token,
      props.serverId,
      props.channelId,
    );
    applyBridgeState(cleared);
  } catch (e) {
    error.value = e instanceof Error ? e.message : echoT('b19.dsp.errTurnOff');
  } finally {
    clearing.value = false;
  }
}
</script>

<template>
  <div class="server-settings-panel-root pb-8">
    <div class="server-settings-panel w-full max-w-3xl rounded-2xl p-5">
      <div class="mb-2 flex items-center gap-2">
        <img
          :src="icons.discordMark"
          alt=""
          class="server-settings-inline-icon h-5 w-5 shrink-0"
        />
        <div class="settings-subtitle">{{ echoT('b19.dsp.title') }}</div>
      </div>
      <p class="mb-4 text-xs leading-relaxed text-fg-subtle">
        {{ echoT('b19.dsp.intro') }}
      </p>

      <div v-if="!authSession.isAuthenticated" class="text-sm text-fg-soft">
        {{ echoT('b19.dsp.signIn') }}
      </div>
      <div
        v-else-if="authSession.backendUser?.isGuest"
        class="text-sm text-fg-soft"
      >
        {{ echoT('b19.dsp.guest') }}
      </div>
      <div
        v-else-if="
          props.channelType !== 'text' && props.channelType !== 'forum'
        "
        class="text-sm text-fg-soft"
      >
        {{ echoT('b19.dsp.onlyTextForum') }}
      </div>
      <div v-else class="space-y-4">
        <div
          v-if="!guildsMeta.linked"
          class="rounded-lg bg-glass-2 px-3 py-2 text-sm text-fg-soft"
        >
          {{ echoT('b19.dsp.notLinked') }}
        </div>
        <div
          v-else-if="guildsMeta.tokenExpired"
          class="echo-warn-banner rounded-lg px-3 py-2 text-sm"
        >
          {{ echoT('b19.dsp.expired') }}
        </div>
        <div
          v-else-if="guildsMeta.missingGuildsScope"
          class="echo-warn-banner rounded-lg px-3 py-2 text-sm"
        >
          {{ echoT('b19.dsp.missingScope') }}
        </div>
        <div
          v-else-if="
            guildsMeta.linked && guildsWithBot.length === 0 && !guildsLoading
          "
          class="rounded-lg bg-glass-2 px-3 py-2 text-sm text-fg-soft"
        >
          <span v-if="!guildsMeta.botConfigured">
            {{ echoT('b19.dsp.noBotConfigured') }}
          </span>
          <template v-else>
            {{ echoT('b19.dsp.noBotInGuild') }}
          </template>
        </div>

        <div class="w-full max-w-xl">
          <EchoDropdown
            v-model="selectedGuildId"
            :options="guildDropdownOptions"
            :label="echoT('b19.dsp.discordServer')"
            surface="server"
            teleport-menu
            :disabled="saving || guildsLoading || !guildsMeta.linked"
          />
          <p class="mt-1 text-[11px] text-fg-subtle">
            {{ echoT('b19.dsp.serversHint') }}
          </p>
        </div>

        <div class="w-full max-w-xl">
          <EchoDropdown
            v-model="selectedChannelId"
            :options="channelDropdownOptions"
            :label="echoT('b19.dsp.discordChannel')"
            surface="server"
            teleport-menu
            :disabled="saving || channelsLoading || !selectedGuildId.trim()"
          />
          <p class="mt-1 text-[11px] text-fg-subtle">
            {{ echoT('b19.dsp.channelsHint') }}
          </p>
        </div>

        <div class="flex flex-wrap gap-6">
          <label
            class="flex cursor-pointer items-center gap-2 text-sm text-fg-soft"
          >
            <input
              v-model="inboundEnabled"
              type="checkbox"
              class="rounded border-border"
              :disabled="saving"
            />
            {{ echoT('b19.dsp.inbound') }}
          </label>
          <label
            class="flex cursor-pointer items-center gap-2 text-sm text-fg-soft"
          >
            <input
              v-model="outboundEnabled"
              type="checkbox"
              class="rounded border-border"
              :disabled="saving"
            />
            {{ echoT('b19.dsp.outbound') }}
          </label>
        </div>

        <details
          class="rounded-lg border border-border/50 bg-glass-1/40 px-3 py-2"
        >
          <summary class="cursor-pointer text-xs font-medium text-fg-soft">
            {{ echoT('b19.dsp.advanced') }}
          </summary>
          <p class="mt-2 text-[11px] text-fg-subtle">
            {{ echoT('b19.dsp.advancedHint') }}
          </p>
          <input
            v-model="webhookOverride"
            type="url"
            class="server-input mt-2 w-full max-w-2xl"
            placeholder="https://discord.com/api/webhooks/…"
            autocomplete="off"
            :disabled="saving || clearWebhook"
          />
          <div class="mt-2 flex items-center gap-2 text-sm text-fg-soft">
            <input
              v-model="clearWebhook"
              type="checkbox"
              class="rounded border-border"
              :disabled="saving || !hasWebhook"
            />
            {{ echoT('b19.dsp.removeLink') }}
          </div>
        </details>

        <div v-if="error" class="text-sm echo-destructive-text">
          {{ error }}
        </div>
        <div v-if="loading" class="text-sm text-fg-subtle">
          {{ echoT('b19.dsp.loadingLink') }}
        </div>
        <div
          v-else-if="guildsLoading && !guilds.length"
          class="text-sm text-fg-subtle"
        >
          {{ echoT('b19.dsp.loadingServers') }}
        </div>
        <div
          v-else-if="channelsLoading && selectedGuildId.trim()"
          class="text-sm text-fg-subtle"
        >
          {{ echoT('b19.dsp.loadingChannels') }}
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
            :disabled="loading || saving || clearing"
            @click="save"
          >
            {{ saving ? echoT('b19.dsp.saving') : echoT('b19.dsp.save') }}
          </button>
          <button
            v-if="hasBridge"
            type="button"
            class="echo-destructive-action rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
            :disabled="loading || saving || clearing"
            @click="clearSync"
          >
            {{
              clearing
                ? echoT('b19.dsp.turningOff')
                : echoT('b19.dsp.stopLinking')
            }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
