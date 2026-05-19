import { ref, type Ref } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  AuthApiError,
  authVerifyPassword,
  authChangePassword,
} from '@/api/authClient';
import { useAuthSessionStore } from '@/stores/authSession';

type UserLike =
  | {
      id: string;
      username: string;
    }
  | null
  | undefined;

type SettingsFormLike = {
  phone: string;
};

export function usePasswordManagement(
  form: SettingsFormLike,
  currentUser: Ref<UserLike>,
  isAccountLocked: Ref<boolean>,
  phoneBaseline: Ref<string>,
  autoOpenEmailEditorAfterUnlock: Ref<boolean>,
  isEditingEmail: Ref<boolean>,
  isEditingPhone: Ref<boolean>,
) {
  const authSession = useAuthSessionStore();

  const showChangePasswordModal = ref(false);
  const changePasswordCurrent = ref('');
  const changePasswordNew = ref('');
  const changePasswordConfirm = ref('');
  const changePasswordError = ref<string | null>(null);
  const changePasswordBusy = ref(false);
  const showChangePasswordCurrentValue = ref(false);
  const showChangePasswordNewValue = ref(false);
  const showChangePasswordConfirmValue = ref(false);

  const showAccountPasswordPrompt = ref(false);
  const accountPasswordInput = ref('');
  const accountPasswordError = ref<string | null>(null);
  const accountPasswordSubmitting = ref(false);

  function openChangePasswordModal() {
    if (isAccountLocked.value) return;
    showChangePasswordModal.value = true;
    changePasswordCurrent.value = '';
    changePasswordNew.value = '';
    changePasswordConfirm.value = '';
    changePasswordError.value = null;
    showChangePasswordCurrentValue.value = false;
    showChangePasswordNewValue.value = false;
    showChangePasswordConfirmValue.value = false;
  }

  function closeChangePasswordModal() {
    showChangePasswordModal.value = false;
    changePasswordError.value = null;
    showChangePasswordCurrentValue.value = false;
    showChangePasswordNewValue.value = false;
    showChangePasswordConfirmValue.value = false;
  }

  async function submitChangePassword() {
    changePasswordError.value = null;
    if (!changePasswordCurrent.value.trim()) {
      changePasswordError.value = 'Please enter your current password.';
      return;
    }
    if (!changePasswordNew.value.trim()) {
      changePasswordError.value = 'Please enter a new password.';
      return;
    }
    if (changePasswordNew.value.length < 8) {
      changePasswordError.value = 'New password must be at least 8 characters.';
      return;
    }
    if (changePasswordNew.value !== changePasswordConfirm.value) {
      changePasswordError.value = 'New passwords do not match.';
      return;
    }

    if (!authSession.isAuthenticated || echoSyncCapabilities.isMockDataMode) {
      closeChangePasswordModal();
      return;
    }

    changePasswordBusy.value = true;
    try {
      await authChangePassword({
        currentPassword: changePasswordCurrent.value,
        newPassword: changePasswordNew.value,
      });
      closeChangePasswordModal();
      authSession.invalidateSessionForReauth(
        'Your password was changed. Sign in again with your new password.',
      );
    } catch (e) {
      changePasswordError.value =
        e instanceof AuthApiError && e.body?.code === 'INVALID_CREDENTIALS'
          ? 'Current password is incorrect.'
          : e instanceof Error
            ? e.message
            : 'Could not change password.';
    } finally {
      changePasswordBusy.value = false;
    }
  }

  function closeAccountPasswordPrompt() {
    showAccountPasswordPrompt.value = false;
    accountPasswordInput.value = '';
    accountPasswordError.value = null;
    accountPasswordSubmitting.value = false;
    if (isAccountLocked.value) {
      autoOpenEmailEditorAfterUnlock.value = false;
    }
  }

  async function confirmAccountUnlock() {
    accountPasswordError.value = null;
    const pw = accountPasswordInput.value.trim();
    if (!pw.length) return;

    if (
      authSession.backendUser &&
      authSession.isAuthenticated &&
      !echoSyncCapabilities.isMockDataMode
    ) {
      accountPasswordSubmitting.value = true;
      try {
        await authVerifyPassword(pw);
      } catch (e) {
        accountPasswordError.value =
          e instanceof AuthApiError &&
          (e.status === 401 || e.body?.code === 'INVALID_CREDENTIALS')
            ? 'Incorrect password.'
            : 'Could not verify password. Try again.';
        return;
      } finally {
        accountPasswordSubmitting.value = false;
      }
    }

    const shouldOpenEmail = autoOpenEmailEditorAfterUnlock.value;
    autoOpenEmailEditorAfterUnlock.value = false;

    phoneBaseline.value = form.phone.trim();
    isAccountLocked.value = false;
    closeAccountPasswordPrompt();
    if (shouldOpenEmail) {
      isEditingEmail.value = true;
      isEditingPhone.value = false;
    }
  }

  return {
    showChangePasswordModal,
    changePasswordCurrent,
    changePasswordNew,
    changePasswordConfirm,
    changePasswordError,
    changePasswordBusy,
    showChangePasswordCurrentValue,
    showChangePasswordNewValue,
    showChangePasswordConfirmValue,
    showAccountPasswordPrompt,
    accountPasswordInput,
    accountPasswordError,
    accountPasswordSubmitting,
    openChangePasswordModal,
    closeChangePasswordModal,
    submitChangePassword,
    closeAccountPasswordPrompt,
    confirmAccountUnlock,
  };
}
