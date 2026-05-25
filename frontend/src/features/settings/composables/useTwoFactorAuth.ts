import { ref, type Ref } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  AuthApiError,
  authTotpBegin,
  authTotpConfirm,
  authTotpDisable,
  authFetchMe,
  authPasskeyRegisterOptions,
  authPasskeyRegisterVerify,
} from '@/api/authClient';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  useTwoFactorQr,
  generateBase32Secret,
} from '@/features/settings/composables/useTwoFactorQr';
import { totpQrDataUrl } from '@/utils/totpQrDataUrl';
import { copyToClipboard } from '@/utils/copyToClipboard';
import { ECHO_PASSKEYS_ENABLED } from '@/config/echoPasskeysEnabled';

type TwoFactorStep = 'setup' | 'verify' | 'recovery' | 'done';

type UserLike =
  | {
      id: string;
      twoFactorEnabled?: boolean;
    }
  | null
  | undefined;

type SettingsFormLike = {
  twoFactorEnabled: boolean;
};

export function useTwoFactorAuth(
  form: SettingsFormLike,
  currentUser: Ref<UserLike>,
  isAccountLocked: Ref<boolean>,
) {
  const authSession = useAuthSessionStore();

  const showTwoFactorSetupModal = ref(false);
  const twoFactorStep = ref<TwoFactorStep>('setup');
  const twoFactorSecret = ref('');
  const twoFactorCode = ref('');
  const twoFactorError = ref<string | null>(null);
  const twoFactorExpectedCode = ref('123456');
  const twoFactorQrDataUrl = ref('');
  const twoFactorSetupBusy = ref(false);
  const twoFactorRecoveryCodes = ref<string[]>([]);

  const showTwoFactorDisableModal = ref(false);
  const disableTotpPassword = ref('');
  const disableTotpCode = ref('');
  const disableTotpRecoveryCode = ref('');
  const disableTotpFactor = ref<'totp' | 'recovery'>('totp');
  const disableTotpError = ref<string | null>(null);
  const disableTotpBusy = ref(false);

  const passkeyRegisterBusy = ref(false);
  const passkeyRegisterError = ref<string | null>(null);

  const { twoFactorQrRects } = useTwoFactorQr(twoFactorSecret);

  function openTwoFactorSetupModal() {
    if (isAccountLocked.value) return;
    twoFactorError.value = null;
    twoFactorRecoveryCodes.value = [];
    twoFactorQrDataUrl.value = '';

    if (echoSyncCapabilities.isMockDataMode) {
      showTwoFactorSetupModal.value = true;
      twoFactorStep.value = 'setup';
      twoFactorSecret.value = generateBase32Secret();
      twoFactorCode.value = '';
      twoFactorExpectedCode.value = '123456';
      return;
    }

    if (!authSession.isAuthenticated) return;
    twoFactorSetupBusy.value = true;
    void (async () => {
      try {
        const { secretBase32, otpauthUrl } = await authTotpBegin();
        twoFactorSecret.value = secretBase32;
        twoFactorQrDataUrl.value = await totpQrDataUrl(otpauthUrl);
        twoFactorCode.value = '';
        twoFactorStep.value = 'setup';
        showTwoFactorSetupModal.value = true;
      } catch (e) {
        if (e instanceof AuthApiError && e.body.code === 'NOT_AVAILABLE') {
          twoFactorError.value =
            'Two-factor setup needs a database-backed server.';
        } else if (
          e instanceof AuthApiError &&
          e.body.code === 'TOTP_ALREADY_ENABLED'
        ) {
          twoFactorError.value = 'Authenticator is already enabled.';
        } else {
          twoFactorError.value =
            e instanceof AuthApiError
              ? e.message
              : 'Could not start two-factor setup.';
        }
        showTwoFactorSetupModal.value = true;
        twoFactorStep.value = 'setup';
      } finally {
        twoFactorSetupBusy.value = false;
      }
    })();
  }

  function closeTwoFactorSetupModal() {
    showTwoFactorSetupModal.value = false;
    twoFactorStep.value = 'setup';
    twoFactorCode.value = '';
    twoFactorError.value = null;
    twoFactorQrDataUrl.value = '';
    twoFactorRecoveryCodes.value = [];
    if (!echoSyncCapabilities.isMockDataMode) {
      twoFactorSecret.value = '';
    }
  }

  async function verifyTwoFactorCode() {
    twoFactorError.value = null;
    const code = twoFactorCode.value.trim();

    if (echoSyncCapabilities.isMockDataMode) {
      if (!/^\d{6}$/.test(code)) {
        twoFactorError.value = 'Enter a 6-digit code.';
        return;
      }
      if (code !== twoFactorExpectedCode.value) {
        twoFactorError.value = 'Invalid code. (Demo: use 123456.)';
        return;
      }
      form.twoFactorEnabled = true;
      if (currentUser.value)
        (currentUser.value as { twoFactorEnabled?: boolean }).twoFactorEnabled =
          true;
      twoFactorStep.value = 'done';
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      twoFactorError.value = 'Enter a 6-digit code.';
      return;
    }

    if (!authSession.isAuthenticated) return;

    twoFactorSetupBusy.value = true;
    try {
      const { recoveryCodes } = await authTotpConfirm(code);
      twoFactorRecoveryCodes.value = recoveryCodes;
      const { user } = await authFetchMe();
      authSession.applyRestoredProfile(user);
      form.twoFactorEnabled = !!user.totpEnabled;
      if (currentUser.value)
        (currentUser.value as { twoFactorEnabled?: boolean }).twoFactorEnabled =
          !!user.totpEnabled;
      twoFactorStep.value = 'recovery';
    } catch (e) {
      if (e instanceof AuthApiError && e.body.code === 'INVALID_TOTP') {
        twoFactorError.value =
          'That code is not valid. Check the time on your device.';
      } else {
        twoFactorError.value =
          e instanceof AuthApiError ? e.message : 'Could not verify the code.';
      }
    } finally {
      twoFactorSetupBusy.value = false;
    }
  }

  function openTwoFactorDisableModal() {
    if (isAccountLocked.value) return;
    disableTotpPassword.value = '';
    disableTotpCode.value = '';
    disableTotpRecoveryCode.value = '';
    disableTotpFactor.value = 'totp';
    disableTotpError.value = null;
    showTwoFactorDisableModal.value = true;
  }

  function closeTwoFactorDisableModal() {
    showTwoFactorDisableModal.value = false;
    disableTotpError.value = null;
  }

  async function submitDisableTotp() {
    disableTotpError.value = null;
    const pw = disableTotpPassword.value.trim();
    if (!pw) {
      disableTotpError.value = 'Enter your password.';
      return;
    }
    const useTotp = disableTotpFactor.value === 'totp';
    const code = disableTotpCode.value.trim();
    const recoveryCode = disableTotpRecoveryCode.value.trim();
    if (useTotp && !/^\d{6}$/.test(code)) {
      disableTotpError.value = 'Enter your 6-digit authenticator code.';
      return;
    }
    if (!useTotp && !recoveryCode) {
      disableTotpError.value = 'Enter a recovery code.';
      return;
    }

    if (!authSession.isAuthenticated) return;

    disableTotpBusy.value = true;
    try {
      const { user } = await authTotpDisable(
        useTotp ? { password: pw, code } : { password: pw, recoveryCode },
      );
      authSession.applyRestoredProfile(user);
      form.twoFactorEnabled = !!user.totpEnabled;
      if (currentUser.value)
        (currentUser.value as { twoFactorEnabled?: boolean }).twoFactorEnabled =
          !!user.totpEnabled;
      closeTwoFactorDisableModal();
    } catch (e) {
      if (e instanceof AuthApiError && e.body.code === 'INVALID_CREDENTIALS') {
        disableTotpError.value = 'Password is incorrect.';
      } else if (
        e instanceof AuthApiError &&
        e.body.code === 'INVALID_SECOND_FACTOR'
      ) {
        disableTotpError.value = 'Authenticator or recovery code is not valid.';
      } else {
        disableTotpError.value =
          e instanceof AuthApiError
            ? e.message
            : 'Could not disable two-factor authentication.';
      }
    } finally {
      disableTotpBusy.value = false;
    }
  }

  async function copyRecoveryCodes() {
    const text = twoFactorRecoveryCodes.value.join('\n');
    await copyToClipboard(text);
  }

  async function registerPasskey(label?: string) {
    if (!ECHO_PASSKEYS_ENABLED) {
      passkeyRegisterError.value = 'Passkeys are disabled for this deployment.';
      return;
    }
    if (echoSyncCapabilities.isMockDataMode) {
      passkeyRegisterError.value = 'Not available in preview mode.';
      return;
    }
    passkeyRegisterBusy.value = true;
    passkeyRegisterError.value = null;
    try {
      const { startRegistration } = await import('@simplewebauthn/browser');
      type StartRegistrationOpts = Parameters<typeof startRegistration>[0];
      const opt = await authPasskeyRegisterOptions();
      const credential = await startRegistration({
        optionsJSON:
          opt.options as unknown as StartRegistrationOpts['optionsJSON'],
      });
      await authPasskeyRegisterVerify({
        challengeId: opt.challengeId,
        credential: credential as unknown as Record<string, unknown>,
        label: label || undefined,
      });
    } catch (e) {
      if (e instanceof AuthApiError) {
        if (e.body.code === 'NOT_AVAILABLE') {
          passkeyRegisterError.value =
            'Passkeys need a database-backed server.';
        } else {
          passkeyRegisterError.value = e.message;
        }
      } else if (e instanceof Error && e.name === 'NotAllowedError') {
        passkeyRegisterError.value = 'Passkey registration was cancelled.';
      } else {
        passkeyRegisterError.value = 'Could not register passkey. Try again.';
      }
    } finally {
      passkeyRegisterBusy.value = false;
    }
  }

  return {
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
    passkeyRegisterBusy,
    passkeyRegisterError,
    openTwoFactorSetupModal,
    closeTwoFactorSetupModal,
    verifyTwoFactorCode,
    openTwoFactorDisableModal,
    closeTwoFactorDisableModal,
    submitDisableTotp,
    copyRecoveryCodes,
    registerPasskey,
  };
}
