<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  toRef,
  watch,
} from 'vue';
import { clampMenuToViewport } from '@/features/chat/composables/useContextMenuPosition';
import { PUBLIC_INVITE_BASE } from '@/config';
import { icons } from '@/assets/icons';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import ServerBannerLimitedGif from '@/features/server-settings/components/ServerBannerLimitedGif.vue';
import BannerRepositionModal from '@/features/server-settings/components/BannerRepositionModal.vue';
import EmojiPackTagsField from '@/features/server-settings/components/EmojiPackTagsField.vue';
import { useVanityAvailabilityCheck } from '@/features/server-settings/composables/useVanityAvailabilityCheck';
import type { ChannelCategory } from '@/composables/useChannels';
import { useChannelIconResolver } from '@/composables/useChannelIconResolver';
import EchoDropdown from '@/components/EchoDropdown.vue';
import type { EchoDropdownOption } from '@/components/EchoDropdown.vue';

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
    /** Optional welcome channel for join system messages. */
    welcomeChannelId?: string | null;
    /** Guild channel tree for welcome channel picker. */
    categories?: ChannelCategory[];
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
    welcomeChannelId: null,
    categories: () => [],
  },
);

const emit = defineEmits<{
  'update:bannerBlurEnabled': [value: boolean];
  'update:bannerBlackoutEnabled': [value: boolean];
  'update:welcomeChannelId': [value: string | null];
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

const channelIconResolver = useChannelIconResolver(serverIdRef);

const welcomeChannelDropdownOptions = computed((): EchoDropdownOption[] => {
  const opts: EchoDropdownOption[] = [{ value: '', label: 'None' }];
  for (const cat of props.categories ?? []) {
    for (const ch of cat.channels ?? []) {
      if (ch.type !== 'text') continue;
      const iconSrc = channelIconResolver.getIconUrl(ch);
      opts.push({
        value: ch.id,
        label: cat.name ? `${cat.name} / ${ch.name}` : ch.name,
        iconSrc: iconSrc || undefined,
        iconMono: channelIconResolver.usesSvgInvert(ch),
      });
    }
  }
  return opts;
});

const welcomeChannelModel = computed({
  get: () => props.welcomeChannelId ?? '',
  set: (value: string) => {
    emit('update:welcomeChannelId', value.trim() ? value : null);
  },
});

/** File input stacks above the icon; drive GIF play from label hover. */
const serverIconHover = ref(false);
/** Banner preview strip hover (label covers the GIF layer). */
const serverBannerHover = ref(false);

const repositionOpen = ref(false);
const hasServerBanner = computed(() => !!props.serverBannerUrl?.trim());

const bannerMenuOpen = ref(false);
const bannerMenuRef = ref<HTMLElement | null>(null);
const bannerMenuTriggerRef = ref<HTMLElement | null>(null);
const bannerFileInputRef = ref<HTMLInputElement | null>(null);
const bannerMenuPosition = ref({ left: 0, top: 0 });

const bannerMenuStyle = computed(() => ({
  left: `${bannerMenuPosition.value.left}px`,
  top: `${bannerMenuPosition.value.top}px`,
}));

watch(bannerMenuOpen, (open) => {
  if (!open) return;
  void nextTick().then(() => {
    const rect = bannerMenuTriggerRef.value?.getBoundingClientRect();
    if (!rect) return;
    const estW = 200;
    const estH = 132;
    const left = rect.right - estW;
    const top = rect.bottom + 8;
    bannerMenuPosition.value = clampMenuToViewport(left, top, estW, estH);
    void nextTick().then(() => {
      requestAnimationFrame(() => {
        const el = bannerMenuRef.value;
        if (!el) return;
        const r = el.getBoundingClientRect();
        bannerMenuPosition.value = clampMenuToViewport(
          r.left,
          r.top,
          r.width,
          r.height,
        );
      });
    });
  });
});

function closeBannerMenu() {
  bannerMenuOpen.value = false;
}

function toggleBannerMenu() {
  bannerMenuOpen.value = !bannerMenuOpen.value;
}

function onBannerMenuDocMouseDown(ev: MouseEvent) {
  const target = ev.target;
  if (!(target instanceof Node)) return;
  if (bannerMenuRef.value?.contains(target)) return;
  if (bannerMenuTriggerRef.value?.contains(target)) return;
  closeBannerMenu();
}

function onBannerMenuKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') closeBannerMenu();
}

