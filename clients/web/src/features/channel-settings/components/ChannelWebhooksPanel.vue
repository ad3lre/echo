<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { useChannelWebhooksPanel } from '@/features/channel-settings/useChannelWebhooksPanel';

const props = defineProps<{
  serverId: string;
  channelId: string;
}>();

const authSession = useAuthSessionStore();

const canUse = computed(
  () =>
    authSession.isAuthenticated && authSession.backendUser?.isGuest !== true,
);

const {
  loading,
  error,
  webhooks,
  creating,
  newName,
  reveal,
  copyText,
  onCreate,
  onDelete,
  onRegenerate,
} = useChannelWebhooksPanel({
  serverId: toRef(props, 'serverId'),
  channelId: toRef(props, 'channelId'),
  canUse,
  accessToken: computed(() => authSession.accessToken ?? ''),
});

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
      a secret URL (Discord-style). Anyone with the URL can send messages — keep
      it private.
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
          class="mt-1 rounded-lg border border-border bg-glass-1 px-3 py-1.5 text-sm font-medium text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
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
          class="mt-1 rounded-lg border border-border bg-glass-1 px-3 py-1.5 text-sm font-medium text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
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
            class="mt-1 w-full rounded-lg border border-border bg-glass px-3 py-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-border"
            placeholder="Webhook"
            :disabled="!canUse || creating || loading"
          />
        </div>
        <button
          type="button"
          class="shrink-0 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
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
              class="rounded-lg border border-border bg-glass-1 px-3 py-1.5 text-sm font-medium text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
              @click="onRegenerate(w)"
            >
              Regenerate token
            </button>
            <button
              type="button"
              class="echo-destructive-action rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
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
