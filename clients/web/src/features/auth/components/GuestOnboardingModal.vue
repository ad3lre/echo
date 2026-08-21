<script setup lang="ts">
import { computed, ref, watch, toRef } from 'vue';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import {
  AuthApiError,
  authDiscordOAuthStart,
  authPatchMe,
  authUpgradeGuest,
} from '@/api/authClient';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { icons } from '@/assets/icons';
import {
  computePasswordStrength,
  isValidEmailFormat,
  MIN_REGISTER_PASSWORD_STRENGTH_PCT,
  normalizeEmail,
} from '@/features/auth/accountValidation';
import {
  describeEchoUsernameFieldIssue,
  validateRegistrationUsername,
} from '@shared/usernamePolicy';
import { uploadUserProfileBrandingFile } from '@/api/echoClient';
import {
  isValidBrandingImageFile,
  extractUploadErrorMessage,
} from '@/features/server-settings/domain/brandingUploads';
import {
  readBlobAsDataUrl,
  uploadBrandingAssetWithInlineFallback,
} from '@/features/server-settings/brandingUploadFallback';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { startOAuthFlow } from '@/platform/desktopBridge';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [boolean];
  upgraded: [];
  'sign-in-existing': [];
}>();

const auth = useAuthSessionStore();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

type Step = 'profile' | 'credentials';
const step = ref<Step>('profile');

const displayName = ref('');
const username = ref('');
const pfp = ref('');

const email = ref('');
const password = ref('');

const busy = ref(false);
const error = ref('');

const passwordStrength = computed(() =>
  computePasswordStrength(password.value),
);
const registerPasswordOk = computed(
  () =>
    password.value.length >= 6 &&
    passwordStrength.value.fillPct >= MIN_REGISTER_PASSWORD_STRENGTH_PCT,
);

const usernameIssue = computed(() =>
  username.value.trim() ? describeEchoUsernameFieldIssue(username.value) : null,
);

const canProceedProfile = computed(() => {
  if (!pfp.value.trim()) return false;
  if (!displayName.value.trim()) return false;
  const vr = validateRegistrationUsername(username.value);
  return vr.ok;
});

function seedEmailFromSession() {
  const suggested = auth.backendUser?.guestPendingEmail?.trim();
  if (suggested && !email.value.trim()) email.value = suggested;
}

watch(
  () => [props.modelValue, auth.backendUser?.id] as const,
  ([open]) => {
    if (!open) return;
    error.value = '';
    busy.value = false;
    step.value = 'profile';
    displayName.value = '';
    username.value = '';
    pfp.value = '';
    password.value = '';
    // Keep email suggestion (from Discord) if available.
    seedEmailFromSession();
  },
  { immediate: true },
);

watch(
  () => auth.backendUser,
  () => {
    if (!props.modelValue) return;
    seedEmailFromSession();
    const u = auth.backendUser;
    if (!u?.isGuest) return;
    if (!canProceedProfile.value) return;
    step.value = 'credentials';
  },
  { deep: false },
);

async function onImportFromDiscord() {
  if (busy.value || echoSyncCapabilities.isMockDataMode) return;
  busy.value = true;
  error.value = '';
  try {
    const { authorizeUrl } = await authDiscordOAuthStart();
    startOAuthFlow(authorizeUrl);
  } catch (e) {
    error.value =
      e instanceof Error
        ? e.message
        : 'Could not connect Discord right now. Try again.';
  } finally {
    busy.value = false;
  }
}

async function onAvatarFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (input) input.value = '';
  if (!isValidBrandingImageFile(file)) return;
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const url =
      echoSyncCapabilities.isMockDataMode ||
      !auth.isAuthenticated ||
      auth.backendUser?.isGuest === true
        ? await readBlobAsDataUrl(file)
        : await uploadBrandingAssetWithInlineFallback({
            file,
            upload: () =>
              uploadUserProfileBrandingFile('', 'user_avatar', file),
          });
    pfp.value = url;
  } catch (e) {
    const detail = extractUploadErrorMessage(e);
    error.value = detail
      ? `Could not upload profile photo: ${detail}`
      : 'Could not upload profile photo.';
  } finally {
    busy.value = false;
  }
}

function goNextFromProfile() {
  error.value = '';
  if (!pfp.value.trim()) {
    error.value = 'Add a profile picture to continue.';
    return;
  }
  if (!displayName.value.trim()) {
    error.value = 'Enter a name to continue.';
    return;
  }
  const vr = validateRegistrationUsername(username.value);
  if (!vr.ok) {
    error.value =
      describeEchoUsernameFieldIssue(username.value) ??
      'Choose a valid handle to continue.';
    return;
  }
  step.value = 'credentials';
}

