<script setup lang="ts">
import { onMounted, ref, toRef } from 'vue';
import { useAuthSessionStore } from '@/stores/authSession';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useSettingsAccountSecurity } from '@/features/settings/composables/useSettingsAccountSecurity';
import { ECHO_PASSKEYS_ENABLED } from '@/config/echoPasskeysEnabled';
import { prefetchPasskeyRegistrationOptions } from '@/utils/passkeyWebCeremony';
import { EMAIL_VERIFICATION_DOWNTIME } from '@/config/emailVerificationDowntime';
import {
  PHONE_VERIFICATION_COMING_SOON,
  TWO_FACTOR_AUTH_COMING_SOON,
} from '@/features/settings/data';
import type {
  SettingsForm,
  SettingsCurrentUser,
} from '@/features/settings/composables/useSettingsForm';
import {
  formatAuthSessionSummary,
  parseAuthSessionUserAgent,
} from '@/utils/authSessionDeviceLabel';
import type { AuthSessionInfo } from '@/api/authClient';

const props = defineProps<{
  form: SettingsForm;
  currentUser: SettingsCurrentUser;
}>();

const emit = defineEmits<{
  close: [];
}>();

const authSession = useAuthSessionStore();
const currentUserRef = toRef(props, 'currentUser');

const {
  isEditingEmail,
  isEditingPhone,
  isAccountLocked,
  showAccountPasswordPrompt,
  accountPasswordInput,
  accountPasswordError,
  accountPasswordSubmitting,
  closeAccountPasswordPrompt,
  showAccountResetConfirm,
  showChangePasswordModal,
  changePasswordCurrent,
  changePasswordNew,
  changePasswordConfirm,
  changePasswordError,
  changePasswordBusy,
  showChangePasswordCurrentValue,
  showChangePasswordNewValue,
  showChangePasswordConfirmValue,
  showDisableAccountConfirm,
  showDeleteAccountConfirm,
  deleteAccountPassword,
  deleteAccountError,
  deleteAccountBusy,
  disableAccountBusy,
  accountSaveError,
  accountSaveBusy,
  accountGuestNotice,
  dismissGuestNotice,
  sessions,
  sessionsLoading,
  sessionsError,
  sessionsRevokingId,
  loadAccountSessions,
  revokeSession,
  formatSessionDate,
  passkeys,
  passkeysLoading,
  passkeysError,
  passkeyRevokingId,
  passkeyRenamingId,
  loadPasskeys,
  revokePasskey,
  renamePasskey,
  showTwoFactorSetupModal,
  twoFactorStep,
  twoFactorSecret,
  twoFactorCode,
  twoFactorError,
  twoFactorQrRects,
  twoFactorQrDataUrl,
  twoFactorSetupBusy,
  twoFactorRecoveryCodes,
  showTwoFactorDisableModal,
  disableTotpPassword,
  disableTotpCode,
  disableTotpRecoveryCode,
  disableTotpFactor,
  disableTotpError,
  disableTotpBusy,
  phoneOtpCode,
  phoneOtpError,
  phoneOtpBusy,
  phoneSendBusy,
  resendEmailBusy,
  resendEmailMessage,
  resendEmailError,
  openTwoFactorSetupModal,
  closeTwoFactorSetupModal,
  verifyTwoFactorCode,
  openTwoFactorDisableModal,
  closeTwoFactorDisableModal,
  submitDisableTotp,
  sendPhoneVerificationCode,
  resendPhoneVerificationCode,
  submitPhoneVerification,
  resendEmailVerification,
  copyRecoveryCodes,
  maskEmail,
  maskPhone,
  handleEditAccountClick,
  confirmAccountUnlock,
  openChangePasswordModal,
  closeChangePasswordModal,
  submitChangePassword,
  openDisableAccountConfirm,
  closeDisableAccountConfirm,
  openDeleteAccountConfirm,
  closeDeleteAccountConfirm,
  confirmDisableAccount,
  confirmDeleteAccount,
  handleAccountReset,
  confirmAccountReset,
  toggleEditEmail,
  toggleEditPhone,
  registerPasskey,
  passkeyRegisterBusy,
  passkeyRegisterError,
  passkeyRegisterSuccess,
} = useSettingsAccountSecurity(props.form, currentUserRef);

/**
 * Load sessions when this panel mounts. Parent `SettingsModal` cannot rely on
 * `accountRef` in a watcher: `SettingsAccount` sits inside `<Transition mode="out-in">`,
 * so the ref is still null when section switches until the enter transition runs.
 */
onMounted(() => {
  void loadAccountSessions();
  if (ECHO_PASSKEYS_ENABLED) {
    void loadPasskeys();
    void prefetchPasskeyRegistrationOptions();
  }
});

function sessionTitle(s: AuthSessionInfo): string {
  return parseAuthSessionUserAgent(s.userAgent).headline;
}

function sessionSubtitle(s: AuthSessionInfo): string {
  return formatAuthSessionSummary(s);
}

const passkeyNewLabel = ref('');
const passkeyEditingLabelId = ref<string | null>(null);
const passkeyEditingLabelValue = ref('');

async function handleAddPasskey() {
  if (!ECHO_PASSKEYS_ENABLED) return;
  passkeyRegisterSuccess.value = null;
  await registerPasskey(passkeyNewLabel.value.trim() || undefined);
  if (!passkeyRegisterError.value) {
    passkeyNewLabel.value = '';
    await loadPasskeys();
  }
}

function startRenamePasskey(id: string, currentLabel: string) {
  passkeyEditingLabelId.value = id;
  passkeyEditingLabelValue.value = currentLabel;
}

async function confirmRenamePasskey() {
  if (!passkeyEditingLabelId.value) return;
  await renamePasskey(
    passkeyEditingLabelId.value,
    passkeyEditingLabelValue.value,
  );
  passkeyEditingLabelId.value = null;
  passkeyEditingLabelValue.value = '';
}

