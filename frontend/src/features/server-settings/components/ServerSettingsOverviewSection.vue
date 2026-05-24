<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { PUBLIC_INVITE_BASE } from '@/config';
import { icons } from '@/assets/icons';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import ServerBannerLimitedGif from '@/components/ServerBannerLimitedGif.vue';
import BannerRepositionModal from '@/components/BannerRepositionModal.vue';
import EmojiPackTagsField from '@/features/server-settings/components/EmojiPackTagsField.vue';
import { useVanityAvailabilityCheck } from '@/features/server-settings/composables/useVanityAvailabilityCheck';

const props = withDefaults(
  defineProps<{
    server: { id: string; name: string; vanityCode?: string } | null;
    form: {
      name: string;
      description: string;
      vanityCode: string;
      tags: string[];
    };
    accessToken?: string;
    canManageServer?: boolean;
    popularTagSuggestions?: string[];
    serverBannerUrl: string;
    bannerPositionY: number;
    serverIconUrl: string;
    /** When true, preview shows the same frosted blur as the channel header. */
    bannerBlurEnabled: boolean;
    /** When true, preview shows the same dark overlay as the channel header. */
    bannerBlackoutEnabled: boolean;
    /** Disables blur/blackout toggles while preference PATCHes are in flight. */
    bannerChannelPrefsPersisting?: boolean;
    onServerBannerFileChange: (event: Event) => void;
    /** Clear banner image (persisted for Echo guilds). */
    onRemoveServerBanner: () => void | Promise<void>;
    canManageBanner?: boolean;
    onServerIconFileChange: (event: Event) => void;
    onBannerPositionYSave?: (nextY: number) => void;
  }>(),
  {
    accessToken: '',
    canManageServer: false,
    canManageBanner: false,
    bannerChannelPrefsPersisting: false,
    popularTagSuggestions: () => [],
  },
);

const emit = defineEmits<{
  'update:bannerBlurEnabled': [value: boolean];
  'update:bannerBlackoutEnabled': [value: boolean];
  'vanity-blur': [];
  'name-blur': [];
  'description-blur': [];
  'tags-blur': [];
}>();

const inviteHostPrefix = computed(
  () => `${PUBLIC_INVITE_BASE.replace(/^https?:\/\//, '').replace(/\/$/, '')}/`,
);

const serverIdRef = toRef(() => props.server?.id);
const accessTokenRef = toRef(() => props.accessToken ?? '');
const vanityCodeRef = toRef(() => props.form.vanityCode);
const savedVanityRef = toRef(() =>
  (props.server?.vanityCode ?? '').trim().toLowerCase(),
);
const vanityCheckEnabled = toRef(
  () => props.canManageServer && Boolean(props.server?.id),
);

const {
  uiState: vanityUiState,
  statusMessage: vanityStatusMessage,
  statusTone: vanityStatusTone,
} = useVanityAvailabilityCheck({
  serverId: serverIdRef,
  accessToken: accessTokenRef,
  vanityCode: vanityCodeRef,
  savedVanityCode: savedVanityRef,
  enabled: vanityCheckEnabled,
});

function onBannerBlurInput(e: Event) {
  const el = e.target as HTMLInputElement;
  emit('update:bannerBlurEnabled', el.checked);
}

function onBannerBlackoutInput(e: Event) {
  const el = e.target as HTMLInputElement;
  emit('update:bannerBlackoutEnabled', el.checked);
}

/** File input stacks above the icon; drive GIF play from label hover. */
const serverIconHover = ref(false);
/** Banner preview strip hover (label covers the GIF layer). */
const serverBannerHover = ref(false);

const repositionOpen = ref(false);

function openReposition() {
  if (!props.serverBannerUrl?.trim()) return;
  repositionOpen.value = true;
}

function saveReposition(nextY: number) {
  props.onBannerPositionYSave?.(nextY);
}
</script>

