<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { storeToRefs } from 'pinia';
import { icons } from '@/assets/icons';
import StatusIndicator from '@/components/StatusIndicator.vue';
import { useAuthSessionStore } from '@/stores/authSession';
import { useEchoSessionStore } from '@/stores/echoSession';
import { selectSelfPresence } from '@/services/domain/presence';
import { useSettingsProfileEditor } from '@/features/settings/composables/useSettingsProfileEditor';
import {
  DEFAULT_PROFILE_BANNER_SOLID_HEX,
  profileBannerFallbackLayerStyle,
  profileBannerRefractionBackdropStyle,
} from '@/utils/profileBannerGradientFromImage';
import ProfileBannerMedia from '@/components/ProfileBannerMedia.vue';
import BannerRepositionModal from '@/components/BannerRepositionModal.vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import ProfileBioText from '@/components/member-profile/ProfileBioText.vue';

const props = defineProps<{
  form: any;
  currentUser: any;
}>();

const authSession = useAuthSessionStore();
const echoSession = useEchoSessionStore();
const { presenceByUserId, presenceMobileByUserId } = storeToRefs(echoSession);

/** Same presence truth as rail / shell avatar (live map + session fallback). */
const selfPresenceForAvatar = computed(() => {
  const uid =
    String(props.currentUser?.id ?? '').trim() ||
    String(authSession.backendUser?.id ?? '').trim();
  return selectSelfPresence({
    userId: uid || undefined,
    authoritativeStatusesByUserId: presenceByUserId.value,
    sessionStatus: authSession.backendUser?.status,
    mobileSurface: uid ? presenceMobileByUserId.value[uid] === true : false,
  });
});

const currentUserRef = toRef(props, 'currentUser');

const {
  usernameFieldIssue,
  isEditingName,
  isEditingUsername,
  isEditingBio,
  isProfileLocked,
  profileCardRef,
  showResetConfirm,
  toggleEdit,
  handleReset,
  confirmReset,
  closeFieldEditors,
  startEditingName,
  startEditingUsername,
  startEditingBio,
  onBannerFileChange,
  removeBannerImage,
  onAvatarFileChange,
  toggleAndPersistBannerRefraction,
  toggleAndPersistBannerBlur,
  toggleAndPersistBannerBlackout,
  discordImportBusy,
  discordImportError,
  discordLinked,
  discordImportEnabled,
  discordProfileImportRecommended,
  importProfileFromDiscord,
  syncBannerToAuthBackend,
  persistProfileToServer,
} = useSettingsProfileEditor(props.form, currentUserRef);

const isBannerGradient = computed(() =>
  String(props.form.bannerColor ?? '').includes('gradient'),
);
const hasNoProfilePicture = computed(
  () => !String(props.form.pfp || props.currentUser?.pfp || '').trim(),
);

function useSolidBannerFallback() {
  props.form.bannerColor = DEFAULT_PROFILE_BANNER_SOLID_HEX;
}

const bannerRepositionOpen = ref(false);

function openBannerReposition() {
  if (isProfileLocked.value) return;
  if (!String(props.form.bannerImage ?? '').trim()) return;
  bannerRepositionOpen.value = true;
}

function saveBannerReposition(nextY: number) {
  props.form.bannerPositionY = nextY;
  syncBannerToAuthBackend();
  void persistProfileToServer();
}

