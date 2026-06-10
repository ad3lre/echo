import { invoke } from '@tauri-apps/api/core';
import { isIosTauriShell } from '@/platform/iosNativeFeedback';
import { ECHO_IOS_APPLE_SIGNIN_ENABLED } from '@/config/echoIosNativeFeatures';

/** Result of the native Sign in with Apple authorization. */
export type AppleNativeCredential = {
  /** JWT to POST to `/auth/apple/login` for server-side verification. */
  identityToken: string;
  /** Raw nonce the app bound to the request; echoed in the token claims. */
  nonce?: string;
  /** Apple returns the full name only on the *first* authorization. */
  displayName?: string;
};

/** Whether the native "Sign in with Apple" button should be offered. */
export function appleSignInAvailable(): boolean {
  return ECHO_IOS_APPLE_SIGNIN_ENABLED && isIosTauriShell();
}

/**
 * Runs native Sign in with Apple via the Rust command `ios_sign_in_with_apple`
 * (which drives `ASAuthorizationController`). Resolves with the identity token
 * to verify server-side. Rejects when unavailable or the user cancels.
 */
export async function signInWithAppleNative(): Promise<AppleNativeCredential> {
  if (!appleSignInAvailable()) {
    throw new Error('apple_signin_unavailable');
  }
  return invoke<AppleNativeCredential>('ios_sign_in_with_apple');
}
