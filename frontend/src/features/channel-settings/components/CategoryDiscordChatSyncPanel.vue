<script setup lang="ts">
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import { useAuthSessionStore } from '@/stores/authSession';
import { postEchoDiscordBridgeCategoryBulkApply } from '@/api/echo/discordBridge';

const props = defineProps<{
  serverId: string;
  categoryId: string;
  /** Text + forum channels in this category (for empty-state copy). */
  textForumChannelCount?: number;
}>();

const authSession = useAuthSessionStore();

const inboundEnabled = ref(false);
const outboundEnabled = ref(false);
const applying = ref(false);
const error = ref('');
const lastSummary = ref('');

const canUse = computed(
  () =>
    authSession.isAuthenticated && authSession.backendUser?.isGuest !== true,
);

const bridgeableCount = computed(() =>
  Math.max(0, props.textForumChannelCount ?? 0),
);

async function applyToCategory() {
  if (!canUse.value || !props.serverId || !props.categoryId) return;
  const token = authSession.accessToken?.trim() ?? '';
  applying.value = true;
  error.value = '';
  lastSummary.value = '';
  try {
    const res = await postEchoDiscordBridgeCategoryBulkApply(
      token,
      props.serverId,
      props.categoryId,
      {
        inboundEnabled: inboundEnabled.value,
        outboundEnabled: outboundEnabled.value,
      },
    );
    const parts: string[] = [];
    if (res.applied > 0) {
      parts.push(
        `${res.applied} channel${res.applied === 1 ? '' : 's'} updated`,
      );
    }
    if (res.skipped > 0) {
      parts.push(`${res.skipped} skipped (no permission on those channels)`);
    }
    if (res.failed > 0) {
      parts.push(`${res.failed} failed`);
    }
    lastSummary.value =
      parts.join(' · ') ||
      (bridgeableCount.value === 0
        ? 'No text or forum channels in this category.'
        : 'Nothing to apply.');
    if (res.failures.length > 0) {
      const detail = res.failures
        .slice(0, 4)
        .map((f) => f.message)
        .join('; ');
      error.value =
        res.failures.length > 4
          ? `${detail}; …`
          : detail || 'Some channels could not be updated.';
    }
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : 'Could not apply Discord sync.';
  } finally {
    applying.value = false;
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
          class="h-5 w-5 shrink-0 opacity-90 filter invert"
        />
        <div class="settings-subtitle">Discord chat sync (bulk)</div>
      </div>
      <p class="mb-4 text-xs leading-relaxed text-fg-subtle">
        Applies the same Discord ↔ Echo mirroring toggles to every
        <strong class="font-semibold text-fg-soft">text</strong> and
        <strong class="font-semibold text-fg-soft">forum</strong>
        channel in this category. Each channel uses its own Discord mapping from
        server import (same as per-channel Discord sync in channel settings).
      </p>

      <div v-if="!authSession.isAuthenticated" class="text-sm text-fg-soft">
        Sign in to configure Discord sync.
      </div>
      <div
        v-else-if="authSession.backendUser?.isGuest"
        class="text-sm text-fg-soft"
      >
        Not available for guest sessions.
      </div>
      <div v-else class="space-y-4">
        <div
          v-if="bridgeableCount === 0"
          class="rounded-lg bg-glass-2 px-3 py-2 text-sm text-fg-soft"
        >
          This category has no text or forum channels — nothing to sync.
        </div>

        <div class="flex flex-wrap gap-6">
          <label
            class="flex cursor-pointer items-center gap-2 text-sm text-fg-soft"
          >
            <input
              v-model="inboundEnabled"
              type="checkbox"
              class="rounded border-border"
              :disabled="applying || bridgeableCount === 0"
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
              :disabled="applying || bridgeableCount === 0"
            />
            Echo → Discord
          </label>
        </div>

        <p class="text-[11px] text-fg-subtle">
          Turning both off clears bridge rows only when no webhook is stored
          (same as single-channel sync). Channels you cannot manage are skipped.
        </p>

        <button
          type="button"
          class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
          :disabled="applying || bridgeableCount === 0"
          @click="applyToCategory"
        >
          {{ applying ? 'Applying…' : 'Sync all channels in category' }}
        </button>

        <div v-if="lastSummary" class="text-sm text-fg-soft">
          {{ lastSummary }}
        </div>
        <div v-if="error" class="text-sm echo-destructive-text">
          {{ error }}
        </div>
      </div>
    </div>
  </div>
</template>
