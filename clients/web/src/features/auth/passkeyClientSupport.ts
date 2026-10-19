import { echoT } from '@/i18n';
import { ECHO_PASSKEYS_ENABLED } from '@/config/echoPasskeysEnabled';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { AuthApiError } from '@/api/authClient';
import { PasskeyCeremonyNotReadyError } from '@/features/auth/passkeyWebCeremony';

export type PasskeyCeremonyMode = 'login' | 'register';

/**
 * When non-null, the in-app WebAuthn ceremony must not run; show this message instead.
 */
export function getPasskeyWebCeremonyBlockReason(
  mode: PasskeyCeremonyMode,
): string | null {
  if (!ECHO_PASSKEYS_ENABLED) {
    return echoT('auth.passkeyErrors.disabled');
  }
  if (echoSyncCapabilities.isMockDataMode) {
    return echoT('auth.passkeyErrors.previewMode');
  }
  if (typeof window !== 'undefined') {
    if (!window.isSecureContext) {
      return echoT('auth.passkeyErrors.insecure');
    }
    if (!window.PublicKeyCredential) {
      return echoT('auth.passkeyErrors.unsupportedBrowser');
    }
  }
  return null;
}

export function mapPasskeyCeremonyError(
  err: unknown,
  mode: PasskeyCeremonyMode,
): string {
  if (err instanceof PasskeyCeremonyNotReadyError) {
    return mode === 'register'
      ? echoT('auth.passkeyErrors.setupLoading')
      : echoT('auth.passkeyErrors.signInLoading');
  }
  if (err instanceof AuthApiError) {
    if (err.body.code === 'NOT_AVAILABLE') {
      return mode === 'register'
        ? echoT('auth.passkeyErrors.needsDatabase')
        : err.body.message || echoT('auth.passkeyErrors.notAvailable');
    }
    if (err.body.code === 'CHALLENGE_EXPIRED') {
      return echoT('auth.passkeyErrors.stepExpired');
    }
    if (err.body.code === 'VERIFICATION_FAILED') {
      return echoT('auth.passkeyErrors.verificationFailed');
    }
    return err.message;
  }
  if (err instanceof DOMException || err instanceof Error) {
    const name = err.name;
    if (name === 'NotAllowedError') {
      return mode === 'register'
        ? echoT('auth.passkeyErrors.registerCancelled')
        : echoT('auth.passkeyErrors.signInCancelled');
    }
    if (name === 'AbortError') {
      return echoT('auth.passkeyErrors.interrupted');
    }
    if (name === 'SecurityError') {
      return echoT('auth.passkeyErrors.securityError');
    }
    if (name === 'InvalidStateError') {
      return echoT('auth.passkeyErrors.alreadyRegistered');
    }
    if (name === 'NotSupportedError') {
      return echoT('auth.passkeyErrors.deviceUnsupported');
    }
    if (err.message?.trim()) return err.message;
  }
  return mode === 'register'
    ? echoT('auth.passkeyErrors.registerFailed')
    : echoT('auth.passkeyErrors.signInFailed');
}
