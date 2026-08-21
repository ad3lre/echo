<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { authUpgradeGuest } from '@/api/authClient';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { icons } from '@/assets/icons';
import {
  computePasswordStrength,
  isValidEmailFormat,
  MIN_REGISTER_PASSWORD_STRENGTH_PCT,
  normalizeEmail,
} from '@/features/auth/accountValidation';

const props = withDefaults(
  defineProps<{
    /** When true, clears fields and re-seeds display name from the session. */
    active: boolean;
    variant?: 'modal' | 'embedded';
    /** Heading + lead copy (settings embed). Hidden inside `GuestUpgradeModal`, which has its own title. */
    showIntro?: boolean;
  }>(),
  { variant: 'embedded', showIntro: true },
);

const emit = defineEmits<{
  upgraded: [];
  dismiss: [];
  'sign-in-existing': [];
}>();

const auth = useAuthSessionStore();
const email = ref('');
const password = ref('');
const displayName = ref('');
const err = ref('');
const busy = ref(false);

const passwordStrength = computed(() =>
  computePasswordStrength(password.value),
);
const registerPasswordOk = computed(
  () =>
    password.value.length >= 6 &&
    passwordStrength.value.fillPct >= MIN_REGISTER_PASSWORD_STRENGTH_PCT,
);

const inputClass = computed(() =>
  props.variant === 'embedded'
    ? 'settings-input guest-account-upgrade-input'
    : 'guest-account-upgrade-field--modal',
);

const strengthBarClass = computed(() => {
  const p = passwordStrength.value.fillPct;
  if (p >= 82) return 'guest-upgrade-strength__fill--strong';
  if (p >= 58) return 'guest-upgrade-strength__fill--good';
  if (p >= 36) return 'guest-upgrade-strength__fill--fair';
  return 'guest-upgrade-strength__fill--weak';
});

watch(
  () => [props.active, auth.backendUser?.guestPendingEmail] as const,
  ([on]) => {
    if (!on) return;
    err.value = '';
    const suggested = auth.backendUser?.guestPendingEmail?.trim();
    email.value = suggested || '';
    password.value = '';
    displayName.value = auth.backendUser?.displayName?.trim() || '';
  },
  { immediate: true },
);

async function submit() {
  const em = normalizeEmail(email.value);
  if (!em || !isValidEmailFormat(email.value)) {
    err.value = 'Enter a valid email address.';
    return;
  }
  if (password.value.length < 8 || !registerPasswordOk.value) {
    err.value =
      'Pick a stronger password (8+ chars, mix letters/numbers/symbols).';
    return;
  }
  if (!auth.isAuthenticated) return;
  busy.value = true;
  err.value = '';
  try {
    const session = await authUpgradeGuest({
      email: em,
      password: password.value,
      ...(displayName.value.trim()
        ? { displayName: displayName.value.trim() }
        : {}),
    });
    auth.setSession(session);
    emit('upgraded');
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : 'Upgrade failed';
  } finally {
    busy.value = false;
  }
}

function onSignInExisting() {
  emit('sign-in-existing');
}

function onDismiss() {
  emit('dismiss');
}
</script>

