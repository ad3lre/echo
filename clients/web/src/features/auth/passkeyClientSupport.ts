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
    return 'Passkeys are disabled for this deployment.';
  }
  if (echoSyncCapabilities.isMockDataMode) {
    return 'Passkeys are not available in preview mode.';
  }
  if (typeof window !== 'undefined') {
    if (!window.isSecureContext) {
      return 'Passkeys require a secure connection (HTTPS).';
    }
    if (!window.PublicKeyCredential) {
      return 'This browser does not support passkeys. Try Chrome, Safari, or Edge.';
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
      ? 'Passkey setup is still loading. Wait a moment, then tap Add passkey again.'
      : 'Passkey sign-in is still loading. Wait a moment, then tap Sign in with passkey again.';
  }
  if (err instanceof AuthApiError) {
    if (err.body.code === 'NOT_AVAILABLE') {
      return mode === 'register'
        ? 'Passkeys need a database-backed server.'
        : err.body.message || 'Passkeys are not available on this server.';
    }
    if (err.body.code === 'CHALLENGE_EXPIRED') {
      return 'That passkey step expired. Try again.';
    }
    if (err.body.code === 'VERIFICATION_FAILED') {
      return 'Passkey verification failed. Try again.';
    }
    return err.message;
  }
  if (err instanceof DOMException || err instanceof Error) {
    const name = err.name;
    if (name === 'NotAllowedError') {
      return mode === 'register'
        ? 'Passkey registration was cancelled.'
        : 'Passkey sign-in was cancelled.';
    }
    if (name === 'AbortError') {
      return 'Passkey was interrupted. Try again.';
    }
    if (name === 'SecurityError') {
      return 'Passkeys cannot run on this page. Open Echo in a supported browser at your usual sign-in URL.';
    }
    if (name === 'InvalidStateError') {
      return 'This passkey is already registered on this device.';
    }
    if (name === 'NotSupportedError') {
      return 'This device or browser does not support passkeys.';
    }
    if (err.message?.trim()) return err.message;
  }
  return mode === 'register'
    ? 'Could not register passkey. Try again.'
    : 'Could not sign in with passkey. Try again.';
}
