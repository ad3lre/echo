<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import EchoDropdown from '@/components/EchoDropdown.vue';
import { icons } from '@/assets/icons';
import { useAuthSessionStore } from '@/stores/authSession';
import {
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
      name: 'Current bridge server',
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
  return [{ label: 'Select server…', value: '' }, ...rows];
});

const channelDropdownOptions = computed(() => {
  const fromApi = channels.value.map((c) => ({
    label: channelLabel(c),
    value: c.id,
  }));
  const rows: { label: string; value: string }[] = [
    { label: 'Select channel…', value: '' },
    ...fromApi,
  ];
  const sid = selectedChannelId.value.trim();
  if (sid && !channels.value.some((c) => c.id === sid)) {
    rows.push({
      label: `Current: ${sid}`,
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
  hasWebhook.value = s.hasWebhook === true;
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
      e instanceof Error ? e.message : 'Could not load Discord channels.';
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
      e instanceof Error ? e.message : 'Could not load Discord sync settings.';
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
      e instanceof Error ? e.message : 'Could not save Discord sync settings.';
  } finally {
    saving.value = false;
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
        <div class="settings-subtitle">Discord sync</div>
      </div>
      <p class="mb-4 text-xs leading-relaxed text-fg-subtle">
        Mirror messages between this Echo channel and a Discord channel. Inbound
        requires the Echo Discord bot online with Message Content intent. Echo →
        Discord uses an incoming webhook — Echo creates one automatically when
        you enable outbound (bot needs Manage Webhooks).
      </p>

      <div v-if="!authSession.isAuthenticated" class="text-sm text-fg-soft">
        Sign in to configure Discord sync.
      </div>
      <div
        v-else-if="authSession.backendUser?.isGuest"
        class="text-sm text-fg-soft"
      >
        Discord sync isn’t available for guest sessions. Create an account or
        sign in with a full Echo profile to continue.
      </div>
      <div
        v-else-if="
          props.channelType !== 'text' && props.channelType !== 'forum'
        "
        class="text-sm text-fg-soft"
      >
        Discord sync is only available for text and forum channels.
      </div>
      <div v-else class="space-y-4">
        <div
          v-if="!guildsMeta.linked"
          class="rounded-lg bg-glass-2 px-3 py-2 text-sm text-fg-soft"
        >
          Link your Discord account under Echo user settings so Echo can list
          servers you manage.
        </div>
        <div
          v-else-if="guildsMeta.tokenExpired"
          class="echo-warn-banner rounded-lg px-3 py-2 text-sm"
        >
          Your Discord connection expired. Reconnect Discord in Echo settings,
          then try again.
        </div>
        <div
          v-else-if="guildsMeta.missingGuildsScope"
          class="echo-warn-banner rounded-lg px-3 py-2 text-sm"
        >
          Discord needs the “guilds” permission for server pickers. Re-link
          Discord with the updated scopes.
        </div>
        <div
          v-else-if="
            guildsMeta.linked && guildsWithBot.length === 0 && !guildsLoading
          "
          class="rounded-lg bg-glass-2 px-3 py-2 text-sm text-fg-soft"
        >
          <span v-if="!guildsMeta.botConfigured">
            This Echo deployment has no Discord bot token — ask your admin to
            set DISCORD_BOT_TOKEN.
          </span>
          <template v-else>
            The Echo bot isn’t in any Discord server you can manage, or it
            hasn’t been invited yet. Open your server in Discord → Server
            Settings → Integrations → add the Echo bot with webhook permissions.
          </template>
        </div>

        <div class="w-full max-w-xl">
          <EchoDropdown
            v-model="selectedGuildId"
            :options="guildDropdownOptions"
            label="Discord server"
            surface="server"
            teleport-menu
            :disabled="saving || guildsLoading || !guildsMeta.linked"
          />
          <p class="mt-1 text-[11px] text-fg-subtle">
            Servers where you can manage and where the Echo bot is installed.
          </p>
        </div>

        <div class="w-full max-w-xl">
          <EchoDropdown
            v-model="selectedChannelId"
            :options="channelDropdownOptions"
            label="Discord channel"
            surface="server"
            teleport-menu
            :disabled="saving || channelsLoading || !selectedGuildId.trim()"
          />
          <p class="mt-1 text-[11px] text-fg-subtle">
            Text, announcement, and forum channels only.
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
            Discord → Echo (live)
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
            Echo → Discord
          </label>
        </div>

        <details
          class="rounded-lg border border-border/50 bg-glass-1/40 px-3 py-2"
        >
          <summary class="cursor-pointer text-xs font-medium text-fg-soft">
            Advanced: webhook URL override
          </summary>
          <p class="mt-2 text-[11px] text-fg-subtle">
            Leave blank to let Echo create or reuse an “Echo bridge” webhook.
            Paste a URL only if you must replace it manually.
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
            Clear stored webhook (next save regenerates if Echo → Discord stays
            on)
          </div>
        </details>

        <div v-if="error" class="text-sm echo-destructive-text">
          {{ error }}
        </div>
        <div v-if="loading" class="text-sm text-fg-subtle">
          Loading sync settings…
        </div>
        <div
          v-else-if="guildsLoading && !guilds.length"
          class="text-sm text-fg-subtle"
        >
          Loading Discord servers…
        </div>
        <div
          v-else-if="channelsLoading && selectedGuildId.trim()"
          class="text-sm text-fg-subtle"
        >
          Loading Discord channels…
        </div>
        <button
          type="button"
          class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
          :disabled="loading || saving"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save sync' }}
        </button>
      </div>
    </div>
  </div>
</template>