<template>
  <div
    class="guest-account-upgrade-panel"
    :class="
      variant === 'embedded' ? 'guest-account-upgrade-panel--embedded' : ''
    "
  >
    <div
      v-if="variant === 'embedded'"
      class="guest-upgrade-accent"
      aria-hidden="true"
    />

    <div
      class="guest-account-upgrade-panel__body"
      :class="
        variant === 'embedded'
          ? 'guest-account-upgrade-panel__body--embedded'
          : ''
      "
    >
      <div
        v-if="showIntro && variant === 'embedded'"
        class="guest-account-upgrade-hero"
      >
        <div class="guest-account-upgrade-hero__badge-row">
          <span
            class="guest-account-upgrade-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-indigo-200/95 ring-1 ring-indigo-400/35"
          >
            <img
              :src="icons.friendAdd"
              alt=""
              class="h-3.5 w-3.5 opacity-90"
              aria-hidden="true"
            />
            Guest
          </span>
        </div>
        <h4
          class="mt-3 text-xl font-bold tracking-tight text-foreground sm:text-2xl"
        >
          Upgrade your account
        </h4>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Turn this guest session into a full Echo account—takes under a minute.
        </p>
      </div>

      <div v-else-if="showIntro" class="flex flex-col gap-1">
        <h4 class="text-lg font-bold text-foreground">Upgrade your account</h4>
        <p class="text-sm leading-relaxed text-muted">
          You’re on a guest session. Add email and password to save your
          account, unlock Friends, and use Echo without guest limits.
        </p>
      </div>

      <div
        class="guest-account-upgrade-form-wrap"
        :class="
          variant === 'embedded'
            ? 'guest-account-upgrade-form-wrap--embedded'
            : 'guest-account-upgrade-form-wrap--modal'
        "
      >
        <div class="guest-account-upgrade-field">
          <label class="guest-account-upgrade-label" for="guest-upgrade-display"
            >Display name
            <span class="guest-account-upgrade-label__opt"
              >(optional)</span
            ></label
          >
          <input
            id="guest-upgrade-display"
            v-model="displayName"
            type="text"
            maxlength="80"
            :class="inputClass"
            placeholder="How others see you"
            autocomplete="nickname"
          />
        </div>
        <div class="guest-account-upgrade-field mt-4">
          <label class="guest-account-upgrade-label" for="guest-upgrade-email"
            >Email</label
          >
          <input
            id="guest-upgrade-email"
            v-model="email"
            type="email"
            autocomplete="email"
            :class="inputClass"
            placeholder="you@example.com"
          />
        </div>
        <div class="guest-account-upgrade-field mt-4">
          <label
            class="guest-account-upgrade-label"
            for="guest-upgrade-password"
            >Password</label
          >
          <input
            id="guest-upgrade-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            :class="inputClass"
            placeholder="••••••••"
            @keydown.enter.prevent="submit"
          />
          <div v-if="password.length > 0" class="mt-3 space-y-1.5">
            <div class="guest-upgrade-strength__track">
              <div
                class="guest-upgrade-strength__fill h-full rounded-full"
                :class="strengthBarClass"
                :style="{ width: `${passwordStrength.fillPct}%` }"
              />
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-muted">Password strength</span>
              <span
                class="font-medium"
                :class="{
                  'text-rose-200/90': passwordStrength.fillPct < 36,
                  'text-amber-200/90':
                    passwordStrength.fillPct >= 36 &&
                    passwordStrength.fillPct < 58,
                  'text-emerald-200/90':
                    passwordStrength.fillPct >= 58 &&
                    passwordStrength.fillPct < 82,
                  'text-emerald-100': passwordStrength.fillPct >= 82,
                }"
              >
                {{ passwordStrength.label }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <p
        v-if="err"
        class="mt-4 rounded-xl bg-rose-500/[0.14] px-4 py-3 text-sm leading-snug text-rose-100/95"
        role="alert"
      >
        {{ err }}
      </p>

      <div
        class="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
      >
        <button
          v-if="variant === 'modal'"
          type="button"
          class="order-2 rounded-xl px-4 py-3 text-sm font-semibold text-muted transition-colors hover:bg-glass-tint hover:text-foreground sm:order-1 sm:mr-auto"
          @click="onDismiss"
        >
          Not now
        </button>
        <button
          type="button"
          class="order-1 w-full rounded-xl px-5 py-3 text-sm font-semibold text-[color:var(--set-primary-fg)] transition disabled:cursor-not-allowed disabled:opacity-50 sm:order-2 sm:w-auto sm:min-w-[11rem]"
          :class="
            variant === 'embedded'
              ? 'primary-btn guest-account-upgrade-submit'
              : 'guest-account-upgrade-submit-modal guest-account-upgrade-submit'
          "
          :disabled="busy"
          @click="submit"
        >
          {{ busy ? 'Saving…' : 'Create account' }}
        </button>
      </div>

      <div
        class="guest-account-upgrade-divider mt-8 flex items-center gap-3"
        role="presentation"
      >
        <span class="h-px flex-1 bg-[var(--border)] opacity-80" />
        <span
          class="shrink-0 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted"
        >
          Or
        </span>
        <span class="h-px flex-1 bg-[var(--border)] opacity-80" />
      </div>

      <button
        type="button"
        class="guest-account-upgrade-signin mt-4 flex w-full items-center gap-4 rounded-xl p-4 text-left transition-colors"
        :class="
          variant === 'embedded'
            ? 'ring-1 ring-[var(--border)] hover:bg-glass-hover'
            : 'border border-accent/25 bg-accent/8 hover:bg-accent/14'
        "
        @click="onSignInExisting"
      >
        <div
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-glass-2 ring-1 ring-border"
        >
          <img
            :src="icons.logIn"
            alt=""
            class="h-6 w-6 opacity-90 filter invert"
          />
        </div>
        <div class="min-w-0">
          <div class="font-semibold text-foreground">
            Sign in to an existing account
          </div>
          <div class="mt-0.5 text-sm text-muted">
            Already registered? Use your Echo email and password.
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.guest-account-upgrade-panel--embedded {
  position: relative;
  overflow: hidden;
}

.guest-account-upgrade-panel__body--embedded {
  padding: 1.35rem 1.35rem 1.5rem;
  padding-top: 1.15rem;

  @media (min-width: 640px) {
    padding: 1.75rem 1.75rem 1.85rem;
    padding-top: 1.35rem;
  }
}

.guest-account-upgrade-form-wrap--embedded {
  margin-top: 1.5rem;
  padding: 1.15rem 1.1rem 1.25rem;
  border-radius: 1rem;
  background: var(--set-panel-bg);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 5%, transparent),
    inset 0 0 0 1px var(--set-panel-ring);

  @media (min-width: 640px) {
    padding: 1.35rem 1.25rem 1.4rem;
  }
}

