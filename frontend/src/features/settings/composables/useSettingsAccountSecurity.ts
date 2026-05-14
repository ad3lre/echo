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

  const sessionManager = useSessionManager();
  const passkeyCredentials = usePasskeyCredentials();
  const twoFactorAuth = useTwoFactorAuth(
    form,
    currentUser as any,
    isAccountLocked,
  );

  const passwordManagement = usePasswordManagement(
    form,
    currentUser as any,
    isAccountLocked,
    phoneBaseline,
    autoOpenEmailEditorAfterUnlock,
    ref(false), // placeholder for isEditingEmail, will be synced below
    ref(false), // placeholder for isEditingPhone, will be synced below
  );

  const accountActions = useAccountActions(
    form,
    currentUser as any,
    isAccountLocked,
    phoneBaseline,
    autoOpenEmailEditorAfterUnlock,
    passwordManagement.showAccountPasswordPrompt,
    passwordManagement.accountPasswordInput,
    passwordManagement.accountPasswordError,
  );

  // Sync the refs that were placeholders
  (passwordManagement as any).isEditingEmail = accountActions.isEditingEmail;
  (passwordManagement as any).isEditingPhone = accountActions.isEditingPhone;

  return {
    isAccountLocked,
    ...sessionManager,
    ...passkeyCredentials,
    ...twoFactorAuth,
    ...passwordManagement,
    ...accountActions,
  };
}
