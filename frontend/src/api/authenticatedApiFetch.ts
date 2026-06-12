import { authTryCookieRefresh } from '@/api/authClient';
import {
  captureAuthStateGeneration,
  finalizeAuthSession401,
} from '@/api/authSessionBridge';
import { nativeAuthRequestHeaders } from '@/services/auth/nativeAuthToken';
import { useAuthSessionStore } from '@/stores/authSession';
import { echoCsrfHeaders } from '@/utils/echoCsrf';

function mutatingMethod(method: string | undefined): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
    (method ?? 'GET').toUpperCase(),
  );
}

function headersWithNativeAuth(initHeaders?: HeadersInit): Headers {
  const headers = new Headers(nativeAuthRequestHeaders());
  new Headers(initHeaders).forEach((value, key) => headers.set(key, value));
  return headers;
}

function refreshCsrfHeaderIfNeeded(init: RequestInit): RequestInit {
  const method = init.method?.toUpperCase() ?? 'GET';
  const headers = new Headers(init.headers);
  if (!mutatingMethod(method) && !headers.has('x-csrf-token')) return init;
  headers.delete('x-csrf-token');
  Object.entries(echoCsrfHeaders()).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return { ...init, headers };
}

/**
 * Authenticated `/api/v1/*` fetch for non-Echo REST clients.
 *
 * `echoFetch` is scoped to `/api/v1/echo`; linked-account settings routes live
 * beside it under `/api/v1/me/*` and still need the same cookie/native auth
 * behavior.
 */
export async function authenticatedApiFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const authGenAtStart = captureAuthStateGeneration();
  let currentInit = init;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      ...currentInit,
      credentials: 'include',
      headers: headersWithNativeAuth(currentInit.headers),
    });
    if (res.status === 401 && attempt === 0) {
      const user = await authTryCookieRefresh();
      if (user) {
        useAuthSessionStore().applyRestoredProfile(user);
        currentInit = refreshCsrfHeaderIfNeeded(currentInit);
        continue;
      }
    }
    if (res.status === 401) {
      /* Refresh failed (or retry still 401): same teardown semantics as
       * `echoFetch`, guarded against mid-flight auth rotation. */
      finalizeAuthSession401({
        authGenAtStart,
        message: 'Your session expired or is no longer valid. Sign in again.',
      });
    }
    return res;
  }
  throw new Error('Authenticated API request failed');
}
