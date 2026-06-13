/**
 * Session-bound bearer auth for Tauri native shells (iOS + desktop).
 *
 * Bundled WebView origins (`tauri://localhost`, `https://tauri.localhost`) are
 * cross-site from the API, so HttpOnly session cookies are not reliably sent.
 * Native clients use short-lived access tokens in memory and refresh tokens
 * persisted in the platform keychain (via Tauri invoke commands).
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import type { AuthUserPublic } from '@/api/authClient';
import { API_BASE, IS_ECHO_TAURI_SHELL } from '@/config';
import { applyEchoCsrfFromAuthJson } from '@/utils/echoCsrf';
import {
  echoClientDebugError,
  echoClientDebugWarn,
} from '@/utils/echoClientDebug';

const IS_IOS_BUILD = import.meta.env.VITE_ECHO_IOS === '1';
const IS_DESKTOP_BUILD = import.meta.env.VITE_ECHO_DESKTOP === '1';
const AUTH_BASE = `${API_BASE.replace(/\/$/, '')}/api/v1/auth`;

export type NativeAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
};

let accessTokenMem: string | null = null;
let accessTokenExpiresAtMs = 0;
let nativeRefreshInFlight: Promise<AuthUserPublic | null> | null = null;

function nativeEchoClientId(): 'ios' | 'desktop' {
  return IS_IOS_BUILD ? 'ios' : 'desktop';
}

export function isNativeBearerClient(): boolean {
  if (!isTauri()) return false;
  return IS_IOS_BUILD || (IS_DESKTOP_BUILD && IS_ECHO_TAURI_SHELL);
}

export function getNativeAccessToken(): string | null {
  if (!isNativeBearerClient()) return null;
  if (!accessTokenMem) return null;
  if (
    accessTokenExpiresAtMs > 0 &&
    Date.now() >= accessTokenExpiresAtMs - 30_000
  ) {
    return null;
  }
  return accessTokenMem;
}

export function nativeAuthRequestHeaders(): Record<string, string> {
  if (!isNativeBearerClient()) return {};
  const token = getNativeAccessToken();
  const headers: Record<string, string> = {
    'X-Echo-Client': nativeEchoClientId(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function parseNativeAuthBlock(
  data: Record<string, unknown>,
): NativeAuthTokens | null {
  const auth = data.auth;
  if (!auth || typeof auth !== 'object') return null;
  const o = auth as Record<string, unknown>;
  const accessToken =
    typeof o.accessToken === 'string' ? o.accessToken.trim() : '';
  const refreshToken =
    typeof o.refreshToken === 'string' ? o.refreshToken.trim() : '';
  const expiresInSec =
    typeof o.expiresInSec === 'number' && Number.isFinite(o.expiresInSec)
      ? Math.max(60, Math.floor(o.expiresInSec))
      : 900;
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, expiresInSec };
}

export async function applyNativeAuthFromAuthJson(
  data: Record<string, unknown>,
): Promise<void> {
  if (!isNativeBearerClient()) return;
  const tokens = parseNativeAuthBlock(data);
  if (!tokens) return;
  accessTokenMem = tokens.accessToken;
  accessTokenExpiresAtMs = Date.now() + tokens.expiresInSec * 1000;
  try {
    await invoke('ios_auth_store_refresh_token', {
      refreshToken: tokens.refreshToken,
    });
  } catch (e) {
    console.error('[echo-native] store refresh token failed:', e);
  }
}

export async function clearNativeAuthTokens(): Promise<void> {
  accessTokenMem = null;
  accessTokenExpiresAtMs = 0;
  if (!isNativeBearerClient()) return;
  try {
    await invoke('ios_auth_clear_refresh_token');
  } catch {
    /* ignore */
  }
}

async function readStoredRefreshToken(): Promise<string | null> {
  if (!isNativeBearerClient()) return null;
  try {
    const token = await invoke<string | null>('ios_auth_get_refresh_token');
    const trimmed = typeof token === 'string' ? token.trim() : '';
    return trimmed || null;
  } catch {
    return null;
  }
}

async function postNativeRefreshOnce(
  refreshToken: string,
): Promise<{ res: Response; data: Record<string, unknown> }> {
  const res = await fetch(`${AUTH_BASE}/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Echo-Client': nativeEchoClientId(),
    },
    body: JSON.stringify({ refreshToken }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, data };
}

async function executeNativeBearerRefresh(options?: {
  quietExpectedNoRefreshToken?: boolean;
}): Promise<AuthUserPublic | null> {
  const refreshToken = await readStoredRefreshToken();
  if (!refreshToken) {
    return null;
  }
  let res: Response;
  let data: Record<string, unknown>;
  try {
    ({ res, data } = await postNativeRefreshOnce(refreshToken));
  } catch (error) {
    if (!options?.quietExpectedNoRefreshToken) {
      echoClientDebugWarn(
        '[echo][auth][native-refresh] network failure',
        error,
      );
    }
    return null;
  }
  if (
    !res.ok &&
    res.status === 401 &&
    typeof data.code === 'string' &&
    data.code === 'REFRESH_TOKEN_REUSED'
  ) {
    await new Promise((r) => setTimeout(r, 120));
    const retryToken = (await readStoredRefreshToken()) ?? refreshToken;
    try {
      ({ res, data } = await postNativeRefreshOnce(retryToken));
    } catch {
      return null;
    }
  }
  if (!res.ok) {
    if (!options?.quietExpectedNoRefreshToken) {
      echoClientDebugWarn('[echo][auth][native-refresh] failed', {
        status: res.status,
        code: typeof data.code === 'string' ? data.code : undefined,
      });
    }
    return null;
  }
  applyEchoCsrfFromAuthJson(data);
  await applyNativeAuthFromAuthJson(data);
  const user = data.user;
  if (user && typeof user === 'object') return user as AuthUserPublic;
  return null;
}

/** Exchange Keychain refresh token for a new access token (native shells). */
export async function authTryNativeBearerRefresh(options?: {
  quietExpectedNoRefreshToken?: boolean;
}): Promise<AuthUserPublic | null> {
  if (!isNativeBearerClient()) return null;
  if (!nativeRefreshInFlight) {
    nativeRefreshInFlight = executeNativeBearerRefresh(options).finally(() => {
      nativeRefreshInFlight = null;
    });
  }
  return nativeRefreshInFlight;
}

/** Boot-time: restore bearer session from Keychain when cookies are unavailable. */
export async function bootstrapNativeBearerSessionFromKeychain(): Promise<AuthUserPublic | null> {
  if (!isNativeBearerClient()) return null;
  if (getNativeAccessToken()) return null;
  return authTryNativeBearerRefresh({ quietExpectedNoRefreshToken: true });
}

export async function getNativeRefreshTokenForLogout(): Promise<string | null> {
  return readStoredRefreshToken();
}
