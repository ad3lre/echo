import { ref, type Ref } from 'vue';
import { useAccountLock } from './useAccountLock';
import { useTwoFactorAuth } from './useTwoFactorAuth';
import { usePasswordManagement } from './usePasswordManagement';
import { useSessionManager } from './useSessionManager';
import { usePasskeyCredentials } from './usePasskeyCredentials';
import { useAccountActions } from './useAccountActions';

type UserLike =
  | {
      id: string;
      username: string;
      twoFactorEnabled?: boolean;
    }
  | null
  | undefined;

type SettingsFormLike = {
  email: string;
  phone: string;
  twoFactorEnabled: boolean;
};

export function useSettingsAccountSecurity(
  form: SettingsFormLike,
  currentUser: Ref<UserLike>,
) {
  const { isAccountLocked, autoOpenEmailEditorAfterUnlock } = useAccountLock();
  const phoneBaseline = ref('');
  const isEditingEmail = ref(false);
  const isEditingPhone = ref(false);

  const sessionManager = useSessionManager();
  const passkeyCredentials = usePasskeyCredentials();
  const twoFactorAuth = useTwoFactorAuth(form, currentUser, isAccountLocked);

  const passwordManagement = usePasswordManagement(
    form,
    currentUser,
    isAccountLocked,
    phoneBaseline,
    autoOpenEmailEditorAfterUnlock,
    isEditingEmail,
    isEditingPhone,
  );

  const accountActions = useAccountActions(
    form,
    currentUser,
    isAccountLocked,
    phoneBaseline,
    autoOpenEmailEditorAfterUnlock,
    passwordManagement.showAccountPasswordPrompt,
    passwordManagement.accountPasswordInput,
    passwordManagement.accountPasswordError,
    isEditingEmail,
    isEditingPhone,
  );

  return {
    isAccountLocked,
    ...sessionManager,
    ...passkeyCredentials,
    ...twoFactorAuth,
    ...passwordManagement,
    ...accountActions,
  };
}
