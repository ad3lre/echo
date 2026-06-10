import { ref, type Ref } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  AuthApiError,
  authPatchMe,
  authDeleteAccount,
  authResendVerification,
  authPhoneSendCode,
  authPhoneResendCode,
  authPhoneVerify,
} from '@/api/authClient';
import { useAuthSessionStore } from '@/stores/authSession';
import { mapPhoneApiError } from '@/features/settings/utils/authErrorMapper';
import { dispatchAppToastDetail } from '@/utils/controllerMissingAction';
import {
  EMAIL_VERIFICATION_DOWNTIME,
  EMAIL_VERIFICATION_DOWNTIME_TOAST,
} from '@/config/emailVerificationDowntime';

type UserLike =
  | {
      id: string;
    }
  | null
  | undefined;

type SettingsFormLike = {
  email: string;
  phone: string;
};

export function useAccountActions(
  form: SettingsFormLike,
  currentUser: Ref<UserLike>,
  isAccountLocked: Ref<boolean>,
  phoneBaseline: Ref<string>,
  autoOpenEmailEditorAfterUnlock: Ref<boolean>,
  showAccountPasswordPrompt: Ref<boolean>,
  accountPasswordInput: Ref<string>,
  accountPasswordError: Ref<string | null>,
  isEditingEmail = ref(false),
  isEditingPhone = ref(false),
) {
  const authSession = useAuthSessionStore();

  const accountSaveError = ref<string | null>(null);
  const accountSaveBusy = ref(false);
  const accountGuestNotice = ref<string | null>(null);

  const showDisableAccountConfirm = ref(false);
  const showDeleteAccountConfirm = ref(false);
  const deleteAccountPassword = ref('');
  const deleteAccountError = ref<string | null>(null);
  const deleteAccountBusy = ref(false);
  const disableAccountBusy = ref(false);
  const showAccountResetConfirm = ref(false);

  const phoneOtpCode = ref('');
  const phoneOtpError = ref<string | null>(null);
  const phoneOtpBusy = ref(false);
  const phoneSendBusy = ref(false);

  const resendEmailBusy = ref(false);
  const resendEmailMessage = ref<string | null>(null);
  const resendEmailError = ref<string | null>(null);

  function onAccountFormHydratedFromAuth() {
    phoneBaseline.value = '';
    phoneOtpCode.value = '';
    phoneOtpError.value = null;
    resendEmailMessage.value = null;
    resendEmailError.value = null;
  }

  async function saveAccountAndLock() {
    accountSaveError.value = null;
    const auth = authSession.backendUser;

    if (
      echoSyncCapabilities.isMockDataMode ||
      !authSession.isAuthenticated ||
      !auth
    ) {
      isAccountLocked.value = true;
      isEditingEmail.value = false;
      isEditingPhone.value = false;
      return;
    }

    if (auth.isGuest) {
      isAccountLocked.value = true;
      isEditingEmail.value = false;
      isEditingPhone.value = false;
      return;
    }

    const nextEmail = form.email.trim();
    const prevEmail = (auth.email ?? '').trim();
    if (nextEmail !== prevEmail) {
      accountSaveBusy.value = true;
      try {
        const { user } = await authPatchMe({ email: nextEmail });
        authSession.applyRestoredProfile(user);
        form.email = user.email?.trim() || nextEmail;
      } catch (e) {
        accountSaveError.value =
          e instanceof AuthApiError
            ? e.message
            : 'Could not update email. Try again.';
        return;
      } finally {
        accountSaveBusy.value = false;
      }
    }

    const nextPhone = form.phone.trim();
    const basePhone = phoneBaseline.value.trim();
    if (nextPhone !== basePhone) {
      accountSaveBusy.value = true;
      try {
        const { user } = await authPatchMe({
          phone: nextPhone === '' ? null : nextPhone,
        });
        authSession.applyRestoredProfile(user);
        form.phone = '';
        phoneBaseline.value = '';
      } catch (e) {
        accountSaveError.value =
          e instanceof AuthApiError
            ? e.message
            : 'Could not update phone. Try again.';
        return;
      } finally {
        accountSaveBusy.value = false;
      }
    }

    isAccountLocked.value = true;
    isEditingEmail.value = false;
    isEditingPhone.value = false;
    phoneBaseline.value = form.phone.trim();
  }

  function handleEditAccountClick() {
    accountGuestNotice.value = null;
    accountSaveError.value = null;
    if (isAccountLocked.value) {
      if (
        authSession.backendUser?.isGuest &&
        !echoSyncCapabilities.isMockDataMode
      ) {
        accountGuestNotice.value =
          'Guest accounts cannot change email or password here. Upgrade to a full account to manage sign-in.';
        return;
      }
      showAccountPasswordPrompt.value = true;
      accountPasswordInput.value = '';
      accountPasswordError.value = null;
      return;
    }
    void saveAccountAndLock();
  }

  async function resendEmailVerification() {
    if (resendEmailBusy.value) return;
    resendEmailMessage.value = null;
    resendEmailError.value = null;
    if (!authSession.isAuthenticated || echoSyncCapabilities.isMockDataMode)
      return;
    if (EMAIL_VERIFICATION_DOWNTIME) {
      dispatchAppToastDetail(EMAIL_VERIFICATION_DOWNTIME_TOAST);
      return;
    }
    resendEmailBusy.value = true;
    try {
      await authResendVerification();
      resendEmailMessage.value = 'Verification email sent. Check your inbox.';
    } catch (e) {
      if (
        e instanceof AuthApiError &&
        e.body.code === 'VERIFICATION_EMAIL_COOLDOWN'
      ) {
        resendEmailError.value = 'Please wait before requesting another email.';
      } else if (
        e instanceof AuthApiError &&
        e.body.code === 'ALREADY_VERIFIED'
      ) {
        resendEmailError.value = 'Email is already verified.';
      } else {
        resendEmailError.value =
          e instanceof AuthApiError
            ? e.message
            : 'Could not send verification email.';
      }
    } finally {
      resendEmailBusy.value = false;
    }
  }

  async function sendPhoneVerificationCode() {
    if (phoneSendBusy.value) return;
    phoneOtpError.value = null;
    if (!authSession.isAuthenticated || echoSyncCapabilities.isMockDataMode)
      return;
    phoneSendBusy.value = true;
    try {
      await authPhoneSendCode();
    } catch (e) {
      phoneOtpError.value = mapPhoneApiError(e);
    } finally {
      phoneSendBusy.value = false;
    }
  }

  async function resendPhoneVerificationCode() {
    if (phoneSendBusy.value) return;
    phoneOtpError.value = null;
    if (!authSession.isAuthenticated || echoSyncCapabilities.isMockDataMode)
      return;
    phoneSendBusy.value = true;
    try {
      await authPhoneResendCode();
    } catch (e) {
      phoneOtpError.value = mapPhoneApiError(e);
    } finally {
      phoneSendBusy.value = false;
    }
  }

  async function submitPhoneVerification() {
    phoneOtpError.value = null;
    if (!authSession.isAuthenticated || echoSyncCapabilities.isMockDataMode)
      return;
    const code = phoneOtpCode.value.trim();
    if (!code) {
      phoneOtpError.value = 'Enter the code from your SMS message.';
      return;
    }
    phoneOtpBusy.value = true;
    try {
      const { user } = await authPhoneVerify(code);
      authSession.applyRestoredProfile(user);
      phoneOtpCode.value = '';
    } catch (e) {
      phoneOtpError.value = mapPhoneApiError(e);
    } finally {
      phoneOtpBusy.value = false;
    }
  }

  function openDisableAccountConfirm() {
    showDisableAccountConfirm.value = true;
  }
  function closeDisableAccountConfirm() {
    showDisableAccountConfirm.value = false;
  }
  function openDeleteAccountConfirm() {
    deleteAccountError.value = null;
    deleteAccountPassword.value = '';
    showDeleteAccountConfirm.value = true;
  }
  function closeDeleteAccountConfirm() {
    showDeleteAccountConfirm.value = false;
  }

  async function confirmDisableAccount(): Promise<boolean> {
    showDisableAccountConfirm.value = false;
    if (echoSyncCapabilities.isMockDataMode) return false;
    if (!authSession.isAuthenticated) return false;
    disableAccountBusy.value = true;
    try {
      await authSession.logoutEverywhere();
      return true;
    } finally {
      disableAccountBusy.value = false;
    }
  }

  async function confirmDeleteAccount(): Promise<boolean> {
    deleteAccountError.value = null;
    if (echoSyncCapabilities.isMockDataMode) {
      showDeleteAccountConfirm.value = false;
      return false;
    }
    if (!authSession.isAuthenticated) return false;
    // Password is optional: guest / Discord-OAuth accounts have none and delete
    // via their session. Accounts with a password are enforced server-side.
    const pw = deleteAccountPassword.value.trim();
    deleteAccountBusy.value = true;
    try {
      await authDeleteAccount(pw || undefined);
      showDeleteAccountConfirm.value = false;
      authSession.clearLocalTokens();
      return true;
    } catch (e) {
      if (e instanceof AuthApiError && e.body?.code === 'PASSWORD_REQUIRED') {
        deleteAccountError.value =
          'Enter your password to delete your account.';
      } else if (
        e instanceof AuthApiError &&
        e.body?.code === 'INVALID_CREDENTIALS'
      ) {
        deleteAccountError.value = 'Incorrect password.';
      } else {
        deleteAccountError.value =
          e instanceof Error ? e.message : 'Could not delete account.';
      }
      return false;
    } finally {
      deleteAccountBusy.value = false;
    }
  }

  function handleAccountReset() {
    showAccountResetConfirm.value = true;
  }
  function confirmAccountReset() {
    const auth = authSession.backendUser;
    if (auth) {
      form.email = auth.email?.trim() || `${auth.username}@echo.local`;
      form.phone = '';
    } else {
      form.email = `${currentUser.value?.id ?? 'echo-user'}@echo.local`;
      form.phone = '(555) 010-1221';
    }
    phoneBaseline.value = '';
    showAccountResetConfirm.value = false;
    isAccountLocked.value = true;
    isEditingEmail.value = false;
    isEditingPhone.value = false;
    accountSaveError.value = null;
  }
  function toggleEditEmail() {
    if (isAccountLocked.value) return;
    isEditingEmail.value = !isEditingEmail.value;
  }
  function toggleEditPhone() {
    if (isAccountLocked.value) return;
    isEditingPhone.value = !isEditingPhone.value;
  }

  function startChangeEmailFromBanner() {
    if (echoSyncCapabilities.isMockDataMode) return;
    autoOpenEmailEditorAfterUnlock.value = true;
    handleEditAccountClick();
  }

  function maskEmail(email: string) {
    if (!email || !email.includes('@')) return '••••@••••.•••';
    const [user, domain] = email.split('@');
    if (!user || !domain) return '••••@••••.•••';
    if (user.length <= 2) return `••@${domain}`;
    return `${user.slice(0, 2)}••••@${domain}`;
  }

  function maskPhone(phone: string) {
    if (!phone?.trim()) return 'Not set';
    return `•••• •••• ${phone.trim().slice(-4)}`;
  }

  function dismissGuestNotice() {
    accountGuestNotice.value = null;
  }

  return {
    isEditingEmail,
    isEditingPhone,
    accountSaveError,
    accountSaveBusy,
    accountGuestNotice,
    showDisableAccountConfirm,
    showDeleteAccountConfirm,
    deleteAccountPassword,
    deleteAccountError,
    deleteAccountBusy,
    disableAccountBusy,
    showAccountResetConfirm,
    phoneOtpCode,
    phoneOtpError,
    phoneOtpBusy,
    phoneSendBusy,
    resendEmailBusy,
    resendEmailMessage,
    resendEmailError,
    onAccountFormHydratedFromAuth,
    saveAccountAndLock,
    handleEditAccountClick,
    resendEmailVerification,
    sendPhoneVerificationCode,
    resendPhoneVerificationCode,
    submitPhoneVerification,
    openDisableAccountConfirm,
    closeDisableAccountConfirm,
    confirmDisableAccount,
    openDeleteAccountConfirm,
    closeDeleteAccountConfirm,
    confirmDeleteAccount,
    handleAccountReset,
    confirmAccountReset,
    toggleEditEmail,
    toggleEditPhone,
    startChangeEmailFromBanner,
    maskEmail,
    maskPhone,
    dismissGuestNotice,
  };
}