defineExpose({
  isProfileLocked,
  closeFieldEditors,
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="settings-card overflow-hidden rounded-2xl relative">
      <!-- Profile Banner -->
      <div
        class="profile-banner group/banner relative isolate h-32 w-full overflow-hidden"
        :class="!isProfileLocked ? 'cursor-pointer' : ''"
      >
        <ProfileBannerMedia
          v-if="form.bannerImage"
          :banner-image="form.bannerImage"
          :session-key="`${String(currentUser?.id ?? 'me')}-settings-banner`"
          :position-y="form.bannerPositionY"
          wrapper-class="absolute inset-0 z-0 overflow-hidden"
        />
        <div
          v-else
          class="absolute inset-0 z-0"
          :style="profileBannerFallbackLayerStyle(form.bannerColor)"
        />
        <div
          v-if="form.bannerBlurEnabled"
          class="pointer-events-none absolute inset-0 z-[1] echo-user-banner-blur"
          aria-hidden="true"
        />
        <div
          v-if="form.bannerBlackoutEnabled"
          class="pointer-events-none absolute inset-0 z-[2] bg-scrim-2"
          aria-hidden="true"
        />
        <div
          class="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-b from-black/10 to-black/30"
        ></div>
        <!-- Div (not button): nested <label>/<input> is invalid inside <button> and breaks file pick on Safari. -->
        <div
          v-if="!isProfileLocked"
          class="banner-hover-overlay pointer-coarse:opacity-100 pointer-coarse:bg-scrim-2 absolute inset-0 z-20 flex items-end justify-center bg-transparent opacity-0 transition-all duration-150 pointer-fine:group-hover/banner:bg-scrim-2 pointer-fine:group-hover/banner:opacity-100"
        >
          <div
            class="mb-3 inline-flex w-[calc(100%-1.25rem)] max-w-[26rem] items-center justify-center gap-2 rounded-xl bg-scrim-2 px-2 py-2 ring-1 ring-border"
          >
            <label
              class="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-glass-2 px-3 py-2 cursor-pointer hover:bg-glass-hover transition-colors"
            >
              <img
                :src="icons.imageGallery"
                alt=""
                class="h-3.5 w-3.5 filter invert opacity-90"
              />
              <span class="text-[11px] font-semibold text-fg">
                Upload banner
              </span>
              <input
                type="file"
                accept="image/*"
                class="hidden"
                @change="onBannerFileChange"
              />
            </label>
            <button
              v-if="form.bannerImage"
              type="button"
              class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-glass-2 text-fg transition-colors hover:bg-glass-hover"
              title="Reposition banner"
              aria-label="Reposition banner"
              @click="openBannerReposition"
            >
              <img
                :src="icons.sliders"
                alt=""
                class="h-3.5 w-3.5 filter invert opacity-90"
              />
            </button>
            <button
              v-if="form.bannerImage"
              type="button"
              class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-glass-2 text-fg transition-colors hover:bg-glass-hover"
              title="Remove banner image"
              aria-label="Remove banner image"
              @click="removeBannerImage"
            >
              <img
                :src="icons.trash"
                alt=""
                class="h-3.5 w-3.5 filter invert opacity-90"
              />
            </button>
          </div>
        </div>
      </div>

      <div class="relative px-6 pb-6 pt-16">
        <div
          v-if="form.bannerRefractionEnabled"
          class="settings-banner-refraction"
          :style="
            profileBannerRefractionBackdropStyle(
              form.bannerColor,
              form.bannerImage,
              form.bannerPositionY,
            )
          "
        />
        <!-- Avatar with hover effect -->
        <div class="absolute -top-12 left-6 z-30 group/avatar">
          <div
            class="relative h-24 w-24 rounded-3xl border-[6px] border-bg bg-bg overflow-hidden"
          >
            <PausedGifAvatar
              :src="safeImageUrl(form.pfp || currentUser?.pfp)"
              :alt="currentUser?.name ?? 'Current user'"
              :session-key="String(currentUser?.id ?? 'settings-avatar')"
              :static-only="false"
              img-class="rounded-3xl object-cover"
            />
            <label
              v-if="!isProfileLocked"
              class="absolute inset-0 z-10 flex cursor-pointer items-center justify-center bg-scrim-2 opacity-0 transition-opacity pointer-coarse:opacity-100 pointer-fine:group-hover/avatar:opacity-100"
            >
              <span
                class="pointer-events-none text-center px-1 text-[10px] font-bold uppercase tracking-tighter text-foreground"
              >
                Change<br />Avatar
              </span>
              <input
                type="file"
                accept="image/*"
                class="hidden"
                @change="onAvatarFileChange"
              />
            </label>
          </div>
          <StatusIndicator
            :status="selfPresenceForAvatar.indicatorStatus ?? 'offline'"
            :mobile-surface="selfPresenceForAvatar.indicatorMobileSurface"
            size="lg"
            class="!bottom-1 !right-1"
          />
        </div>

        <!-- Editable Identity -->
        <div ref="profileCardRef" class="flex flex-col gap-1.5">
          <!-- Display name -->
          <div class="flex flex-col">
            <span v-if="!isProfileLocked" class="settings-label mb-1"
              >Display name</span
            >
            <div
              v-if="!isEditingName"
              role="button"
              tabindex="0"
              @click="startEditingName"
              @keydown.enter.prevent="startEditingName"
              :class="!isProfileLocked ? 'cursor-pointer' : 'cursor-default'"
              class="text-2xl font-bold rounded px-2 -ml-2 py-1"
            >
              {{ form.displayName }}
            </div>
            <input
              v-else
              v-model="form.displayName"
              class="settings-input text-2xl font-bold py-1"
              type="text"
              autofocus
              @keydown.esc.prevent="closeFieldEditors"
            />
          </div>

          <!-- User handle -->
          <div class="flex flex-col">
            <span v-if="!isProfileLocked" class="settings-label mb-1"
              >User handle</span
            >
            <div
              v-if="!isEditingUsername"
              role="button"
              tabindex="0"
              @click="startEditingUsername"
              @keydown.enter.prevent="startEditingUsername"
              :class="!isProfileLocked ? 'cursor-pointer' : 'cursor-default'"
              class="text-fg-soft rounded px-2 -ml-2 pt-0 pb-1"
            >
              @{{ form.username }}
            </div>
            <p
              v-if="
                !isProfileLocked && usernameFieldIssue && !isEditingUsername
              "
              class="text-xs leading-relaxed text-red-400/90 px-2 -ml-2"
            >
              {{ usernameFieldIssue }}
            </p>
            <div v-else-if="isEditingUsername" class="flex flex-col gap-1 ml-1">
              <div class="flex items-center gap-1">
                <span class="text-fg-soft">@</span>
                <input
                  v-model="form.username"
                  class="settings-input py-1"
                  type="text"
                  autofocus
                  :aria-invalid="usernameFieldIssue ? 'true' : 'false'"
                  @keydown.esc.prevent="closeFieldEditors"
                />
              </div>
              <p
                v-if="usernameFieldIssue"
                class="text-xs leading-relaxed text-red-400/90 pl-5"
              >
                {{ usernameFieldIssue }}
              </p>
            </div>
          </div>

          <!-- Bio -->
          <div class="flex flex-col">
            <div class="settings-label mb-1">About Me</div>
            <div
              v-if="!isEditingBio"
              role="button"
              tabindex="0"
              @click="startEditingBio"
              @keydown.enter.prevent="startEditingBio"
              :class="!isProfileLocked ? 'cursor-pointer' : 'cursor-default'"
              class="rounded px-2 -ml-2 py-1"
            >
              <ProfileBioText
                v-if="form.bio?.trim()"
                :text="form.bio"
                body-class="text-sm leading-6 text-fg-soft"
              />
              <p v-else class="text-sm leading-6 text-fg-soft">No bio set.</p>
            </div>
            <textarea
              v-else
              v-model="form.bio"
              class="settings-input min-h-[100px] resize-none py-2"
              @keydown.esc.prevent="closeFieldEditors"
            />
          </div>
        </div>

        <div class="mt-6 flex items-center gap-3">
          <template v-if="isProfileLocked">
            <button
              @click="toggleEdit"
              type="button"
              class="primary-btn rounded-xl px-6 py-2.5 text-sm font-semibold"
            >
              Edit Profile
            </button>
          </template>
          <template v-else>
            <button
              @click="toggleEdit"
              type="button"
              class="success-btn rounded-xl px-6 py-2.5 text-sm font-semibold"
            >
              Save Changes
            </button>
            <button
              @click="handleReset"
              type="button"
              class="settings-action rounded-xl px-6 py-2.5 text-sm font-medium"
            >
              Reset
            </button>
          </template>
        </div>
        <div
          v-if="!isProfileLocked"
          class="mt-3 inline-flex items-center gap-2 rounded-lg bg-glass-1 px-3 py-2"
        >
          <template v-if="isBannerGradient">
            <span
              class="h-4 w-14 shrink-0 rounded-sm ring-1 ring-white/25"
              :style="profileBannerFallbackLayerStyle(form.bannerColor)"
              aria-hidden="true"
            />
            <span class="text-xs text-fg-soft">Banner color from avatar</span>
            <button
              type="button"
              class="rounded-md bg-glass-2 px-2 py-1 text-[11px] font-medium text-fg-soft hover:bg-glass-3"
              @click="useSolidBannerFallback"
            >
              Use solid color
            </button>
          </template>
          <label
            v-else
            class="inline-flex cursor-pointer items-center gap-2 text-xs text-fg-soft hover:text-fg"
          >
            <span>Fallback color</span>
            <input
              v-model="form.bannerColor"
              type="color"
              class="banner-color-picker h-5 w-5 border-none bg-transparent p-0 cursor-pointer"
            />
          </label>
        </div>
        <div
          v-if="discordProfileImportRecommended && discordImportEnabled"
          class="mt-3 flex flex-wrap items-center gap-3"
        >
          <button
            type="button"
            class="primary-btn rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50"
            :disabled="discordImportBusy"
            @click="importProfileFromDiscord"
          >
            {{
              discordImportBusy
                ? 'Importing...'
                : discordLinked
                  ? 'Import profile from Discord'
                  : 'Connect Discord to import profile'
            }}
          </button>
          <span
            v-if="discordImportError"
            class="text-xs leading-relaxed text-red-400/90"
          >
            {{ discordImportError }}
          </span>
        </div>
      </div>
    </div>

    <BannerRepositionModal
      v-model="bannerRepositionOpen"
      title="Reposition profile banner"
      :image-url="form.bannerImage"
      :position-y="form.bannerPositionY"
      :session-key="`${String(currentUser?.id ?? 'me')}-settings-banner-reposition`"
      @save="saveBannerReposition"
    />

    <!-- Banner effects (separate from "Edit Profile" card) -->
    <div class="settings-card rounded-2xl p-6">
      <div class="settings-label mb-4">Banner effects</div>
      <p class="mb-4 text-xs text-fg-subtle leading-relaxed">
        Blur and blackout match the channel header look for servers. You can
        combine them with refraction.
      </p>
      <div class="banner-effects-grid">
        <button
          type="button"
          class="banner-effect-widget"
          @click="toggleAndPersistBannerBlur"
        >
          <span class="banner-effect-widget__head">
            <span class="banner-effect-widget__icon-wrap">
              <img
                :src="icons.sliders"
                alt=""
                class="banner-effect-widget__icon"
              />
            </span>
            <span class="banner-effect-widget__copy">
              <span class="banner-effect-widget__title">Blur banner</span>
              <span class="banner-effect-widget__subtitle"
                >Frosted softness</span
              >
            </span>
          </span>
          <span
            :class="
              form.bannerBlurEnabled
                ? 'toggle-pill banner-effect-widget__pill toggle-pill--on'
                : 'toggle-pill banner-effect-widget__pill'
            "
          />
        </button>
        <button
          type="button"
          class="banner-effect-widget"
          @click="toggleAndPersistBannerBlackout"
        >
          <span class="banner-effect-widget__head">
            <span class="banner-effect-widget__icon-wrap">
              <img
                :src="icons.moon"
                alt=""
                class="banner-effect-widget__icon"
              />
            </span>
            <span class="banner-effect-widget__copy">
              <span class="banner-effect-widget__title">Blackout</span>
              <span class="banner-effect-widget__subtitle">Depth contrast</span>
            </span>
          </span>
          <span
            :class="
              form.bannerBlackoutEnabled
                ? 'toggle-pill banner-effect-widget__pill toggle-pill--on'
                : 'toggle-pill banner-effect-widget__pill'
            "
          />
        </button>
        <button
          type="button"
          class="banner-effect-widget"
          @click="toggleAndPersistBannerRefraction"
        >
          <span class="banner-effect-widget__head">
            <span class="banner-effect-widget__icon-wrap">
              <img :src="icons.sun" alt="" class="banner-effect-widget__icon" />
            </span>
            <span class="banner-effect-widget__copy">
              <span class="banner-effect-widget__title">Refraction</span>
              <span class="banner-effect-widget__subtitle">Ambient glow</span>
            </span>
          </span>
          <span
            :class="
              form.bannerRefractionEnabled
                ? 'toggle-pill banner-effect-widget__pill toggle-pill--on'
                : 'toggle-pill banner-effect-widget__pill'
            "
          />
        </button>
      </div>
    </div>

    <!-- Reset Confirmation Pop-up -->
    <div
      v-if="showResetConfirm"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-overlay-dim backdrop-blur-sm px-4"
    >
      <div
        class="settings-card max-w-md w-full rounded-2xl p-6 shadow-2xl border border-border"
      >
        <h4 class="text-xl font-bold text-foreground">Reset Profile?</h4>
        <p class="mt-2 text-sm text-muted leading-6">
          This will discard all unsaved changes and restore your last saved
          profile state.
        </p>
        <div class="mt-6 flex items-center justify-end gap-3">
          <button
            @click="showResetConfirm = false"
            class="settings-action rounded-xl px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            @click="confirmReset"
            class="danger-btn rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Confirm Reset
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