<template>
  <div
    class="server-settings-overview--borderless grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
  >
    <div class="server-settings-panel min-w-0 rounded-2xl p-5">
      <div class="settings-subtitle mb-4">Server Details</div>
      <div class="space-y-4">
        <div>
          <label class="settings-label">Server Name</label>
          <input
            v-model="props.form.name"
            class="server-input mt-2 w-full"
            type="text"
            maxlength="100"
            @blur="emit('name-blur')"
          />
        </div>
        <div>
          <label class="settings-label">Description</label>
          <textarea
            v-model="props.form.description"
            class="server-input mt-2 min-h-[140px] w-full resize-none"
            maxlength="400"
            @blur="emit('description-blur')"
          ></textarea>
        </div>
        <EmojiPackTagsField
          v-model="props.form.tags"
          label="Server Tags"
          hint="Used in Explore for quick filters when this server is listed publicly."
          :popular-tags="props.popularTagSuggestions"
          @blur="emit('tags-blur')"
        />
        <div class="grid min-w-0 gap-4 md:grid-cols-2">
          <div class="min-w-0 md:col-span-2">
            <label class="settings-label" for="server-settings-vanity-code"
              >Vanity URL</label
            >
            <div
              class="server-vanity-input mt-2 flex w-full min-w-0 items-stretch overflow-hidden rounded-[0.9rem] bg-[var(--srv-input-bg)] shadow-[inset_0_0_0_1px_var(--srv-input-ring)] focus-within:shadow-[inset_0_0_0_1px_var(--srv-input-focus-ring)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)]"
            >
              <span
                class="server-vanity-input__prefix shrink-0 self-center border-r border-[color-mix(in_srgb,var(--srv-input-ring)_72%,transparent)] px-3 py-[0.85rem] text-sm text-fg-subtle"
                :title="inviteHostPrefix"
              >
                {{ inviteHostPrefix }}
              </span>
              <input
                id="server-settings-vanity-code"
                v-model="props.form.vanityCode"
                class="min-w-0 flex-1 border-0 bg-transparent px-3 py-[0.85rem] text-[var(--srv-input-fg)] outline-none"
                type="text"
                autocomplete="off"
                spellcheck="false"
                :aria-describedby="
                  vanityStatusMessage
                    ? 'server-settings-vanity-status'
                    : undefined
                "
                @blur="emit('vanity-blur')"
              />
            </div>
            <p
              v-if="vanityStatusMessage"
              id="server-settings-vanity-status"
              class="mt-1.5 text-xs"
              :class="{
                'text-fg-subtle': vanityStatusTone === 'neutral',
                'text-fg-soft': vanityStatusTone === 'pending',
                'text-[var(--vc-status-connected-fg)]':
                  vanityStatusTone === 'ok',
                'text-[var(--vc-status-error-fg)]': vanityStatusTone === 'bad',
              }"
              :aria-live="vanityUiState === 'checking' ? 'polite' : undefined"
            >
              {{ vanityStatusMessage }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="flex min-w-0 flex-col gap-4">
      <div class="server-settings-card overflow-hidden rounded-2xl">
        <div class="relative">
          <!-- Same height as channel list server banner (ChannelPanel: server-banner h-32 w-full) -->
          <div
            class="group relative isolate h-32 w-full overflow-hidden bg-scrim-1"
            @mouseenter="serverBannerHover = true"
            @mouseleave="serverBannerHover = false"
          >
            <ServerBannerLimitedGif
              session-key="server-settings-banner"
              :image-url="props.serverBannerUrl"
              :position-y="props.bannerPositionY"
              :force-active="serverBannerHover"
            />
            <div
              v-if="props.bannerBlurEnabled"
              class="pointer-events-none absolute inset-0 z-[1] server-settings-banner-preview-blur"
              aria-hidden="true"
            />
            <div
              v-if="props.bannerBlackoutEnabled"
              class="pointer-events-none absolute -inset-px z-[2] bg-scrim-2"
              aria-hidden="true"
            />
            <div
              class="pointer-events-none absolute -inset-px z-[3] server-settings-banner-preview-shadow"
              aria-hidden="true"
            />
            <label
              class="absolute inset-0 z-[4] cursor-pointer"
              title="Change banner"
            >
              <input
                type="file"
                accept="image/*"
                class="sr-only"
                @change="props.onServerBannerFileChange"
              />
              <span
                class="absolute inset-0 bg-transparent transition-[background-color] duration-200 group-hover:bg-scrim-2 pointer-coarse:bg-scrim-2"
                aria-hidden="true"
              />
              <span
                class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-coarse:opacity-100"
              >
                <span
                  class="echo-dark-chrome inline-flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm backdrop-blur-sm [html[data-theme='light']_&]:bg-black/65"
                >
                  <img
                    :src="icons.sliders"
                    alt=""
                    class="h-3.5 w-3.5 opacity-95 brightness-0 invert"
                  />
                  Change banner
                </span>
              </span>
            </label>

            <div
              v-if="props.serverBannerUrl?.trim()"
              class="absolute right-3 top-3 z-[6] flex flex-wrap items-center justify-end gap-2"
            >
              <button
                v-if="props.canManageBanner"
                type="button"
                class="echo-dark-chrome inline-flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-red-600 [html[data-theme='light']_&]:ring-1 [html[data-theme='light']_&]:ring-red-900/25"
                @click="props.onRemoveServerBanner()"
              >
                Remove
              </button>
              <button
                type="button"
                class="echo-dark-chrome inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm backdrop-blur-sm ring-1 ring-white/15 transition-colors hover:bg-black/65 [html[data-theme='light']_&]:ring-black/20"
                @click="openReposition"
              >
                <img
                  :src="icons.sliders"
                  alt=""
                  class="h-3.5 w-3.5 opacity-95 brightness-0 invert"
                />
                Reposition
              </button>
            </div>
          </div>

          <!-- Icon: left, straddling banner/card edge; size aligned with typical server icon scale -->
          <div class="relative min-h-[3.25rem] px-5 pb-5 pt-0 sm:px-6">
            <label
              class="group/icon server-settings-icon-picker absolute left-5 top-0 z-10 -translate-y-1/2 cursor-pointer sm:left-6"
              title="Change server icon"
              @mouseenter="serverIconHover = true"
              @mouseleave="serverIconHover = false"
            >
              <div
                class="relative h-16 w-16 overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--border)_55%,transparent)] bg-scrim-2 shadow-2"
              >
                <PausedGifAvatar
                  :src="serverGuildIconDisplayUrl(props.serverIconUrl)"
                  alt=""
                  img-class="h-full w-full object-cover"
                  :force-active="serverIconHover"
                />
                <div
                  class="server-settings-icon-picker__shade pointer-events-none absolute inset-0"
                  aria-hidden="true"
                />
                <div
                  class="server-settings-icon-picker__overlay pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-[background-color,opacity] group-hover/icon:opacity-100 pointer-coarse:opacity-100"
                >
                  <div
                    class="flex h-8 w-8 items-center justify-center rounded-full bg-scrim-2 shadow-2 ring-1 ring-[color-mix(in_srgb,var(--border)_70%,transparent)]"
                    aria-hidden="true"
                  >
                    <img
                      :src="icons.pen"
                      alt=""
                      class="server-settings-icon-picker__glyph h-4 w-4 opacity-90 echo-ink-icon"
                    />
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  @change="props.onServerIconFileChange"
                />
              </div>
            </label>

            <div class="pl-[calc(1.25rem+4rem+0.75rem)] pt-2 sm:pt-3">
              <div class="min-w-0">
                <div class="truncate text-lg font-semibold text-fg">
                  {{ props.form.name || props.server?.name }}
                </div>
                <div
                  class="mt-2 line-clamp-3 text-sm leading-relaxed text-fg-soft"
                >
                  {{ props.form.description }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <BannerRepositionModal
        v-model="repositionOpen"
        title="Reposition server banner"
        :image-url="props.serverBannerUrl"
        :position-y="props.bannerPositionY"
        session-key="server-settings-banner-reposition"
        @save="saveReposition"
      />

      <div class="server-settings-panel rounded-2xl p-4 sm:p-5">
        <div class="settings-subtitle mb-3">Channel banner</div>
        <div class="flex flex-col gap-2">
          <div class="server-toggle-row">
            <div>
              <div class="text-sm font-semibold text-fg">Blur banner</div>
              <div class="mt-0.5 text-xs text-fg-subtle">
                Frosted overlay on the channel header (matches preview above).
              </div>
            </div>
            <input
              type="checkbox"
              class="server-toggle shrink-0"
              :checked="props.bannerBlurEnabled"
              :disabled="props.bannerChannelPrefsPersisting"
              aria-label="Blur server banner in channel header"
              @change="onBannerBlurInput"
            />
          </div>
          <div class="server-toggle-row">
            <div>
              <div class="text-sm font-semibold text-fg">Blackout</div>
              <div class="mt-0.5 text-xs text-fg-subtle">
                Extra darkening on the banner image (stacked with blur).
              </div>
            </div>
            <input
              type="checkbox"
              class="server-toggle shrink-0"
              :checked="props.bannerBlackoutEnabled"
              :disabled="props.bannerChannelPrefsPersisting"
              aria-label="Dark overlay on server banner in channel header"
              @change="onBannerBlackoutInput"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