onMounted(() => {
  document.addEventListener('mousedown', onBannerMenuDocMouseDown);
  document.addEventListener('keydown', onBannerMenuKeydown);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onBannerMenuDocMouseDown);
  document.removeEventListener('keydown', onBannerMenuKeydown);
});

function openReposition() {
  if (!hasServerBanner.value) return;
  repositionOpen.value = true;
}

function openBannerRepositionFromMenu() {
  closeBannerMenu();
  openReposition();
}

function pickBannerImage() {
  closeBannerMenu();
  bannerFileInputRef.value?.click();
}

async function removeBannerFromMenu() {
  closeBannerMenu();
  await props.onRemoveServerBanner();
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
            <!-- Div (not button): nested <label>/<input> is invalid inside <button> and breaks file pick on Safari. -->
            <div
              class="banner-hover-overlay pointer-coarse:opacity-100 absolute inset-0 z-[6] flex items-start justify-end bg-transparent p-3 opacity-0 transition-opacity duration-200 pointer-fine:group-hover:opacity-100"
            >
              <input
                ref="bannerFileInputRef"
                type="file"
                accept="image/*"
                class="sr-only"
                @change="props.onServerBannerFileChange"
              />
              <button
                ref="bannerMenuTriggerRef"
                type="button"
                class="echo-dark-chrome inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur-sm ring-1 ring-white/15 transition-colors hover:bg-black/65 [html[data-theme='light']_&]:ring-black/20"
                title="Banner options"
                aria-label="Banner options"
                aria-haspopup="menu"
                :aria-expanded="bannerMenuOpen"
                @click.stop="toggleBannerMenu"
              >
                <img
                  :src="icons.moreVertical"
                  alt=""
                  class="h-4 w-4 brightness-0 invert opacity-95"
                />
              </button>
              <Teleport to="body">
                <div
                  v-if="bannerMenuOpen"
                  ref="bannerMenuRef"
                  role="menu"
                  aria-label="Banner options"
                  class="ellipsis-menu chat-liquid-glass-menu--over-modal fixed z-[200] min-w-[180px] py-1"
                  :style="bannerMenuStyle"
                  @click.stop
                >
                  <button
                    type="button"
                    role="menuitem"
                    class="chat-focus-ring echo-menu-item flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-foreground"
                    @click="pickBannerImage"
                  >
                    <img
                      :src="icons.imageGallery"
                      alt=""
                      class="echo-menu-item-icon--img h-4 w-4 shrink-0 opacity-90"
                    />
                    Change banner
                  </button>
                  <button
                    v-if="hasServerBanner"
                    type="button"
                    role="menuitem"
                    class="chat-focus-ring echo-menu-item flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-foreground"
                    @click="openBannerRepositionFromMenu"
                  >
                    <img
                      :src="icons.sliders"
                      alt=""
                      class="echo-menu-item-icon--img h-4 w-4 shrink-0 opacity-90"
                    />
                    Reposition
                  </button>
                  <button
                    v-if="hasServerBanner && props.canManageBanner"
                    type="button"
                    role="menuitem"
                    class="chat-focus-ring echo-menu-item echo-menu-item--destructive flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm"
                    @click="removeBannerFromMenu"
                  >
                    <img
                      :src="icons.trash"
                      alt=""
                      class="echo-menu-item-icon--img h-4 w-4 shrink-0 opacity-90"
                    />
                    Remove
                  </button>
                </div>
              </Teleport>
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

      <div class="server-settings-panel rounded-2xl p-4 sm:p-5">
        <div class="settings-subtitle mb-1">Welcome channel</div>
        <p class="mb-3 text-xs text-fg-subtle">
          Post a system message when someone joins. Leave unset to disable.
        </p>
        <div class="max-w-md">
          <EchoDropdown
            v-model="welcomeChannelModel"
            :options="welcomeChannelDropdownOptions"
            surface="server"
            teleport-menu
            searchable
            :disabled="
              !props.canManageServer || props.bannerChannelPrefsPersisting
            "
          />
        </div>
      </div>
    </div>
  </div>
</template>