.guest-account-upgrade-form-wrap--modal {
  margin-top: 0;
  padding: 1rem 0.85rem 1.1rem;
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--overlay-subtle) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--glass-border) 65%, transparent);
}

.guest-account-upgrade-field {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.guest-account-upgrade-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}

.guest-account-upgrade-label__opt {
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
  color: var(--muted);
  opacity: 0.92;
}

/* Stronger field contrast inside the upgrade card (embedded). */
.guest-account-upgrade-input {
  background: color-mix(in srgb, var(--set-input-bg) 88%, white 12%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 7%, transparent),
    inset 0 0 0 1px var(--border);

  &::placeholder {
    color: color-mix(in srgb, var(--muted) 75%, transparent);
  }
}

.guest-upgrade-accent {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  border-radius: 12px 12px 0 0;
  background: linear-gradient(
    90deg,
    var(--vue-auto-081),
    var(--vue-auto-169),
    var(--vue-auto-170)
  );
  opacity: 0.95;
  pointer-events: none;
}

.guest-upgrade-strength__track {
  height: 6px;
  border-radius: 999px;
  background: var(--vue-auto-001);
  overflow: hidden;
}

.guest-upgrade-strength__fill--weak {
  background: linear-gradient(90deg, var(--vue-auto-055), var(--vue-auto-082));
}
.guest-upgrade-strength__fill--fair {
  background: linear-gradient(90deg, var(--vue-auto-083), var(--vue-auto-175));
}
.guest-upgrade-strength__fill--good {
  background: linear-gradient(90deg, var(--vue-auto-176), var(--vue-auto-177));
}
.guest-upgrade-strength__fill--strong {
  background: linear-gradient(90deg, var(--vue-auto-178), var(--vue-auto-084));
}

.guest-account-upgrade-field--modal {
  display: block;
  width: 100%;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--glass-border) 55%, transparent);
  background: color-mix(in srgb, var(--overlay-subtle) 88%, transparent);
  padding: 0.65rem 0.85rem;
  font-size: 0.9375rem;
  color: var(--text);
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;

  &::placeholder {
    color: color-mix(in srgb, var(--muted) 80%, transparent);
  }

  &:focus-visible {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--glass-border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
  }
}

.guest-account-upgrade-submit-modal {
  background: var(--vue-auto-179);
  box-shadow: none;

  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  &:active:not(:disabled) {
    transform: translateY(0.5px);
  }
}

.guest-account-upgrade-submit {
  &:disabled {
    box-shadow: none;
  }
}
</style>