async function submit() {
  if (busy.value) return;
  error.value = '';

  if (!auth.isAuthenticated || auth.backendUser?.isGuest !== true) return;

  const vr = validateRegistrationUsername(username.value);
  if (!vr.ok) {
    error.value =
      describeEchoUsernameFieldIssue(username.value) ??
      'Choose a valid handle to continue.';
    step.value = 'profile';
    return;
  }
  if (!pfp.value.trim() || !displayName.value.trim()) {
    error.value = 'Finish your profile first.';
    step.value = 'profile';
    return;
  }

  const em = normalizeEmail(email.value);
  if (!em || !isValidEmailFormat(email.value)) {
    error.value = 'Enter a valid email address.';
    return;
  }
  if (password.value.length < 8 || !registerPasswordOk.value) {
    error.value =
      'Pick a stronger password (8+ chars, mix letters/numbers/symbols).';
    return;
  }

  busy.value = true;
  try {
    // 1) Persist guest-visible profile (username is set only on upgrade — PATCH /me blocks it for guests)
    const { user: patchedGuest } = await authPatchMe({
      displayName: displayName.value.trim(),
      pfp: pfp.value,
    });
    auth.applyRestoredProfile(patchedGuest);

    // 2) Upgrade guest → full account (username + credentials)
    const session = await authUpgradeGuest({
      email: em,
      password: password.value,
      username: vr.normalizedUsername,
      displayName: displayName.value.trim(),
      pfp: pfp.value,
    });
    auth.setSession(session);
    emit('upgraded');
    emit('update:modelValue', false);
  } catch (e) {
    if (e instanceof AuthApiError && e.body.code === 'EMAIL_IN_USE') {
      error.value = 'That email is already registered. Try logging in instead.';
      return;
    }
    if (e instanceof AuthApiError && e.body.code === 'USERNAME_TAKEN') {
      error.value =
        'That handle is already taken. Try adding a number or underscore.';
      step.value = 'profile';
      return;
    }
    if (e instanceof AuthApiError && e.body.code === 'INVALID_USERNAME') {
      error.value = 'That handle isn’t valid. Try a different one.';
      step.value = 'profile';
      return;
    }
    error.value =
      e instanceof Error ? e.message : 'Could not create your account.';
  } finally {
    busy.value = false;
  }
}

function onSignInExisting() {
  emit('sign-in-existing');
}
</script>

