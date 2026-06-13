/**
 * Desktop (Tauri) post-mint session priming.
 *
 * WKWebView can apply `Set-Cookie` asynchronously after login/register. Parallel
 * workspace / attention hydrates that race the cookie jar often 401 and tear down
 * a session that was just minted. OAuth handoff already primes via `/auth/me` in
 * `main.ts`; password login must do the same before kicking `startInitialLoad`.
 */

import { IS_ECHO_TAURI_SHELL } from '@/config';
import {
  AuthApiError,
  authFetchMe,
  invalidateAuthFetchMeCache,
  type AuthUserPublic,
} from '@/api/authClient';
import {
  getNativeAccessToken,
  isNativeBearerClient,
} from '@/services/auth/nativeAuthToken';

const DESKTOP_PRIME_DELAYS_MS = [0, 250, 600, 1200, 2500] as const;

export function isDesktopShellBuild(): boolean {
  return IS_ECHO_TAURI_SHELL && import.meta.env.VITE_ECHO_DESKTOP === '1';
}

/** Retry `/auth/me` until the minted session is visible to fetch (bearer or cookies). */
export async function primeCookieSessionAfterMint(): Promise<AuthUserPublic | null> {
  if (!isDesktopShellBuild()) return null;
  const delays =
    isNativeBearerClient() && getNativeAccessToken()
      ? ([0] as const)
      : DESKTOP_PRIME_DELAYS_MS;
  for (const waitMs of delays) {
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
    invalidateAuthFetchMeCache();
    try {
      const { user } = await authFetchMe();
      return user;
    } catch (e) {
      if (e instanceof AuthApiError && e.status === 401) continue;
      return null;
    }
  }
  return null;
}
