<script setup lang="ts">
import { echoT } from '@/i18n';
import { onMounted, ref, toRef } from 'vue';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useSettingsAccountSecurity } from '@/features/settings/composables/useSettingsAccountSecurity';
import { ECHO_PASSKEYS_ENABLED } from '@/config/echoPasskeysEnabled';
import { prefetchPasskeyRegistrationOptions } from '@/features/auth/passkeyWebCeremony';
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
} from '@/features/auth/authSessionDeviceLabel';
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
          {{ echoT('panes.account.dismiss') }}
        </button>
      </div>
    </div>

    <div class="settings-card rounded-2xl p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h4 class="text-lg font-bold text-foreground">
            {{ echoT('panes.account.accountSecurity') }}
          </h4>
          <p class="text-sm text-muted mt-1">
            {{ echoT('panes.account.accountSecurityDesc') }}
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
            {{ echoT('panes.account.reset') }}
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
                ? echoT('panes.account.editAccount')
                : accountSaveBusy
                  ? echoT('panes.account.saving')
                  : echoT('panes.account.saveChanges')
            }}
          </button>
        </div>
      </div>

      <div class="grid gap-6">
        <!-- Email -->
        <div class="flex flex-col gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="settings-label">{{
              echoT('panes.account.emailAddress')
            }}</span>
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
                {{ echoT('panes.account.verified') }}
              </span>
              <span
                v-else-if="!EMAIL_VERIFICATION_DOWNTIME"
                class="echo-status-pill echo-status-pill--warn rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              >
                {{ echoT('panes.account.unverified') }}
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
              {{
                resendEmailBusy
                  ? echoT('panes.account.sending')
                  : echoT('panes.account.resendVerification')
              }}
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
              >{{ echoT('panes.account.edit') }}</span
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
          <span class="settings-label">{{
            echoT('settingsUi.phoneNumber')
          }}</span>
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
              >{{ echoT('panes.account.edit') }}</span
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
          <span class="settings-label">{{
            echoT('settingsUi.phoneNumber')
          }}</span>
          <div
            v-if="isAccountLocked"
            class="settings-panel flex flex-col gap-2 rounded-xl p-4 text-sm text-fg-soft"
          >
            <div
              v-if="authSession.backendUser.phone"
              class="flex flex-wrap items-center gap-2"
            >
              <span class="text-muted">{{
                echoT('panes.account.verified')
              }}</span>
              <span class="font-medium">{{
                authSession.backendUser.phone
              }}</span>
            </div>
            <div
              v-if="authSession.backendUser.pendingPhone"
              class="flex flex-wrap items-center gap-2"
            >
              <span class="text-muted">{{
                echoT('panes.account.pendingVerification')
              }}</span>
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
              {{ echoT('panes.account.noPhone') }}
            </p>
          </div>
          <div v-else class="flex flex-col gap-2">
            <input
              v-model="form.phone"
              class="settings-input"
              type="tel"
              autocomplete="tel"
              :placeholder="echoT('panes.account.phonePlaceholder')"
            />
            <p class="text-xs text-muted leading-relaxed">
              {{ echoT('panes.account.phoneSaveHint') }}
            </p>
          </div>
          <div
            v-if="authSession.backendUser.pendingPhone"
            class="flex flex-col gap-2 rounded-xl border border-border bg-scrim-1 p-4"
          >
            <span class="text-xs font-semibold text-fg-soft">{{
              echoT('panes.account.smsVerification')
            }}</span>
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
                {{
                  phoneSendBusy
                    ? echoT('panes.account.sending')
                    : echoT('panes.account.sendCode')
                }}
              </button>
              <button
                type="button"
                class="rounded-lg bg-glass-1 px-3 py-1.5 text-xs font-semibold hover:bg-glass-2 disabled:opacity-50"
                :disabled="phoneSendBusy || isAccountLocked"
                @click="resendPhoneVerificationCode"
              >
                {{ echoT('panes.account.resend') }}
              </button>
            </div>
            <label class="flex flex-col gap-1.5">
              <span class="text-[11px] font-semibold text-muted">{{
                echoT('panes.account.codeFromSms')
              }}</span>
              <input
                v-model="phoneOtpCode"
                class="settings-input"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                :placeholder="echoT('panes.account.enterCode')"
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
              {{
                phoneOtpBusy ? echoT('settingsUi.verifying') : 'Verify phone'
              }}
            </button>
          </div>
        </div>
        <div v-else class="flex flex-col gap-2">
          <span class="settings-label">{{
            echoT('settingsUi.phoneNumber')
          }}</span>
          <div class="settings-panel rounded-xl p-4 flex flex-col gap-2">
            <div
              v-if="authSession.backendUser?.phone"
              class="flex flex-wrap items-center gap-2 text-sm text-fg-soft"
            >
              <span class="text-muted">{{
                echoT('panes.account.verified')
              }}</span>
              <span class="font-medium">{{
                authSession.backendUser.phone
              }}</span>
            </div>
            <div
              v-if="authSession.backendUser?.pendingPhone"
              class="flex flex-wrap items-center gap-2 text-sm text-fg-soft"
            >
              <span class="text-muted">{{
                echoT('panes.account.pendingVerification')
              }}</span>
              <span class="font-medium">{{
                authSession.backendUser.pendingPhone
              }}</span>
            </div>
            <span class="text-sm text-fg-soft">
              {{ echoT('panes.account.phoneLead') }}
              <span
                class="font-semibold text-[color:var(--vc-settings-accent-fg)]"
                >{{ echoT('panes.account.comingSoon') }}</span
              >{{ echoT('panes.account.phoneTail') }}
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
          <span class="settings-label">{{
            echoT('panes.account.password')
          }}</span>
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
              {{ echoT('panes.account.changePassword') }}
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
          <h4 class="text-xl font-bold text-foreground">
            {{ echoT('panes.account.passwordRequired') }}
          </h4>
          <p class="mt-2 text-sm text-muted leading-6">
            {{ echoT('panes.account.passwordRequiredDesc') }}
          </p>
          <div class="mt-4">
            <input
              v-model="accountPasswordInput"
              type="password"
              :placeholder="echoT('panes.account.enterPassword')"
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
              {{ echoT('panes.account.cancel') }}
            </button>
            <button
              type="submit"
              :disabled="accountPasswordSubmitting"
              class="primary-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {{
                accountPasswordSubmitting
                  ? echoT('settingsUi.verifying')
                  : echoT('panes.account.confirm')
              }}
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
          <h4 class="text-xl font-bold text-foreground">
            {{ echoT('panes.account.changePassword') }}
          </h4>
          <p class="mt-2 text-sm text-muted leading-6">
            {{ echoT('panes.account.changePasswordDesc') }}
          </p>

          <div class="mt-4 flex flex-col gap-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-muted">{{
                echoT('panes.account.currentPassword')
              }}</span>
              <input
                v-model="changePasswordCurrent"
                :type="showChangePasswordCurrentValue ? 'text' : 'password'"
                :placeholder="echoT('panes.account.enterCurrentPassword')"
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
                {{
                  showChangePasswordCurrentValue
                    ? echoT('panes.account.hide')
                    : echoT('panes.account.show')
                }}
              </button>
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-muted">{{
                echoT('panes.account.newPassword')
              }}</span>
              <input
                v-model="changePasswordNew"
                :type="showChangePasswordNewValue ? 'text' : 'password'"
                :placeholder="echoT('panes.account.enterNewPassword')"
                class="settings-input"
              />
              <button
                type="button"
                class="self-end text-[10px] font-bold uppercase tracking-wider text-[color:var(--vc-settings-accent-fg)] hover:text-foreground"
                @click="
                  showChangePasswordNewValue = !showChangePasswordNewValue
                "
              >
                {{
                  showChangePasswordNewValue
                    ? echoT('panes.account.hide')
                    : echoT('panes.account.show')
                }}
              </button>
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-muted">{{
                echoT('panes.account.confirmNewPassword')
              }}</span>
              <input
                v-model="changePasswordConfirm"
                :type="showChangePasswordConfirmValue ? 'text' : 'password'"
                :placeholder="echoT('panes.account.reenterNewPassword')"
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
                {{
                  showChangePasswordConfirmValue
                    ? echoT('panes.account.hide')
                    : echoT('panes.account.show')
                }}
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
              {{ echoT('panes.account.cancel') }}
            </button>
            <button
              type="submit"
              :disabled="changePasswordBusy"
              class="primary-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {{
                changePasswordBusy
                  ? echoT('panes.account.updating')
                  : echoT('panes.account.updatePassword')
              }}
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
          {{ echoT('panes.account.setup2fa') }}
        </h4>
        <h4
          v-else-if="twoFactorStep === 'verify'"
          class="text-xl font-bold text-foreground"
        >
          {{ echoT('panes.account.verify2fa') }}
        </h4>
        <h4
          v-else-if="twoFactorStep === 'recovery'"
          class="text-xl font-bold text-foreground"
        >
          {{ echoT('panes.account.saveRecovery') }}
        </h4>
        <h4 v-else class="text-xl font-bold text-foreground">
          {{ echoT('panes.account.tfaEnabledTitle') }}
        </h4>

        <p
          v-if="twoFactorStep === 'setup'"
          class="mt-2 text-sm text-muted leading-6"
        >
          {{ echoT('panes.account.scanQr') }}
        </p>
        <p
          v-else-if="twoFactorStep === 'verify'"
          class="mt-2 text-sm text-muted leading-6"
        >
          {{ echoT('panes.account.enter6') }}
        </p>
        <p
          v-else-if="twoFactorStep === 'recovery'"
          class="mt-2 text-sm text-muted leading-6"
        >
          {{ echoT('panes.account.recoveryDesc') }}
        </p>
        <p v-else class="mt-2 text-sm text-muted leading-6">
          {{ echoT('panes.account.requires2fa') }}
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
              <span class="text-sm text-muted">{{
                echoT('panes.account.loadingQr')
              }}</span>
            </template>
            <img
              v-else-if="twoFactorQrDataUrl"
              :src="twoFactorQrDataUrl"
              :alt="echoT('panes.account.qrAlt')"
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
              {{ echoT('panes.account.secretKey') }}
            </div>
            <code class="block text-sm text-fg font-mono break-all">
              {{ twoFactorSecret }}
            </code>
            <div
              v-if="echoSyncCapabilities.isMockDataMode"
              class="mt-2 text-xs text-muted"
            >
              {{ echoT('panes.account.demoLead') }}
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
            <span class="text-xs font-semibold text-muted">{{
              echoT('panes.account.verificationCode')
            }}</span>
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
            {{ echoT('panes.account.copyAll') }}
          </button>
        </div>

        <div v-else class="mt-4 flex flex-col gap-3">
          <div
            class="echo-success-banner rounded-xl border border-emerald-400/20 p-4"
          >
            <div class="text-sm font-bold">
              {{ echoT('panes.account.tfaActive') }}
            </div>
            <div class="mt-1 text-xs text-muted">
              {{ echoT('panes.account.tfaManageLater') }}
            </div>
          </div>
        </div>

        <div class="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            @click="closeTwoFactorSetupModal"
            class="settings-action rounded-xl px-4 py-2 text-sm font-medium"
          >
            {{ echoT('panes.account.cancel') }}
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
            {{ echoT('panes.account.continue') }}
          </button>

          <button
            v-else-if="twoFactorStep === 'verify'"
            type="button"
            :disabled="twoFactorSetupBusy"
            @click="verifyTwoFactorCode"
            class="primary-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {{ twoFactorSetupBusy ? echoT('settingsUi.verifying') : 'Verify' }}
          </button>

          <button
            v-else-if="twoFactorStep === 'recovery'"
            type="button"
            @click="closeTwoFactorSetupModal"
            class="success-btn rounded-xl px-4 py-2 text-sm font-semibold"
          >
            {{ echoT('panes.account.done') }}
          </button>

          <button
            v-else
            type="button"
            @click="closeTwoFactorSetupModal"
            class="success-btn rounded-xl px-4 py-2 text-sm font-semibold"
          >
            {{ echoT('panes.account.done') }}
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
          {{ echoT('panes.account.disableTfaTitle') }}
        </h4>
        <p class="mt-2 text-sm text-muted leading-6">
          {{ echoT('panes.account.disableTfaDesc') }}
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
              {{ echoT('panes.account.authenticator') }}
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
              {{ echoT('panes.account.recovery') }}
            </button>
          </div>
          <label class="mt-4 flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-muted">{{
              echoT('panes.account.password')
            }}</span>
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
            <span class="text-xs font-semibold text-muted">{{
              echoT('panes.account.sixDigitCode')
            }}</span>
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
            <span class="text-xs font-semibold text-muted">{{
              echoT('panes.account.recoveryCode')
            }}</span>
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
              {{ echoT('panes.account.cancel') }}
            </button>
            <button
              type="submit"
              :disabled="disableTotpBusy"
              class="danger-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {{
                disableTotpBusy
                  ? echoT('panes.account.working')
                  : echoT('panes.account.disable2fa')
              }}
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
              ? echoT('panes.account.disableAccountQ')
              : echoT('panes.account.signOutEverywhereQ')
          }}
        </h4>
        <p class="mt-2 text-sm text-muted leading-6">
          <template v-if="echoSyncCapabilities.isMockDataMode">
            {{ echoT('panes.account.disableAccountDesc') }}
          </template>
          <template v-else>
            {{ echoT('panes.account.signOutAllDesc') }}
          </template>
        </p>
        <div class="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            :disabled="disableAccountBusy"
            @click="closeDisableAccountConfirm"
            class="settings-action rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {{ echoT('panes.account.cancel') }}
          </button>
          <button
            type="button"
            :disabled="disableAccountBusy"
            @click="onConfirmDisableAccount"
            class="primary-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {{
              disableAccountBusy
                ? echoT('panes.account.working')
                : echoSyncCapabilities.isMockDataMode
                  ? echoT('panes.account.confirmDisable')
                  : echoT('panes.account.signOutEverywhere')
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
          <h4 class="text-xl font-bold text-foreground">
            {{ echoT('panes.account.deleteAccountQ') }}
          </h4>
          <p class="mt-2 text-sm text-muted leading-6">
            {{ echoT('panes.account.deleteAccountDesc') }}
          </p>
          <template v-if="!echoSyncCapabilities.isMockDataMode">
            <label class="mt-4 flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-muted">{{
                echoT('panes.account.confirmWithPassword')
              }}</span>
              <input
                v-model="deleteAccountPassword"
                type="password"
                autocomplete="current-password"
                class="settings-input"
                :placeholder="echoT('panes.account.currentPassword')"
              />
              <span class="text-xs text-muted">
                {{ echoT('panes.account.leaveBlank') }}
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
              {{ echoT('panes.account.cancel') }}
            </button>
            <button
              v-if="echoSyncCapabilities.isMockDataMode"
              type="button"
              :disabled="deleteAccountBusy"
              @click="closeDeleteAccountConfirm"
              class="danger-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {{
                deleteAccountBusy
                  ? echoT('panes.account.deleting')
                  : echoT('panes.account.close')
              }}
            </button>
            <button
              v-else
              type="submit"
              :disabled="deleteAccountBusy"
              class="danger-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {{
                deleteAccountBusy
                  ? echoT('panes.account.deleting')
                  : echoT('panes.account.deleteAccountBtn')
              }}
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
        <h4 class="text-xl font-bold text-foreground">
          {{ echoT('panes.account.resetAccountQ') }}
        </h4>
        <p class="mt-2 text-sm text-muted leading-6">
          {{ echoT('panes.account.resetAccountDesc') }}
        </p>
        <div class="mt-6 flex items-center justify-end gap-3">
          <button
            @click="showAccountResetConfirm = false"
            class="settings-action rounded-xl px-4 py-2 text-sm font-medium"
          >
            {{ echoT('panes.account.cancel') }}
          </button>
          <button
            @click="confirmAccountReset"
            class="danger-btn rounded-xl px-4 py-2 text-sm font-semibold"
          >
            {{ echoT('panes.account.confirmReset') }}
          </button>
        </div>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <div
        v-if="TWO_FACTOR_AUTH_COMING_SOON"
        class="settings-card rounded-2xl p-6"
      >
        <div class="settings-label mb-4">{{ echoT('settingsUi.mfa') }}</div>
        <div
          class="settings-panel rounded-xl p-5 border border-indigo-500/10 bg-indigo-500/5"
        >
          <p
            class="mb-4 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-3 text-sm text-foreground"
          >
            {{ echoT('panes.account.tfaLead') }}
            <span
              class="font-semibold text-[color:var(--vc-settings-accent-fg)]"
              >{{ echoT('panes.account.comingSoon') }}</span
            >{{ echoT('panes.account.phoneTail') }}
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
                {{ echoT('panes.account.tfaTitle') }}
              </div>
              <p class="text-xs text-muted mt-1 leading-relaxed">
                {{ echoT('panes.account.tfaRequireDesc') }}
              </p>
              <span
                v-if="authSession.backendUser?.totpEnabled"
                class="mt-4 inline-block text-xs font-bold uppercase tracking-widest text-[color:var(--set-positive-label-fg)]"
                >{{ echoT('panes.account.tfaEnabled') }}</span
              >
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="echoSyncCapabilities.isMockDataMode"
        class="settings-card rounded-2xl p-6"
      >
        <div class="settings-label mb-4">{{ echoT('settingsUi.mfa') }}</div>
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
                {{ echoT('panes.account.tfaTitle') }}
              </div>
              <p class="text-xs text-muted mt-1 leading-relaxed">
                {{ echoT('panes.account.tfaProtectDesc') }}
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
                {{ echoT('panes.account.enable2fa') }}
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
        <div class="settings-label mb-4">{{ echoT('settingsUi.mfa') }}</div>
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
                {{ echoT('panes.account.tfaTitle') }}
              </div>
              <p class="text-xs text-muted mt-1 leading-relaxed">
                {{ echoT('panes.account.tfaRequireDesc') }}
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
                  {{ echoT('panes.account.enable2fa') }}
                </button>
              </div>
              <div v-else class="mt-4 flex flex-wrap gap-3">
                <span
                  class="text-xs font-bold uppercase tracking-widest text-[color:var(--set-positive-label-fg)]"
                  >{{ echoT('panes.account.tfaEnabled') }}</span
                >
                <button
                  type="button"
                  class="text-xs font-bold uppercase tracking-widest text-red-600 hover:text-red-700 disabled:opacity-40"
                  :disabled="isAccountLocked"
                  @click="openTwoFactorDisableModal"
                >
                  {{ echoT('panes.account.disable') }}
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
        <div class="settings-label mb-4">
          {{ echoT('panes.account.passkeys') }}
        </div>
        <p class="text-xs text-muted leading-relaxed mb-3">
          {{ echoT('panes.account.passkeysDesc') }}
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
          {{ echoT('panes.account.loadingPasskeys') }}
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
                :placeholder="echoT('panes.account.passkeyName')"
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
                {{
                  passkeyRenamingId === p.id ? '…' : echoT('panes.account.save')
                }}
              </button>
              <button
                type="button"
                class="shrink-0 text-xs font-bold text-muted hover:text-foreground uppercase tracking-widest"
                @click="cancelRenamePasskey"
              >
                {{ echoT('panes.account.cancel') }}
              </button>
            </div>
            <template v-else>
              <div class="min-w-0 text-xs text-fg-subtle">
                <span class="font-medium text-foreground">{{
                  p.label || echoT('panes.account.passkeyDefault')
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
                  {{ echoT('panes.account.rename') }}
                </button>
                <button
                  type="button"
                  class="text-xs font-bold text-muted hover:text-foreground uppercase tracking-widest disabled:opacity-40"
                  :disabled="passkeyRevokingId === p.id || isAccountLocked"
                  @click="revokePasskey(p.id)"
                >
                  {{
                    passkeyRevokingId === p.id
                      ? '…'
                      : echoT('panes.account.remove')
                  }}
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
              :placeholder="echoT('panes.account.passkeyLabelPlaceholder')"
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
              {{
                passkeyRegisterBusy
                  ? echoT('panes.account.working')
                  : echoT('panes.account.addPasskey')
              }}
            </button>
          </div>
          <p
            v-if="passkeyRegisterBusy"
            class="text-xs text-fg-subtle"
            role="status"
            aria-live="polite"
          >
            {{ echoT('panes.account.passkeyPrompt') }}
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
        <div class="settings-label mb-4">
          {{ echoT('panes.account.accountRemoval') }}
        </div>
        <div class="flex flex-col gap-3">
          <p class="text-xs text-muted leading-relaxed">
            <template v-if="echoSyncCapabilities.isMockDataMode">
              {{ echoT('panes.account.removalMock') }}
            </template>
            <template v-else>
              {{ echoT('panes.account.removalReal') }}
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
                  ? echoT('panes.account.disableAccount')
                  : echoT('panes.account.signOutEverywhere')
              }}
            </button>
            <button
              type="button"
              class="danger-btn rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider"
              @click="openDeleteAccountConfirm"
            >
              {{ echoT('panes.account.deleteAccount') }}
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
      <div class="settings-label mb-4">
        {{ echoT('panes.account.activeSessions') }}
      </div>
      <p v-if="sessionsError" class="mb-3 text-sm text-red-600">
        {{ sessionsError }}
      </p>
      <div v-if="sessionsLoading" class="text-sm text-fg-subtle py-4">
        {{ echoT('panes.account.loadingSessions') }}
      </div>
      <div
        v-else-if="sessions.length === 0"
        class="text-sm text-fg-subtle py-2"
      >
        {{ echoT('panes.account.noSessions') }}
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
                  {{ echoT('panes.account.thisDevice') }}
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
            {{
              sessionsRevokingId === s.id ? '…' : echoT('panes.account.revoke')
            }}
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
      <div class="settings-label mb-4">
        {{ echoT('panes.account.activeSessions') }}
      </div>
      <p class="text-sm text-fg-subtle">
        {{ echoT('panes.account.sessionsGuest') }}
      </p>
    </div>
  </div>
</template>