function cancelRenamePasskey() {
  passkeyEditingLabelId.value = null;
  passkeyEditingLabelValue.value = '';
}

async function onConfirmDisableAccount() {
  const signedOut = await confirmDisableAccount();
  if (signedOut) emit('close');
}

async function onConfirmDeleteAccount() {
  const deleted = await confirmDeleteAccount();
  if (deleted) emit('close');
}

defineExpose({
  loadAccountSessions,
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <div
      v-if="accountGuestNotice"
      class="echo-warn-banner rounded-xl border border-amber-400/25 px-4 py-3 text-sm"
    >
      <div class="flex items-start justify-between gap-3">
        <span>{{ accountGuestNotice }}</span>
        <button
          type="button"
          class="shrink-0 text-xs font-semibold uppercase tracking-wider text-[color:var(--mention-special-fg)] hover:text-[color:var(--mention-special-fg-hover)]"
          @click="dismissGuestNotice"
        >
          Dismiss
        </button>
      </div>
    </div>

    <div class="settings-card rounded-2xl p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h4 class="text-lg font-bold text-foreground">Account Security</h4>
          <p class="text-sm text-muted mt-1">
            Manage your sign-in credentials and security settings.
          </p>
          <p v-if="accountSaveError" class="mt-2 text-sm text-red-600">
            {{ accountSaveError }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button
            v-if="!isAccountLocked"
            @click="handleAccountReset"
            type="button"
            class="settings-action rounded-xl px-4 py-2 text-sm font-medium"
          >
            Reset
          </button>
          <button
            @click="handleEditAccountClick"
            type="button"
            class="rounded-xl px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50"
            :class="isAccountLocked ? 'primary-btn' : 'success-btn'"
            :disabled="accountSaveBusy"
          >
            {{
              isAccountLocked
                ? 'Edit Account'
                : accountSaveBusy
                  ? 'Saving…'
                  : 'Save Changes'
            }}
          </button>
        </div>
      </div>

      <div class="grid gap-6">
        <!-- Email -->
        <div class="flex flex-col gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="settings-label">Email Address</span>
            <template
              v-if="
                !echoSyncCapabilities.isMockDataMode &&
                authSession.backendUser &&
                !authSession.backendUser.isGuest &&
                authSession.backendUser.email?.trim()
              "
            >
              <span
                v-if="authSession.backendUser.emailVerified"
                class="echo-status-pill echo-status-pill--success rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              >
                Verified
              </span>
              <span
                v-else-if="!EMAIL_VERIFICATION_DOWNTIME"
                class="echo-status-pill echo-status-pill--warn rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              >
                Unverified
              </span>
            </template>
          </div>
          <p v-if="resendEmailMessage" class="text-xs echo-success-text">
            {{ resendEmailMessage }}
          </p>
          <p v-if="resendEmailError" class="text-xs text-red-600">
            {{ resendEmailError }}
          </p>
          <div
            v-if="
              !echoSyncCapabilities.isMockDataMode &&
              authSession.backendUser &&
              !authSession.backendUser.isGuest &&
              authSession.backendUser.email &&
              !EMAIL_VERIFICATION_DOWNTIME &&
              authSession.backendUser.emailVerified === false
            "
            class="flex flex-wrap items-center gap-2"
          >
            <button
              type="button"
              class="rounded-lg bg-glass-2 px-3 py-1.5 text-xs font-semibold text-fg hover:bg-glass-hover disabled:opacity-50"
              :disabled="resendEmailBusy || isAccountLocked"
              @click="resendEmailVerification"
            >
              {{ resendEmailBusy ? 'Sending…' : 'Resend verification email' }}
            </button>
          </div>
          <div
            v-if="!isEditingEmail"
            @click="toggleEditEmail"
            class="settings-panel flex items-center justify-between rounded-xl p-4 transition-colors group/field"
            :class="
              isAccountLocked
                ? 'cursor-default'
                : 'cursor-pointer hover:bg-glass-1'
            "
          >
            <span class="text-fg font-medium">{{
              isAccountLocked ? maskEmail(form.email) : form.email
            }}</span>
            <span
              v-if="!isAccountLocked"
              class="text-[10px] font-bold uppercase tracking-wider text-[color:var(--vc-settings-accent-fg)] opacity-0 group-hover/field:opacity-100 pointer-coarse:opacity-100 transition-opacity"
              >Edit</span
            >
          </div>
          <input
            v-else
            v-model="form.email"
            @blur="toggleEditEmail"
            @keyup.enter="toggleEditEmail"
            class="settings-input"
            type="email"
            autofocus
          />
        </div>

        <!-- Phone -->
        <div
          v-if="
            echoSyncCapabilities.isMockDataMode &&
            !PHONE_VERIFICATION_COMING_SOON
          "
          class="flex flex-col gap-2"
        >
          <span class="settings-label">Phone Number</span>
          <div
            v-if="!isEditingPhone"
            @click="toggleEditPhone"
            class="settings-panel flex items-center justify-between rounded-xl p-4 transition-colors group/field"
            :class="
              isAccountLocked
                ? 'cursor-default'
                : 'cursor-pointer hover:bg-glass-1'
            "
          >
            <span class="text-fg font-medium">{{
              isAccountLocked ? maskPhone(form.phone) : form.phone
            }}</span>
            <span
              v-if="!isAccountLocked"
              class="text-[10px] font-bold uppercase tracking-wider text-[color:var(--vc-settings-accent-fg)] opacity-0 group-hover/field:opacity-100 pointer-coarse:opacity-100 transition-opacity"
              >Edit</span
            >
          </div>
          <input
            v-else
            v-model="form.phone"
            @blur="toggleEditPhone"
            @keyup.enter="toggleEditPhone"
            class="settings-input"
            type="tel"
            autofocus
          />
        </div>
        <div
          v-else-if="
            !echoSyncCapabilities.isMockDataMode &&
            authSession.backendUser &&
            !authSession.backendUser.isGuest &&
            !PHONE_VERIFICATION_COMING_SOON
          "
          class="flex flex-col gap-3"
        >
          <span class="settings-label">Phone Number</span>
          <div
            v-if="isAccountLocked"
            class="settings-panel flex flex-col gap-2 rounded-xl p-4 text-sm text-fg-soft"
          >
            <div
              v-if="authSession.backendUser.phone"
              class="flex flex-wrap items-center gap-2"
            >
              <span class="text-muted">Verified</span>
              <span class="font-medium">{{
                authSession.backendUser.phone
              }}</span>
            </div>
            <div
              v-if="authSession.backendUser.pendingPhone"
              class="flex flex-wrap items-center gap-2"
            >
              <span class="text-muted">Pending verification</span>
              <span class="font-medium">{{
                authSession.backendUser.pendingPhone
              }}</span>
            </div>
            <p
              v-if="
                !authSession.backendUser.phone &&
                !authSession.backendUser.pendingPhone
              "
              class="text-fg-subtle"
            >
              No phone on file. Unlock account to add one.
            </p>
          </div>
          <div v-else class="flex flex-col gap-2">
            <input
              v-model="form.phone"
              class="settings-input"
              type="tel"
              autocomplete="tel"
              placeholder="Include country code (e.g. +1…)"
            />
            <p class="text-xs text-muted leading-relaxed">
              Save changes to update your number, then request an SMS code.
            </p>
          </div>
          <div
            v-if="authSession.backendUser.pendingPhone"
            class="flex flex-col gap-2 rounded-xl border border-border bg-scrim-1 p-4"
          >
            <span class="text-xs font-semibold text-fg-soft"
              >SMS verification</span
            >
            <p v-if="phoneOtpError" class="text-xs text-red-600">
              {{ phoneOtpError }}
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg bg-glass-2 px-3 py-1.5 text-xs font-semibold hover:bg-glass-hover disabled:opacity-50"
                :disabled="phoneSendBusy || isAccountLocked"
                @click="sendPhoneVerificationCode"
              >
                {{ phoneSendBusy ? 'Sending…' : 'Send code' }}
              </button>
              <button
                type="button"
                class="rounded-lg bg-glass-1 px-3 py-1.5 text-xs font-semibold hover:bg-glass-2 disabled:opacity-50"
                :disabled="phoneSendBusy || isAccountLocked"
                @click="resendPhoneVerificationCode"
              >
                Resend
              </button>
            </div>
            <label class="flex flex-col gap-1.5">
              <span class="text-[11px] font-semibold text-muted"
                >Code from SMS</span
              >
              <input
                v-model="phoneOtpCode"
                class="settings-input"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder="Enter code"
                :disabled="isAccountLocked"
                @keyup.enter="submitPhoneVerification"
              />
            </label>
            <button
              type="button"
              class="self-start rounded-lg bg-indigo-500/30 px-3 py-1.5 text-xs font-semibold hover:bg-indigo-500/40 disabled:opacity-50"
              :disabled="phoneOtpBusy || isAccountLocked"
              @click="submitPhoneVerification"
            >
              {{ phoneOtpBusy ? 'Verifying…' : 'Verify phone' }}
            </button>
          </div>
        </div>
        <div v-else class="flex flex-col gap-2">
          <span class="settings-label">Phone Number</span>
          <div class="settings-panel rounded-xl p-4 flex flex-col gap-2">
            <div
              v-if="authSession.backendUser?.phone"
              class="flex flex-wrap items-center gap-2 text-sm text-fg-soft"
            >
              <span class="text-muted">Verified</span>
              <span class="font-medium">{{
                authSession.backendUser.phone
              }}</span>
            </div>
            <div
              v-if="authSession.backendUser?.pendingPhone"
              class="flex flex-wrap items-center gap-2 text-sm text-fg-soft"
            >
              <span class="text-muted">Pending verification</span>
              <span class="font-medium">{{
                authSession.backendUser.pendingPhone
              }}</span>
            </div>
            <span class="text-sm text-fg-soft">
              Phone verification is
              <span
                class="font-semibold text-[color:var(--vc-settings-accent-fg)]"
                >coming soon</span
              >.
            </span>
          </div>
        </div>

        <!-- Password: v-memo avoids re-rendering this block while typing email/phone in siblings -->
        <div
          v-memo="[
            isAccountLocked,
            form.passwordMask,
            echoSyncCapabilities.isMockDataMode,
            authSession.backendUser?.isGuest,
          ]"
          class="flex flex-col gap-2"
        >
          <span class="settings-label">Password</span>
          <div
            class="settings-panel flex items-center justify-between rounded-xl p-4"
          >
            <span class="text-fg-subtle tracking-widest">{{
              form.passwordMask
            }}</span>
            <button
              type="button"
              class="text-xs font-bold uppercase tracking-wider text-[color:var(--vc-settings-accent-fg)] hover:text-foreground"
              @click="openChangePasswordModal"
              :disabled="isAccountLocked"
              :class="
                isAccountLocked
                  ? 'opacity-50 cursor-not-allowed hover:text-[color:var(--vc-settings-accent-fg)]'
                  : ''
              "
            >
              Change Password
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Password Prompt Modal -->
    <div
      v-if="showAccountPasswordPrompt"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-overlay-dim backdrop-blur-sm px-4"
    >
      <div
        class="settings-card max-w-md w-full rounded-2xl p-6 shadow-2xl border border-border"
      >
        <form class="flex flex-col" @submit.prevent="confirmAccountUnlock">
          <h4 class="text-xl font-bold text-foreground">Password Required</h4>
          <p class="mt-2 text-sm text-muted leading-6">
            Please enter your password to edit sensitive account information.
          </p>
          <div class="mt-4">
            <input
              v-model="accountPasswordInput"
              type="password"
              placeholder="Enter password"
              class="settings-input"
              :disabled="accountPasswordSubmitting"
              autocomplete="current-password"
              autofocus
            />
            <p v-if="accountPasswordError" class="mt-2 text-sm text-red-600">
              {{ accountPasswordError }}
            </p>
          </div>
          <div class="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              :disabled="accountPasswordSubmitting"
              @click="closeAccountPasswordPrompt"
              class="settings-action rounded-xl px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="accountPasswordSubmitting"
              class="primary-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {{ accountPasswordSubmitting ? 'Verifying…' : 'Confirm' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Change Password Modal -->
    <div
      v-if="showChangePasswordModal"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-overlay-heavy backdrop-blur-sm px-4"
    >
      <div
        class="settings-card max-w-md w-full rounded-2xl p-6 shadow-2xl border border-border"
      >
        <form class="flex flex-col" @submit.prevent="submitChangePassword">
          <h4 class="text-xl font-bold text-foreground">Change Password</h4>
          <p class="mt-2 text-sm text-muted leading-6">
            Enter your current password and choose a new one.
          </p>

          <div class="mt-4 flex flex-col gap-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-muted"
                >Current password</span
              >
              <input
                v-model="changePasswordCurrent"
                :type="showChangePasswordCurrentValue ? 'text' : 'password'"
                placeholder="Enter current password"
                class="settings-input"
                autofocus
              />
              <button
                type="button"
                class="self-end text-[10px] font-bold uppercase tracking-wider text-[color:var(--vc-settings-accent-fg)] hover:text-foreground"
                @click="
                  showChangePasswordCurrentValue =
                    !showChangePasswordCurrentValue
                "
              >
                {{ showChangePasswordCurrentValue ? 'Hide' : 'Show' }}
              </button>
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-muted">New password</span>
              <input
                v-model="changePasswordNew"
                :type="showChangePasswordNewValue ? 'text' : 'password'"
                placeholder="Enter new password"
                class="settings-input"
              />
              <button
                type="button"
                class="self-end text-[10px] font-bold uppercase tracking-wider text-[color:var(--vc-settings-accent-fg)] hover:text-foreground"
                @click="
                  showChangePasswordNewValue = !showChangePasswordNewValue
                "
              >
                {{ showChangePasswordNewValue ? 'Hide' : 'Show' }}
              </button>
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-muted"
                >Confirm new password</span
              >
              <input
                v-model="changePasswordConfirm"
                :type="showChangePasswordConfirmValue ? 'text' : 'password'"
                placeholder="Re-enter new password"
                class="settings-input"
              />
              <button
                type="button"
                class="self-end text-[10px] font-bold uppercase tracking-wider text-[color:var(--vc-settings-accent-fg)] hover:text-foreground"
                @click="
                  showChangePasswordConfirmValue =
                    !showChangePasswordConfirmValue
                "
              >
                {{ showChangePasswordConfirmValue ? 'Hide' : 'Show' }}
              </button>
            </label>

            <div v-if="changePasswordError" class="text-sm text-red-600">
              {{ changePasswordError }}
            </div>
          </div>

          <div class="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              :disabled="changePasswordBusy"
              @click="closeChangePasswordModal"
              class="settings-action rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="changePasswordBusy"
              class="primary-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {{ changePasswordBusy ? 'Updating…' : 'Update Password' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 2FA Setup Modal -->
    <div
      v-if="showTwoFactorSetupModal"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-overlay-heavy backdrop-blur-sm px-4"
      @click.self="closeTwoFactorSetupModal"
    >
      <div
        class="settings-card max-w-md w-full max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-2xl border border-border"
      >
        <h4
          v-if="twoFactorStep === 'setup'"
          class="text-xl font-bold text-foreground"
        >
          Set up Two-Factor Auth
        </h4>
        <h4
          v-else-if="twoFactorStep === 'verify'"
          class="text-xl font-bold text-foreground"
        >
          Verify 2FA Code
        </h4>
        <h4
          v-else-if="twoFactorStep === 'recovery'"
          class="text-xl font-bold text-foreground"
        >
          Save your recovery codes
        </h4>
        <h4 v-else class="text-xl font-bold text-foreground">
          Two-Factor Enabled
        </h4>

        <p
          v-if="twoFactorStep === 'setup'"
          class="mt-2 text-sm text-muted leading-6"
        >
          Scan the QR code with your authenticator app, then continue.
        </p>
        <p
          v-else-if="twoFactorStep === 'verify'"
          class="mt-2 text-sm text-muted leading-6"
        >
          Enter the 6-digit code from your authenticator app.
        </p>
        <p
          v-else-if="twoFactorStep === 'recovery'"
          class="mt-2 text-sm text-muted leading-6"
        >
          Each code works once if you lose your device. Store them somewhere
          safe — they won’t be shown again.
        </p>
        <p v-else class="mt-2 text-sm text-muted leading-6">
          Your account now requires 2FA for sign-in.
        </p>

        <div
          v-if="twoFactorError && twoFactorStep === 'setup'"
          class="mt-3 text-sm text-red-600"
        >
          {{ twoFactorError }}
        </div>

        <div v-if="twoFactorStep === 'setup'" class="mt-4 flex flex-col gap-4">
          <div
            class="rounded-xl bg-scrim-2 border border-border p-4 flex items-center justify-center min-h-[144px]"
          >
            <template v-if="echoSyncCapabilities.isMockDataMode">
              <svg
                viewBox="0 0 210 210"
                class="w-36 h-36 text-[color:var(--vc-settings-accent-fg)]"
                aria-hidden="true"
              >
                <rect
                  v-for="r in twoFactorQrRects"
                  :key="`${r.x}-${r.y}`"
                  :x="r.x * 10"
                  :y="r.y * 10"
                  width="9"
                  height="9"
                  fill="currentColor"
                />
              </svg>
            </template>
            <template v-else-if="twoFactorSetupBusy && !twoFactorQrDataUrl">
              <span class="text-sm text-muted">Loading QR code…</span>
            </template>
            <img
              v-else-if="twoFactorQrDataUrl"
              :src="twoFactorQrDataUrl"
              alt="Authenticator QR code"
              class="w-36 h-36 object-contain"
              width="144"
              height="144"
            />
          </div>

          <div
            v-if="twoFactorSecret"
            class="rounded-xl bg-scrim-2 border border-border p-4"
          >
            <div
              class="text-[11px] font-bold uppercase tracking-[0.18em] text-muted mb-2"
            >
              Secret key
            </div>
            <code class="block text-sm text-fg font-mono break-all">
              {{ twoFactorSecret }}
            </code>
            <div
              v-if="echoSyncCapabilities.isMockDataMode"
              class="mt-2 text-xs text-muted"
            >
              Demo: to finish verification, enter
              <span class="font-bold text-[color:var(--vc-settings-accent-fg)]"
                >123456</span
              >.
            </div>
          </div>
        </div>

        <div
          v-else-if="twoFactorStep === 'verify'"
          class="mt-4 flex flex-col gap-3"
        >
          <label class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-muted"
              >Verification code</span
            >
            <input
              v-model="twoFactorCode"
              inputmode="numeric"
              type="text"
              placeholder="123456"
              maxlength="8"
              class="settings-input"
              :disabled="twoFactorSetupBusy"
              @keyup.enter="verifyTwoFactorCode"
              autofocus
            />
          </label>
          <div v-if="twoFactorError" class="text-sm text-red-600">
            {{ twoFactorError }}
          </div>
        </div>

        <div
          v-else-if="twoFactorStep === 'recovery'"
          class="mt-4 flex flex-col gap-3"
        >
          <ul
            class="max-h-40 overflow-y-auto rounded-xl border border-border bg-scrim-1 p-3 font-mono text-xs text-fg"
          >
            <li
              v-for="(c, i) in twoFactorRecoveryCodes"
              :key="i"
              class="py-0.5"
            >
              {{ c }}
            </li>
          </ul>
          <button
            type="button"
            class="settings-action rounded-xl px-4 py-2 text-sm font-medium self-start"
            @click="copyRecoveryCodes"
          >
            Copy all
          </button>
        </div>

        <div v-else class="mt-4 flex flex-col gap-3">
          <div
            class="echo-success-banner rounded-xl border border-emerald-400/20 p-4"
          >
            <div class="text-sm font-bold">2FA is active</div>
            <div class="mt-1 text-xs text-muted">
              You can manage 2FA from this section in the future.
            </div>
          </div>
        </div>

        <div class="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            @click="closeTwoFactorSetupModal"
            class="settings-action rounded-xl px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>

          <button
            v-if="twoFactorStep === 'setup'"
            type="button"
            :disabled="
              echoSyncCapabilities.isMockDataMode
                ? false
                : (!!twoFactorError && !twoFactorQrDataUrl) ||
                  twoFactorSetupBusy
            "
            @click="twoFactorStep = 'verify'"
            class="primary-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Continue
          </button>

          <button
            v-else-if="twoFactorStep === 'verify'"
            type="button"
            :disabled="twoFactorSetupBusy"
            @click="verifyTwoFactorCode"
            class="primary-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {{ twoFactorSetupBusy ? 'Verifying…' : 'Verify' }}
          </button>

          <button
            v-else-if="twoFactorStep === 'recovery'"
            type="button"
            @click="closeTwoFactorSetupModal"
            class="success-btn rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Done
          </button>

          <button
            v-else
            type="button"
            @click="closeTwoFactorSetupModal"
            class="success-btn rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>

    <!-- Disable 2FA Modal -->
    <div
      v-if="showTwoFactorDisableModal"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-overlay-heavy backdrop-blur-sm px-4"
      @click.self="closeTwoFactorDisableModal"
    >
      <div
        class="settings-card max-w-md w-full rounded-2xl p-6 shadow-2xl border border-border"
      >
        <h4 class="text-xl font-bold text-foreground">
          Disable two-factor authentication
        </h4>
        <p class="mt-2 text-sm text-muted leading-6">
          Enter your password and a valid authenticator code or recovery code.
        </p>
        <form class="flex flex-col" @submit.prevent="submitDisableTotp">
          <div class="mt-4 flex gap-2 rounded-xl bg-glass-2 p-1">
            <button
              type="button"
              class="flex-1 rounded-lg py-2 text-xs font-semibold transition"
              :class="
                disableTotpFactor === 'totp'
                  ? 'bg-glass-3 text-foreground'
                  : 'text-fg-subtle hover:text-fg-soft'
              "
              @click="disableTotpFactor = 'totp'"
            >
              Authenticator
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg py-2 text-xs font-semibold transition"
              :class="
                disableTotpFactor === 'recovery'
                  ? 'bg-glass-3 text-foreground'
                  : 'text-fg-subtle hover:text-fg-soft'
              "
              @click="disableTotpFactor = 'recovery'"
            >
              Recovery
            </button>
          </div>
          <label class="mt-4 flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-muted">Password</span>
            <input
              v-model="disableTotpPassword"
              type="password"
              autocomplete="current-password"
              class="settings-input"
            />
          </label>
          <label
            v-if="disableTotpFactor === 'totp'"
            class="mt-3 flex flex-col gap-1.5"
          >
            <span class="text-xs font-semibold text-muted">6-digit code</span>
            <input
              v-model="disableTotpCode"
              inputmode="numeric"
              type="text"
              maxlength="8"
              class="settings-input"
              placeholder="000000"
            />
          </label>
          <label v-else class="mt-3 flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-muted">Recovery code</span>
            <input
              v-model="disableTotpRecoveryCode"
              type="text"
              autocomplete="off"
              class="settings-input"
              placeholder="XXXX-XXXX-XXXX"
            />
          </label>
          <p v-if="disableTotpError" class="mt-3 text-sm text-red-600">
            {{ disableTotpError }}
          </p>
          <div class="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              :disabled="disableTotpBusy"
              class="settings-action rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
              @click="closeTwoFactorDisableModal"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="disableTotpBusy"
              class="danger-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {{ disableTotpBusy ? 'Working…' : 'Disable 2FA' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Disable Account Confirmation Modal -->
    <div
      v-if="showDisableAccountConfirm"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-overlay-heavy backdrop-blur-sm px-4"
    >
      <div
        class="settings-card max-w-md w-full rounded-2xl p-6 shadow-2xl border border-border"
      >
        <h4 class="text-xl font-bold text-foreground">
          {{
            echoSyncCapabilities.isMockDataMode
              ? 'Disable Account?'
              : 'Sign out everywhere?'
          }}
        </h4>
        <p class="mt-2 text-sm text-muted leading-6">
          <template v-if="echoSyncCapabilities.isMockDataMode">
            This will temporarily disable your account. You can re-enable it
            later.
          </template>
          <template v-else>
            This signs you out on every device and revokes all active sessions.
            You can sign in again anytime.
          </template>
        </p>
        <div class="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            :disabled="disableAccountBusy"
            @click="closeDisableAccountConfirm"
            class="settings-action rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="disableAccountBusy"
            @click="onConfirmDisableAccount"
            class="primary-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {{
              disableAccountBusy
                ? 'Working…'
                : echoSyncCapabilities.isMockDataMode
                  ? 'Confirm Disable'
                  : 'Sign out everywhere'
            }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Account Confirmation Modal -->
    <div
      v-if="showDeleteAccountConfirm"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-overlay-heavy backdrop-blur-sm px-4"
    >
      <div
        class="settings-card max-w-md w-full rounded-2xl p-6 shadow-2xl border border-border"
      >
        <form
          class="flex flex-col"
          @submit.prevent="
            echoSyncCapabilities.isMockDataMode
              ? closeDeleteAccountConfirm()
              : onConfirmDeleteAccount()
          "
        >
          <h4 class="text-xl font-bold text-foreground">Delete Account?</h4>
          <p class="mt-2 text-sm text-muted leading-6">
            This will permanently delete your account and all associated data.
            This action cannot be undone.
          </p>
          <template v-if="!echoSyncCapabilities.isMockDataMode">
            <label class="mt-4 flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-muted"
                >Confirm with your password</span
              >
              <input
                v-model="deleteAccountPassword"
                type="password"
                autocomplete="current-password"
                class="settings-input"
                placeholder="Current password"
              />
              <span class="text-xs text-muted">
                Leave blank if you sign in with Discord or as a guest.
              </span>
            </label>
            <p v-if="deleteAccountError" class="mt-2 text-sm text-red-600">
              {{ deleteAccountError }}
            </p>
          </template>
          <div class="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              :disabled="deleteAccountBusy"
              @click="closeDeleteAccountConfirm"
              class="settings-action rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              v-if="echoSyncCapabilities.isMockDataMode"
              type="button"
              :disabled="deleteAccountBusy"
              @click="closeDeleteAccountConfirm"
              class="danger-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {{ deleteAccountBusy ? 'Deleting…' : 'Close' }}
            </button>
            <button
              v-else
              type="submit"
              :disabled="deleteAccountBusy"
              class="danger-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {{ deleteAccountBusy ? 'Deleting…' : 'Delete account' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Account Reset Confirmation Pop-up -->
    <div
      v-if="showAccountResetConfirm"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-overlay-dim backdrop-blur-sm px-4"
    >
      <div
        class="settings-card max-w-md w-full rounded-2xl p-6 shadow-2xl border border-border"
      >
        <h4 class="text-xl font-bold text-foreground">Reset Account Info?</h4>
        <p class="mt-2 text-sm text-muted leading-6">
          This will discard all unsaved changes to your email and phone number.
        </p>
        <div class="mt-6 flex items-center justify-end gap-3">
          <button
            @click="showAccountResetConfirm = false"
            class="settings-action rounded-xl px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            @click="confirmAccountReset"
            class="danger-btn rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Confirm Reset
          </button>
        </div>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <div
        v-if="TWO_FACTOR_AUTH_COMING_SOON"
        class="settings-card rounded-2xl p-6"
      >
        <div class="settings-label mb-4">Multi-Factor Authentication</div>
        <div
          class="settings-panel rounded-xl p-5 border border-indigo-500/10 bg-indigo-500/5"
        >
          <p
            class="mb-4 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-3 text-sm text-foreground"
          >
            Two-factor authentication is
            <span
              class="font-semibold text-[color:var(--vc-settings-accent-fg)]"
              >coming soon</span
            >.
          </p>
          <div class="flex items-start gap-4">
            <div
              class="h-10 w-10 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0"
            >
              <svg
                class="w-5 h-5 text-[color:var(--vc-settings-accent-fg)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 11V8a5 5 0 0 1 10 0v3"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 11h14v10H5z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 15l2 2 4-5"
                />
              </svg>
            </div>
            <div>
              <div
                class="text-sm font-bold uppercase tracking-wider text-foreground"
              >
                Two-Factor Auth (2FA)
              </div>
              <p class="text-xs text-muted mt-1 leading-relaxed">
                Require an authenticator code when you sign in.
              </p>
              <span
                v-if="authSession.backendUser?.totpEnabled"
                class="mt-4 inline-block text-xs font-bold uppercase tracking-widest text-[color:var(--set-positive-label-fg)]"
                >2FA enabled</span
              >
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="echoSyncCapabilities.isMockDataMode"
        class="settings-card rounded-2xl p-6"
      >
        <div class="settings-label mb-4">Multi-Factor Authentication</div>
        <div
          class="settings-panel rounded-xl p-5 border border-indigo-500/10 bg-indigo-500/5"
        >
          <div class="flex items-start gap-4">
            <div
              class="h-10 w-10 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0"
            >
              <svg
                class="w-5 h-5 text-[color:var(--vc-settings-accent-fg)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 11V8a5 5 0 0 1 10 0v3"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 11h14v10H5z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 15l2 2 4-5"
                />
              </svg>
            </div>
            <div>
              <div
                class="text-sm font-bold uppercase tracking-wider text-foreground"
              >
                Two-Factor Auth (2FA)
              </div>
              <p class="text-xs text-muted mt-1 leading-relaxed">
                Protect your account with an extra layer of security.
              </p>
              <button
                v-if="!form.twoFactorEnabled"
                type="button"
                class="mt-4 text-xs font-bold uppercase tracking-widest"
                :disabled="isAccountLocked"
                :class="
                  isAccountLocked
                    ? 'cursor-not-allowed text-[color:var(--vc-settings-accent-fg)] opacity-40'
                    : 'text-[color:var(--vc-settings-accent-fg)] hover:text-foreground'
                "
                @click="openTwoFactorSetupModal"
              >
                Enable 2FA
              </button>

              <button
                v-else
                type="button"
                class="mt-4 cursor-default text-xs font-bold uppercase tracking-widest text-[color:var(--set-positive-label-fg)]"
                disabled
              >
                2FA Enabled
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="
          !echoSyncCapabilities.isMockDataMode &&
          authSession.backendUser &&
          !authSession.backendUser.isGuest
        "
        class="settings-card rounded-2xl p-6"
      >
        <div class="settings-label mb-4">Multi-Factor Authentication</div>
        <div
          class="settings-panel rounded-xl p-5 border border-indigo-500/10 bg-indigo-500/5"
        >
          <div class="flex items-start gap-4">
            <div
              class="h-10 w-10 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0"
            >
              <svg
                class="w-5 h-5 text-[color:var(--vc-settings-accent-fg)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 11V8a5 5 0 0 1 10 0v3"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 11h14v10H5z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 15l2 2 4-5"
                />
              </svg>
            </div>
            <div>
              <div
                class="text-sm font-bold uppercase tracking-wider text-foreground"
              >
                Two-Factor Auth (2FA)
              </div>
              <p class="text-xs text-muted mt-1 leading-relaxed">
                Require an authenticator code when you sign in.
              </p>
              <div
                v-if="!authSession.backendUser.totpEnabled"
                class="mt-4 flex flex-wrap gap-2"
              >
                <button
                  type="button"
                  class="text-xs font-bold uppercase tracking-widest text-[color:var(--vc-settings-accent-fg)] hover:text-foreground disabled:opacity-40"
                  :disabled="isAccountLocked"
                  @click="openTwoFactorSetupModal"
                >
                  Enable 2FA
                </button>
              </div>
              <div v-else class="mt-4 flex flex-wrap gap-3">
                <span
                  class="text-xs font-bold uppercase tracking-widest text-[color:var(--set-positive-label-fg)]"
                  >2FA enabled</span
                >
                <button
                  type="button"
                  class="text-xs font-bold uppercase tracking-widest text-red-600 hover:text-red-700 disabled:opacity-40"
                  :disabled="isAccountLocked"
                  @click="openTwoFactorDisableModal"
                >
                  Disable
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="
          ECHO_PASSKEYS_ENABLED &&
          !echoSyncCapabilities.isMockDataMode &&
          authSession.backendUser &&
          !authSession.backendUser.isGuest
        "
        class="settings-card rounded-2xl p-6"
      >
        <div class="settings-label mb-4">Passkeys</div>
        <p class="text-xs text-muted leading-relaxed mb-3">
          Sign in with Face ID, Touch ID, or Windows Hello. You can add several
          passkeys and remove ones you no longer use.
        </p>
        <p v-if="passkeysError" class="text-sm text-red-600 mb-2">
          {{ passkeysError }}
        </p>
        <p
          v-if="passkeyRegisterSuccess"
          class="text-sm text-emerald-600 dark:text-emerald-400 mb-2"
          role="status"
        >
          {{ passkeyRegisterSuccess }}
        </p>
        <p
          v-if="passkeyRegisterError"
          class="text-sm text-red-600 mb-2"
          role="alert"
        >
          {{ passkeyRegisterError }}
        </p>
        <div v-if="passkeysLoading" class="text-sm text-fg-subtle py-2 mb-2">
          Loading passkeys…
        </div>
        <div v-else-if="passkeys.length > 0" class="flex flex-col gap-2 mb-4">
          <div
            v-for="p in passkeys"
            :key="p.id"
            class="settings-panel flex items-center justify-between gap-3 rounded-xl p-3"
          >
            <div
              v-if="passkeyEditingLabelId === p.id"
              class="flex min-w-0 flex-1 items-center gap-2"
            >
              <input
                v-model="passkeyEditingLabelValue"
                type="text"
                maxlength="64"
                placeholder="Passkey name"
                class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
                @keyup.enter="confirmRenamePasskey"
                @keyup.escape="cancelRenamePasskey"
              />
              <button
                type="button"
                class="shrink-0 text-xs font-bold text-accent hover:text-foreground uppercase tracking-widest disabled:opacity-40"
                :disabled="passkeyRenamingId === p.id"
                @click="confirmRenamePasskey"
              >
                {{ passkeyRenamingId === p.id ? '…' : 'Save' }}
              </button>
              <button
                type="button"
                class="shrink-0 text-xs font-bold text-muted hover:text-foreground uppercase tracking-widest"
                @click="cancelRenamePasskey"
              >
                Cancel
              </button>
            </div>
            <template v-else>
              <div class="min-w-0 text-xs text-fg-subtle">
                <span class="font-medium text-foreground">{{
                  p.label || 'Passkey'
                }}</span>
                <span class="mx-1">·</span>
                Added {{ formatSessionDate(p.createdAt) }}
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  class="text-xs font-bold text-muted hover:text-foreground uppercase tracking-widest disabled:opacity-40"
                  :disabled="isAccountLocked"
                  @click="startRenamePasskey(p.id, p.label)"
                >
                  Rename
                </button>
                <button
                  type="button"
                  class="text-xs font-bold text-muted hover:text-foreground uppercase tracking-widest disabled:opacity-40"
                  :disabled="passkeyRevokingId === p.id || isAccountLocked"
                  @click="revokePasskey(p.id)"
                >
                  {{ passkeyRevokingId === p.id ? '…' : 'Remove' }}
                </button>
              </div>
            </template>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-3">
            <input
              v-model="passkeyNewLabel"
              type="text"
              maxlength="64"
              placeholder="Label (e.g. MacBook, iPhone)"
              class="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-xs text-foreground placeholder:text-muted outline-none focus:border-accent"
              :disabled="isAccountLocked || passkeyRegisterBusy"
              @keyup.enter="handleAddPasskey"
            />
            <button
              type="button"
              class="settings-action shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider"
              :disabled="isAccountLocked || passkeyRegisterBusy"
              :aria-busy="passkeyRegisterBusy"
              @pointerdown="
                ECHO_PASSKEYS_ENABLED && prefetchPasskeyRegistrationOptions()
              "
              @click="handleAddPasskey"
            >
              {{ passkeyRegisterBusy ? 'Working…' : 'Add passkey' }}
            </button>
          </div>
          <p
            v-if="passkeyRegisterBusy"
            class="text-xs text-fg-subtle"
            role="status"
            aria-live="polite"
          >
            Follow your browser or device prompt to create a passkey…
          </p>
        </div>
      </div>

      <div
        class="settings-card rounded-2xl p-6"
        :class="
          echoSyncCapabilities.isMockDataMode ||
          (authSession.backendUser && !authSession.backendUser.isGuest)
            ? ''
            : 'lg:col-span-2'
        "
      >
        <div class="settings-label mb-4">Account Removal</div>
        <div class="flex flex-col gap-3">
          <p class="text-xs text-muted leading-relaxed">
            <template v-if="echoSyncCapabilities.isMockDataMode">
              Need to leave? You can temporarily disable your account or
              permanently delete it.
            </template>
            <template v-else>
              Sign out on all devices, or permanently delete your Echo account
              and data.
            </template>
          </p>
          <div class="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              class="settings-action rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider"
              @click="openDisableAccountConfirm"
            >
              {{
                echoSyncCapabilities.isMockDataMode
                  ? 'Disable Account'
                  : 'Sign out everywhere'
              }}
            </button>
            <button
              type="button"
              class="danger-btn rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider"
              @click="openDeleteAccountConfirm"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="
        !echoSyncCapabilities.isMockDataMode &&
        !authSession.backendUser?.isGuest
      "
      class="settings-card rounded-2xl p-6"
    >
      <div class="settings-label mb-4">Active Sessions</div>
      <p v-if="sessionsError" class="mb-3 text-sm text-red-600">
        {{ sessionsError }}
      </p>
      <div v-if="sessionsLoading" class="text-sm text-fg-subtle py-4">
        Loading sessions…
      </div>
      <div
        v-else-if="sessions.length === 0"
        class="text-sm text-fg-subtle py-2"
      >
        No active sessions.
      </div>
      <div v-else class="flex flex-col gap-3">
        <div
          v-for="s in sessions"
          :key="s.id"
          class="settings-panel flex items-center justify-between gap-3 p-4 rounded-xl"
        >
          <div class="flex items-center gap-4 min-w-0">
            <div
              class="h-10 w-10 rounded-xl bg-glass-1 flex items-center justify-center shrink-0"
            >
              <svg
                class="w-5 h-5 text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9.75 17L9 20l-1 1h6l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 min-w-0">
                <div class="text-sm font-bold text-foreground truncate">
                  {{ sessionTitle(s) }}
                </div>
                <span
                  v-if="s.isCurrentSession"
                  class="shrink-0 rounded-md bg-glass-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle"
                >
                  This device
                </span>
              </div>
              <div class="text-xs text-fg-subtle mt-0.5 truncate">
                {{ sessionSubtitle(s) }}
              </div>
              <div class="text-xs text-fg-subtle mt-0.5">
                Started {{ formatSessionDate(s.createdAt) }} · expires
                {{ formatSessionDate(s.expiresAt) }}
              </div>
            </div>
          </div>
          <button
            type="button"
            class="shrink-0 text-xs font-bold text-muted hover:text-foreground uppercase tracking-widest disabled:opacity-40"
            :disabled="sessionsRevokingId === s.id"
            @click="revokeSession(s.id)"
          >
            {{ sessionsRevokingId === s.id ? '…' : 'Revoke' }}
          </button>
        </div>
      </div>
    </div>
    <div
      v-else-if="
        !echoSyncCapabilities.isMockDataMode && authSession.backendUser?.isGuest
      "
      class="settings-card rounded-2xl p-6"
    >
      <div class="settings-label mb-4">Active Sessions</div>
      <p class="text-sm text-fg-subtle">
        Session management is available after you upgrade to a full account.
      </p>
    </div>
  </div>
</template>