<template>
  <div
    v-if="modelValue"
    class="guest-onboarding-overlay fixed inset-0 z-[175] flex items-center justify-center px-4 py-8"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-onboarding-title"
      class="guest-onboarding-panel relative w-full max-w-[680px] rounded-[28px] px-7 py-7 text-foreground outline-none sm:px-10 sm:py-10"
    >
      <div class="flex items-start justify-between gap-5">
        <div class="min-w-0">
          <h2
            id="guest-onboarding-title"
            class="text-[1.65rem] font-bold leading-snug tracking-tight text-foreground sm:text-[1.8rem]"
          >
            Create your profile
          </h2>
          <p class="mt-2.5 text-[0.98rem] leading-relaxed text-fg-soft">
            Minimal profile first (photo, name, handle). Then secure it with
            email + password.
          </p>
        </div>
        <div class="shrink-0 flex items-center gap-2">
          <button
            type="button"
            class="guest-onboarding-toplink rounded-full px-3.5 py-2 text-sm font-semibold text-fg-soft transition hover:bg-glass-hover hover:text-white"
            :disabled="busy"
            @click="onSignInExisting"
          >
            Log in
          </button>
        </div>
      </div>

      <div class="mt-7 flex flex-col gap-4">
        <div
          v-if="step === 'profile'"
          class="guest-onboarding-card rounded-2xl bg-glass-1 p-5 sm:p-6"
        >
          <div class="flex items-center gap-4">
            <div class="h-16 w-16 overflow-hidden rounded-2xl bg-glass-2">
              <img
                v-if="pfp"
                :src="pfp"
                alt=""
                class="h-full w-full object-cover"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div
                class="text-xs font-semibold uppercase tracking-[0.16em] text-fg-subtle"
              >
                Profile picture
              </div>
              <label
                class="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-full bg-glass-2 px-4 py-2.5 text-sm font-semibold text-fg hover:bg-glass-3"
              >
                <img
                  :src="icons.plus"
                  alt=""
                  class="h-4 w-4 opacity-80 filter invert"
                />
                Upload photo
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="onAvatarFileChange"
                />
              </label>
            </div>
          </div>

          <div class="mt-5 grid gap-4">
            <div>
              <label class="guest-onboarding-label" for="guest-onboarding-name"
                >Name</label
              >
              <input
                id="guest-onboarding-name"
                v-model="displayName"
                type="text"
                maxlength="80"
                class="guest-onboarding-input mt-2"
                placeholder="How others see you"
                autocomplete="nickname"
              />
            </div>
            <div>
              <label
                class="guest-onboarding-label"
                for="guest-onboarding-handle"
                >Handle</label
              >
              <input
                id="guest-onboarding-handle"
                v-model="username"
                type="text"
                class="guest-onboarding-input mt-2"
                placeholder="@your_handle"
                autocomplete="username"
              />
              <p v-if="usernameIssue" class="mt-2 text-xs text-amber-200/80">
                {{ usernameIssue }}
              </p>
            </div>
          </div>

          <div
            class="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end"
          >
            <button
              type="button"
              class="guest-onboarding-secondary w-full rounded-full px-5 py-3 text-sm font-semibold text-fg-soft transition hover:bg-glass-hover disabled:opacity-50 sm:w-auto"
              :disabled="busy"
              @click="onSignInExisting"
            >
              Already have an account? Log in
            </button>
            <button
              type="button"
              class="guest-onboarding-primary w-full rounded-full px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-50 sm:w-auto"
              :disabled="busy || !canProceedProfile"
              @click="goNextFromProfile"
            >
              Continue
            </button>
          </div>
        </div>

        <div
          v-else
          class="guest-onboarding-card rounded-2xl bg-glass-1 p-5 sm:p-6"
        >
          <div class="grid gap-3">
            <div>
              <label class="guest-onboarding-label" for="guest-onboarding-email"
                >Email</label
              >
              <input
                id="guest-onboarding-email"
                v-model="email"
                type="email"
                inputmode="email"
                autocomplete="email"
                class="guest-onboarding-input mt-2"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label class="guest-onboarding-label" for="guest-onboarding-pass"
                >Password</label
              >
              <input
                id="guest-onboarding-pass"
                v-model="password"
                type="password"
                autocomplete="new-password"
                class="guest-onboarding-input mt-2"
                placeholder="••••••••"
                @keydown.enter.prevent="submit"
              />
              <div v-if="password.length > 0" class="mt-3 space-y-1.5">
                <div class="guest-onboarding-strength__track">
                  <div
                    class="guest-onboarding-strength__fill h-full rounded-full transition-all duration-300 ease-out"
                    :style="{ width: `${passwordStrength.fillPct}%` }"
                  />
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-fg-subtle">Password strength</span>
                  <span class="font-medium text-fg-soft">
                    {{ passwordStrength.label }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end"
          >
            <button
              type="button"
              class="guest-onboarding-secondary rounded-full px-5 py-3 text-sm font-semibold text-fg-soft hover:bg-glass-hover"
              :disabled="busy"
              @click="step = 'profile'"
            >
              Back
            </button>
            <button
              type="button"
              class="guest-onboarding-primary w-full rounded-full px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-50 sm:w-auto"
              :disabled="busy"
              @click="submit"
            >
              {{ busy ? 'Creating…' : 'Create Echo account' }}
            </button>
          </div>
        </div>

        <div
          class="guest-onboarding-footer rounded-2xl bg-glass-1 px-5 py-4 sm:px-6"
        >
          <div
            class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="text-sm leading-relaxed text-fg-soft">
              Have a Discord account?
              <span class="text-fg-soft"
                >Import your profile and we’ll suggest your email.</span
              >
            </div>
            <button
              type="button"
              class="guest-onboarding-discord rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-50"
              :disabled="busy || echoSyncCapabilities.isMockDataMode"
              @click="onImportFromDiscord"
            >
              Import from Discord
            </button>
          </div>
        </div>

        <p
          v-if="error"
          class="rounded-xl bg-rose-500/[0.14] px-4 py-3 text-sm leading-snug text-rose-100/95"
          role="alert"
        >
          {{ error }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.guest-onboarding-overlay {
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(14px);
}

.guest-onboarding-panel {
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, var(--echo-server-rail-bg) 92%, black 8%);
  box-shadow:
    0 24px 80px color-mix(in srgb, black 62%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 6%, transparent);
}

.guest-onboarding-card {
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 6%, transparent),
    0 10px 30px color-mix(in srgb, black 22%, transparent);
}

.guest-onboarding-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: color-mix(in srgb, white 55%, transparent);
}

.guest-onboarding-input {
  display: block;
  width: 100%;
  border-radius: 16px;
  border: 0;
  background: color-mix(in srgb, white 7%, transparent);
  padding: 0.9rem 1rem;
  font-size: 1rem;
  color: white;
  outline: none;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease;

  &::placeholder {
    color: color-mix(in srgb, white 40%, transparent);
  }

  &:focus-visible {
    /* Inset ring: outer box-shadow is clipped by .guest-onboarding-panel { overflow:hidden } */
    box-shadow: inset 0 0 0 2px color-mix(in srgb, #7c5cff 55%, transparent);
    background: color-mix(in srgb, white 9%, transparent);
  }
}

.guest-onboarding-primary {
  background: color-mix(in srgb, #7c5cff 92%, white 8%);
  box-shadow: 0 10px 30px color-mix(in srgb, #7c5cff 24%, transparent);

  &:hover:not(:disabled) {
    filter: brightness(1.06);
  }
}

.guest-onboarding-secondary {
  background: transparent;
}

.guest-onboarding-toplink {
  background: transparent;
}

.guest-onboarding-discord {
  border: 0;
  background: color-mix(in srgb, #5865f2 22%, transparent);
  color: white;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, #5865f2 28%, transparent);
  }
}

.guest-onboarding-footer {
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 5%, transparent);
}

.guest-onboarding-strength__track {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, white 12%, transparent);
  overflow: hidden;
}

.guest-onboarding-strength__fill {
  background: linear-gradient(90deg, #ff4d7d, #ffd36a, #34d399);
}
</style>
