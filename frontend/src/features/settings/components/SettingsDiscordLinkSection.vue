<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { MeDiscordLinkedProfile } from '@/api/meClient';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  discordConnectCta,
  discordMergeHintFull,
  discordMergeHintPartial,
  discordOAuthCallbackUrlIntro,
  discordReconnectCta,
  discordSettingsSectionTitle,
} from '@/features/discord/discordIntegrationCopy';
import {
  discordCountLabel,
  discordPremiumLabel,
} from '@/utils/discordProfileDisplay';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { useDiscordLinkSettings } from '@/features/settings/composables/useDiscordLinkSettings';
import { useDiscordProfileImport } from '@/features/settings/composables/useDiscordProfileImport';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { discordImportProfileIntoEchoCta } from '@/features/discord/discordIntegrationCopy';

const {
  state,
  loading,
  actionError,
  connectBusy,
  lastOAuthRedirectUri,
  onConnect,
  refresh,
} = useDiscordLinkSettings();

const {
  busy: profileImportBusy,
  error: profileImportError,
  importFromDiscord,
} = useDiscordProfileImport();

async function onImportProfileIntoEcho() {
  const ok = await importFromDiscord();
  if (ok) {
    dispatchAppToast('Profile updated from Discord.', 'info');
    void refresh();
  }
}

const bannerErrored = ref(false);

watch(
  () => (state.value?.linked ? (state.value.profile.bannerUrl ?? null) : null),
  () => {
    bannerErrored.value = false;
  },
);

const displayInitial = computed(() => {
  if (state.value?.linked !== true) return '?';
  const p = state.value.profile;
  const s = (p.globalName || p.username || '?').trim();
  return s ? s.charAt(0).toUpperCase() : '?';
});

type DiscordDetailRow = { label: string; value: string; mono?: boolean };

function detailRows(profile: MeDiscordLinkedProfile): DiscordDetailRow[] {
  return [
    {
      label: 'Display name',
      value: profile.globalName?.trim() || profile.username || '—',
    },
    { label: 'Username', value: `@${profile.username}` },
    { label: 'Discord ID', value: profile.discordUserId, mono: true },
    {
      label: 'Email from Discord',
      value: profile.emailPresent ? 'Shared with Echo' : 'Not shared',
    },
    { label: 'Subscription', value: discordPremiumLabel(profile.premiumType) },
    {
      label: 'Servers (visible to the app)',
      value: discordCountLabel(profile.guildCount),
    },
    {
      label: 'Connected services',
      value: discordCountLabel(profile.connectionsCount),
    },
  ];
}
</script>

<template>
  <div class="settings-discord-root w-full min-w-0 max-w-5xl">
    <div v-if="echoSyncCapabilities.isMockDataMode" class="text-sm text-muted">
      Preview mode doesn’t use a live account, so Discord can’t be linked here.
    </div>

    <div v-else-if="loading" class="text-sm text-muted">Loading…</div>

    <div v-else class="flex flex-col gap-6">
      <p v-if="actionError" class="text-sm text-red-400/90">
        {{ actionError }}
      </p>
      <p v-if="profileImportError" class="text-sm text-red-400/90">
        {{ profileImportError }}
      </p>

      <div
        v-if="lastOAuthRedirectUri"
        class="max-w-3xl space-y-2 text-sm text-muted"
      >
        <p class="leading-relaxed">
          {{ discordOAuthCallbackUrlIntro }}
          <code
            class="mt-2 block break-all rounded-xl bg-scrim-1 px-3 py-2.5 font-mono text-[11px] leading-snug text-foreground/90"
            >{{ lastOAuthRedirectUri }}</code
          >
        </p>
      </div>

      <template v-if="state?.linked">
        <div class="settings-card overflow-hidden rounded-2xl">
          <div
            class="profile-banner relative isolate h-36 w-full overflow-hidden sm:h-40"
            aria-hidden="true"
          >
            <img
              v-if="(state.profile.bannerUrl ?? null) && !bannerErrored"
              :src="state.profile.bannerUrl ?? ''"
              alt=""
              class="absolute inset-0 h-full w-full object-cover"
              @error="bannerErrored = true"
            />
            <div v-else class="absolute inset-0 bg-bg" />
            <div
              class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 to-black/35"
              aria-hidden="true"
            />
          </div>

          <div class="relative px-6 pb-8 pt-16 sm:px-8 sm:pb-10">
            <div class="absolute -top-12 left-6 z-10 sm:left-8">
              <div
                class="relative h-24 w-24 overflow-hidden rounded-3xl border-[6px] border-bg bg-bg shadow-lg shadow-black/20"
              >
                <PausedGifAvatar
                  v-if="state.profile.avatarUrl"
                  :src="safeImageUrl(state.profile.avatarUrl)"
                  alt=""
                  session-key="discord-settings-avatar"
                  img-class="rounded-3xl object-cover"
                />
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center bg-scrim-1 text-2xl font-semibold text-foreground"
                >
                  {{ displayInitial }}
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-1">
              <span
                class="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent/85"
              >
                {{ discordSettingsSectionTitle }}
              </span>
              <h4 class="text-2xl font-bold text-foreground">
                {{ state.profile.globalName || state.profile.username }}
              </h4>
              <p class="text-base text-fg-soft">
                @{{ state.profile.username }}
              </p>
            </div>

            <div
              class="mt-10 grid grid-cols-1 gap-x-12 gap-y-8 sm:grid-cols-2 xl:grid-cols-3"
            >
              <div
                v-for="row in detailRows(state.profile)"
                :key="row.label"
                class="min-w-0"
              >
                <div class="settings-label mb-1.5">{{ row.label }}</div>
                <div
                  class="text-sm leading-snug text-foreground/95"
                  :class="
                    row.mono
                      ? 'font-mono text-xs break-all text-foreground/90'
                      : ''
                  "
                >
                  {{ row.value }}
                </div>
              </div>
            </div>

            <p
              v-if="state.mergeKind === 'full'"
              class="mt-10 max-w-2xl text-sm leading-relaxed text-muted"
            >
              {{ discordMergeHintFull }}
            </p>
            <p
              v-else
              class="mt-10 max-w-2xl text-sm leading-relaxed text-muted"
            >
              {{ discordMergeHintPartial }}
            </p>

            <div class="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                class="primary-btn rounded-xl px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
                :disabled="connectBusy"
                @click="onConnect"
              >
                {{ connectBusy ? '…' : discordReconnectCta }}
              </button>
              <button
                type="button"
                class="settings-action rounded-xl px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
                :disabled="connectBusy || profileImportBusy"
                @click="onImportProfileIntoEcho"
              >
                {{
                  profileImportBusy
                    ? 'Importing…'
                    : discordImportProfileIntoEchoCta
                }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="primary-btn rounded-xl px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
            :disabled="connectBusy"
            @click="onConnect"
          >
            {{ connectBusy ? 'Opening Discord…' : discordConnectCta }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
