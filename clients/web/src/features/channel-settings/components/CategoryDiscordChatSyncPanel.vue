<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import { useAuthSessionStore } from '@/features/auth/authSession';
import {
  postEchoDiscordBridgeCategoryBulkApply,
  postEchoDiscordBridgeCategoryBulkClear,
} from '@/api/echo/discordBridge';

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
const clearing = ref(false);
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
        echoT(
          res.applied === 1
            ? 'b29.catSync.updatedOne'
            : 'b29.catSync.updatedMany',
          { count: res.applied },
        ),
      );
    }
    if (res.skipped > 0) {
      parts.push(echoT('b29.catSync.skipped', { count: res.skipped }));
    }
    if (res.failed > 0) {
      parts.push(echoT('b29.catSync.failed', { count: res.failed }));
    }
    lastSummary.value =
      parts.join(' · ') ||
      (bridgeableCount.value === 0
        ? echoT('b29.catSync.noChannels')
        : echoT('b29.catSync.nothingApply'));
    if (res.failures.length > 0) {
      const detail = res.failures
        .slice(0, 4)
        .map((f) => f.message)
        .join('; ');
      error.value =
        res.failures.length > 4
          ? `${detail}; …`
          : detail || echoT('b29.catSync.someNotUpdated');
    }
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : echoT('b29.catSync.updateFailed');
  } finally {
    applying.value = false;
  }
}

async function clearCategorySync() {
  if (!canUse.value || !props.serverId || !props.categoryId) return;
  if (bridgeableCount.value === 0) return;
  const ok = window.confirm(
    echoT(
      bridgeableCount.value === 1
        ? 'b29.catSync.confirmOne'
        : 'b29.catSync.confirmMany',
      { count: bridgeableCount.value },
    ),
  );
  if (!ok) return;
  const token = authSession.accessToken?.trim() ?? '';
  clearing.value = true;
  error.value = '';
  lastSummary.value = '';
  try {
    const res = await postEchoDiscordBridgeCategoryBulkClear(
      token,
      props.serverId,
      props.categoryId,
    );
    const parts: string[] = [];
    if (res.applied > 0) {
      parts.push(
        echoT(
          res.applied === 1
            ? 'b29.catSync.clearedOne'
            : 'b29.catSync.clearedMany',
          { count: res.applied },
        ),
      );
    }
    if (res.skipped > 0) {
      parts.push(echoT('b29.catSync.skipped', { count: res.skipped }));
    }
    if (res.failed > 0) {
      parts.push(echoT('b29.catSync.failed', { count: res.failed }));
    }
    lastSummary.value =
      parts.join(' · ') ||
      (bridgeableCount.value === 0
        ? echoT('b29.catSync.noChannels')
        : echoT('b29.catSync.nothingClear'));
    if (res.failures.length > 0) {
      const detail = res.failures
        .slice(0, 4)
        .map((f) => f.message)
        .join('; ');
      error.value =
        res.failures.length > 4
          ? `${detail}; …`
          : detail || echoT('b29.catSync.someNotCleared');
    }
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : echoT('b29.catSync.clearFailed');
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
          class="h-5 w-5 shrink-0 opacity-90 filter invert"
        />
        <div class="settings-subtitle">{{ echoT('b29.catSync.title') }}</div>
      </div>
      <p class="mb-4 text-xs leading-relaxed text-fg-subtle">
        {{ echoT('b29.catSync.intro') }}
      </p>

      <div v-if="!authSession.isAuthenticated" class="text-sm text-fg-soft">
        {{ echoT('b29.catSync.signIn') }}
      </div>
      <div
        v-else-if="authSession.backendUser?.isGuest"
        class="text-sm text-fg-soft"
      >
        {{ echoT('b29.catSync.guest') }}
      </div>
      <div v-else class="space-y-4">
        <div
          v-if="bridgeableCount === 0"
          class="rounded-lg bg-glass-2 px-3 py-2 text-sm text-fg-soft"
        >
          {{ echoT('b29.catSync.noChannelsLink') }}
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
            {{ echoT('b29.catSync.inbound') }}
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
            {{ echoT('b29.catSync.outbound') }}
          </label>
        </div>

        <p class="text-[11px] text-fg-subtle">
          {{ echoT('b29.catSync.noteBefore') }}
          <strong class="font-semibold text-fg-soft">{{
            echoT('b29.catSync.stop')
          }}</strong>
          {{ echoT('b29.catSync.noteAfter') }}
        </p>

        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
            :disabled="applying || clearing || bridgeableCount === 0"
            @click="applyToCategory"
          >
            {{
              applying
                ? echoT('b29.catSync.applying')
                : echoT('b29.catSync.syncAll')
            }}
          </button>
          <button
            type="button"
            class="echo-destructive-action rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
            :disabled="applying || clearing || bridgeableCount === 0"
            @click="clearCategorySync"
          >
            {{
              clearing
                ? echoT('b29.catSync.turningOff')
                : echoT('b29.catSync.stop')
            }}
          </button>
        </div>

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
