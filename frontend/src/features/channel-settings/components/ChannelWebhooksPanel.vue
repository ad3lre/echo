<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  createEchoChannelWebhook,
  deleteEchoChannelWebhook,
  listEchoChannelWebhooks,
  regenerateEchoChannelWebhookToken,
  type EchoChannelWebhookDto,
} from '@/api/echo/channelWebhooks';
import { requestAppConfirm } from '@/utils/appDialogs';

const props = defineProps<{
  serverId: string;
  channelId: string;
}>();

const authSession = useAuthSessionStore();

const loading = ref(false);
const error = ref('');
const webhooks = ref<EchoChannelWebhookDto[]>([]);

const creating = ref(false);
const newName = ref('Webhook');
const reveal = ref<{ url: string; token: string } | null>(null);

const canUse = computed(
  () =>
    authSession.isAuthenticated && authSession.backendUser?.isGuest !== true,
);

async function load() {
  if (!canUse.value) return;
  loading.value = true;
  error.value = '';
  try {
    const tok = authSession.accessToken ?? '';
    const { webhooks: list } = await listEchoChannelWebhooks(
      tok,
      props.serverId,
      props.channelId,
    );
    webhooks.value = list;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load webhooks';
    webhooks.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.serverId, props.channelId, canUse.value] as const,
  () => {
    void load();
  },
  { immediate: true },
);

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    error.value = `Could not copy ${label} to clipboard`;
  }
}

async function onCreate() {
  if (!canUse.value) return;
  creating.value = true;
  error.value = '';
  try {
    const tok = authSession.accessToken ?? '';
    const res = await createEchoChannelWebhook(tok, props.serverId, props.channelId, {
      name: newName.value.trim() || 'Webhook',
    });
    reveal.value = { url: res.url, token: res.token };
    newName.value = 'Webhook';
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Create failed';
  } finally {
    creating.value = false;
  }
}

async function onDelete(w: EchoChannelWebhookDto) {
  const ok = await requestAppConfirm({
    title: `Delete webhook “${w.name}”?`,
    message:
      'Any integrations using this webhook URL will stop working immediately.',
    confirmLabel: 'Delete webhook',
    danger: true,
  });
  if (!ok) return;
  error.value = '';
  try {
    const tok = authSession.accessToken ?? '';
    await deleteEchoChannelWebhook(tok, props.serverId, props.channelId, w.id);
    if (reveal.value) reveal.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Delete failed';
  }
}

async function onRegenerate(w: EchoChannelWebhookDto) {
  const ok = await requestAppConfirm({
    title: 'Regenerate webhook token?',
    message:
      'The old URL stops working immediately. Copy the new URL for your integrations.',
    confirmLabel: 'Regenerate',
    danger: true,
  });
  if (!ok) return;
  error.value = '';
  try {
    const tok = authSession.accessToken ?? '';
    const res = await regenerateEchoChannelWebhookToken(
      tok,
      props.serverId,
      props.channelId,
      w.id,
    );
    reveal.value = { url: res.url, token: res.token };
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Regenerate failed';
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-6 pb-4">
    <p class="channel-settings-hint text-[15px] leading-relaxed">
      Incoming webhooks let external services post messages to this channel with
      a secret URL (Discord-style). Anyone with the URL can send messages —
      keep it private.
    </p>

    <p v-if="!canUse" class="text-sm text-muted">
      Sign in with a full account to manage webhooks.
    </p>

    <p v-else-if="error" class="text-sm text-red-500">{{ error }}</p>

    <div
      v-if="reveal"
      class="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3"
    >
      <div class="text-sm font-semibold text-fg">
        Copy this now — the token is only shown once
      </div>
      <div class="space-y-1">
        <div class="text-xs font-medium uppercase tracking-wide text-muted">
          Webhook URL
        </div>
        <div
          class="break-all rounded-lg bg-glass px-3 py-2 font-mono text-xs text-fg"
        >
          {{ reveal.url }}
        </div>
        <button
          type="button"
          class="mt-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-glass-hover"
          @click="copyText('URL', reveal.url)"
        >
          Copy URL
        </button>
      </div>
      <div class="space-y-1">
        <div class="text-xs font-medium uppercase tracking-wide text-muted">
          Token
        </div>
        <div
          class="break-all rounded-lg bg-glass px-3 py-2 font-mono text-xs text-fg"
        >
          {{ reveal.token }}
        </div>
        <button
          type="button"
          class="mt-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-glass-hover"
          @click="copyText('token', reveal.token)"
        >
          Copy token
        </button>
      </div>
      <button
        type="button"
        class="text-sm text-muted underline"
        @click="reveal = null"
      >
        Dismiss
      </button>
    </div>

    <div class="rounded-xl border border-border bg-glass p-4 space-y-3">
      <div class="channel-settings-section-label">New webhook</div>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div class="min-w-0 flex-1">
          <label class="text-xs text-muted" for="echo-new-webhook-name"
            >Name</label
          >
          <input
            id="echo-new-webhook-name"
            v-model="newName"
            type="text"
            maxlength="80"
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-border"
            placeholder="Webhook"
            :disabled="!canUse || creating || loading"
          />
        </div>
        <button
          type="button"
          class="shrink-0 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity disabled:opacity-40"
          :disabled="!canUse || creating || loading"
          @click="onCreate"
        >
          {{ creating ? 'Creating…' : 'Create webhook' }}
        </button>
      </div>
    </div>

    <div>
      <div class="channel-settings-section-label mb-2">Existing webhooks</div>
      <p v-if="loading" class="text-sm text-muted">Loading…</p>
      <ul v-else-if="webhooks.length === 0" class="text-sm text-muted">
        No webhooks yet.
      </ul>
      <ul v-else class="space-y-3">
        <li
          v-for="w in webhooks"
          :key="w.id"
          class="flex flex-col gap-2 rounded-xl border border-border bg-glass px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0">
            <div class="truncate font-medium text-fg">{{ w.name }}</div>
            <div class="mt-0.5 font-mono text-xs text-muted truncate">
              {{ w.id }}
            </div>
            <div class="mt-1 text-xs text-muted">
              Created {{ formatDate(w.createdAt) }}
              <span v-if="w.lastUsedAt">
                · Last used {{ formatDate(w.lastUsedAt) }}</span
              >
            </div>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-glass-hover"
              @click="onRegenerate(w)"
            >
              Regenerate token
            </button>
            <button
              type="button"
              class="rounded-lg border border-red-500/50 px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
              @click="onDelete(w)"
            >
              Delete
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
