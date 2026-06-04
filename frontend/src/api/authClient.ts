import type { ApiErrorBody } from '@shared/types/api';
import { translateApiErrorBody } from '@/i18n/apiErrors';
import type { EchoPlanLimitsPublic } from '@shared/echoPlanLimits';
import { API_BASE, IS_ECHO_TAURI_SHELL } from '@/config';
import {
  applyEchoCsrfFromAuthJson,
  echoCsrfHeaders,
  echoCsrfJsonHeaders,
} from '@/utils/echoCsrf';
import { clearSkipAutoGuestAfterLogout } from '@/utils/autoGuestLogoutSuppress';
import { getOrCreateEchoClientHwid } from '@/services/auth/echoClientHwid';
import {
  notifyAuthClearLocalTokensProbe,
  notifyInvalidateSessionForReauth,
} from '@/api/authSessionBridge';
import { newTraceId } from '@/observability/sessionDiagnostics';
import {
  applyNativeAuthFromAuthJson,
  authTryNativeBearerRefresh,
  bootstrapNativeBearerSessionFromKeychain,
  getNativeRefreshTokenForLogout,
  isNativeBearerClient,
  nativeAuthRequestHeaders,
} from '@/services/auth/nativeAuthToken';
import {
  echoClientDebugEnabled,
  echoClientDebugError,
  echoClientDebugWarn,
} from '@/utils/echoClientDebug';

const AUTH_BASE = `${API_BASE.replace(/\/$/, '')}/api/v1/auth`;
const SIMPLE_POST_CONTENT_TYPES = new Set([
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
]);
const SAFE_CORS_HEADERS = new Set([
  'accept',
  'accept-language',
  'content-language',
  'content-type',
]);

export type EchoPlusInterestTier = 'plus' | 'black' | 'any';
export type EchoPlusInterestBillingCycle = 'monthly' | 'yearly';

export type EchoPlusInterestPublic = {
  tier: EchoPlusInterestTier;
  billingCycle: EchoPlusInterestBillingCycle;
  createdAt: string;
  updatedAt: string;
};

export type AuthUserPublic = {
  id: string;
  username: string;
  /** Set for registered accounts (omitted or empty for guests). */
  email?: string;
  /** From API when using Postgres-backed auth; mock auth omits this. */
  emailVerified?: boolean;
  /** Masked E.164 when verified (Postgres). */
  phone?: string;
  pendingPhone?: string;
  phoneVerified?: boolean;
  displayName: string;
  pfp: string;
  status: 'online' | 'idle' | 'do_not_disturb' | 'offline';
  customStatus?: string;
  /** Profile “about me” (server-persisted). */
  bio?: string;
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  /** Vertical crop anchor for banner cover image (0 = top, 50 = center, 100 = bottom). */
  bannerPositionY?: number;
  createdAt: string;
  updatedAt?: string;
  /** Onboarding guest; upgrade with email/password clears this. */
  isGuest?: boolean;
  /** Suggested email from Discord OAuth (guest only); editable in upgrade form. */
  guestPendingEmail?: string;
  guestMintedAt?: string;
  guestTotalMessages?: number;
  /** True when authenticator-app TOTP is enabled (Postgres auth). */
  totpEnabled?: boolean;
  /** Paid plan / billing: when true, the Subscriptions settings tab is shown. */
  hasActiveSubscription?: boolean;
  /** Postgres `auth_users.echo_plan`; aligned with `planLimits.plan` when present. */
  echoPlan?: 'free' | 'plus' | 'black';
  /** Pre-launch Echo+ interest signup (`auth_echo_plus_interest`). */
  echoPlusInterest?: EchoPlusInterestPublic;
  /** Profile badges (e.g. `og` for early accounts). */
  badges?: string[];
  /** Whether to show "last online" timestamp to other users. Defaults to true. */
  showLastOnline?: boolean;
  /** IANA timezone id (server-persisted; used for Magic Time). */
  timeZone?: string | null;
  /** BCP-47 UI locale (server-persisted). */
  locale?: string | null;
};

export class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    const msg = body.detail
      ? `${translateApiErrorBody(body)} (${body.detail})`
      : translateApiErrorBody(body);
    super(msg);
    this.name = 'AuthApiError';
  }
}

function appendDiagTraceId(url: string, traceId: string): string {
  const u = new URL(url);
  u.searchParams.set('diagTraceId', traceId);
  return u.toString();
}

function authCorsProfile(
  url: string,
  method: string,
  headers: Record<string, string> | undefined,
): {
  crossOrigin: boolean;
  contentType: string | null;
  customHeaders: string[];
  likelyPreflight: boolean;
} {
  const crossOrigin = (() => {
    try {
      const target = new URL(
        url,
        typeof window !== 'undefined' ? window.location.href : undefined,
      );
      return typeof window !== 'undefined'
        ? target.origin !== window.location.origin
        : true;
    } catch {
      return true;
    }
  })();
  const normalized = Object.entries(headers ?? {}).map(([k, v]) => [
    k.toLowerCase(),
    String(v).trim(),
  ]) as Array<[string, string]>;
  const contentTypeRaw =
    normalized.find(([k]) => k === 'content-type')?.[1]?.toLowerCase() ?? '';
  const contentType = contentTypeRaw
    ? contentTypeRaw.split(';', 1)[0]?.trim() || null
    : null;
  const customHeaders = normalized
    .map(([k]) => k)
    .filter((k) => !SAFE_CORS_HEADERS.has(k));
  const methodUpper = method.toUpperCase();
  const simpleMethod =
    methodUpper === 'GET' || methodUpper === 'HEAD' || methodUpper === 'POST';
  const simpleContentType =
    !contentType || SIMPLE_POST_CONTENT_TYPES.has(contentType);
  return {
    crossOrigin,
    contentType,
    customHeaders,
    likelyPreflight:
      crossOrigin &&
      (!simpleMethod ||
        (methodUpper === 'POST' && !simpleContentType) ||
        customHeaders.length > 0),
  };
}

/** True when verbose auth logging is allowed. Production bundles ignore `VITE_ECHO_AUTH_DEBUG`. */
export function authDebugEnabled(): boolean {
  return echoClientDebugEnabled();
}

function logAuthNetworkFailure(params: {
  operation: string;
  traceId: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  error: unknown;
}): void {
  if (!authDebugEnabled()) return;
  const cors = authCorsProfile(params.url, params.method, params.headers);
  echoClientDebugError(`[echo][auth][network] ${params.operation}`, {
    traceId: params.traceId,
    endpoint: params.url,
    method: params.method,
    apiBase: API_BASE,
    href: typeof window !== 'undefined' ? window.location.href : undefined,
    origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    isDesktopBuild: IS_ECHO_TAURI_SHELL,
    navigatorOnline:
      typeof navigator !== 'undefined' ? navigator.onLine : undefined,
    crossOrigin: cors.crossOrigin,
    contentType: cors.contentType,
    customHeaders: cors.customHeaders,
    likelyPreflight: cors.likelyPreflight,
    error:
      params.error instanceof Error
        ? { name: params.error.name, message: params.error.message }
        : String(params.error),
  });
}

/** Dev / opt-in diagnostics for auth flows (non-production only, or `import.meta.env.DEV`). */
export function echoAuthDebugLog(
  _event: string,
  _payload: Record<string, unknown> = {},
): void {
  if (!authDebugEnabled()) return;
}

/** Dev / opt-in hook for failed auth requests; no console output. */
export function echoAuthLogRequestFailure(
  _operation: string,
  _res: Response,
  _data: unknown,
  _extra?: Record<string, unknown>,
): void {
  if (!authDebugEnabled()) return;
}

/** Legacy no-op — auth always uses the real `/api/v1/auth/*` surface. */
export function assertAuthDomainNetworkAllowed(): void {}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function invalidateSessionOn401(message: string): void {
  notifyInvalidateSessionForReauth(message);
}

function throwIfError(res: Response, data: unknown, operation: string): void {
  if (res.ok) return;
  echoAuthLogRequestFailure(operation, res, data);
  const body = data as ApiErrorBody;
  throw new AuthApiError(res.status, {
    code: typeof body?.code === 'string' ? body.code : 'UNKNOWN',
    message: typeof body?.message === 'string' ? body.message : res.statusText,
    ...(typeof body?.detail === 'string' ? { detail: body.detail } : {}),
  });
}

export function authEndpointsDoc(): { label: string; href: string }[] {
  const base = AUTH_BASE;
  return [
    { label: 'POST /register', href: `${base}/register` },
    { label: 'POST /login', href: `${base}/login` },
    { label: 'POST /login/mfa', href: `${base}/login/mfa` },
    { label: 'POST /resend-verification', href: `${base}/resend-verification` },
    { label: 'POST /phone/send-code', href: `${base}/phone/send-code` },
    { label: 'POST /phone/resend-code', href: `${base}/phone/resend-code` },
    { label: 'POST /phone/verify', href: `${base}/phone/verify` },
    { label: 'POST /2fa/totp/begin', href: `${base}/2fa/totp/begin` },
    { label: 'POST /2fa/totp/confirm', href: `${base}/2fa/totp/confirm` },
    { label: 'POST /2fa/totp/disable', href: `${base}/2fa/totp/disable` },
    { label: 'POST /refresh', href: `${base}/refresh` },
    { label: 'GET /me', href: `${base}/me` },
    { label: 'PATCH /me', href: `${base}/me` },
    { label: 'POST /logout', href: `${base}/logout` },
    { label: 'POST /verify-password', href: `${base}/verify-password` },
    { label: 'POST /change-password', href: `${base}/change-password` },
    { label: 'DELETE /me', href: `${base}/me` },
    { label: 'GET /sessions', href: `${base}/sessions` },
    { label: 'POST /sessions/revoke', href: `${base}/sessions/revoke` },
    { label: 'POST /guest', href: `${base}/guest` },
    { label: 'POST /guest/upgrade', href: `${base}/guest/upgrade` },
    { label: 'POST /discord/start', href: `${base}/discord/start` },
    {
      label: 'POST /discord/login/start',
      href: `${base}/discord/login/start`,
    },
    {
      label: 'GET /discord/login/start (desktop → system browser)',
      href: `${base}/discord/login/start`,
    },
    {
      label: 'POST /desktop/redeem-handoff',
      href: `${base}/desktop/redeem-handoff`,
    },
    { label: 'GET /discord/callback', href: `${base}/discord/callback` },
  ];
}

let cookieRefreshInFlight: Promise<AuthUserPublic | null> | null = null;

async function finalizeAuthSessionResponse(
  data: Record<string, unknown>,
): Promise<void> {
  applyEchoCsrfFromAuthJson(data);
  await applyNativeAuthFromAuthJson(data);
}

export { bootstrapNativeBearerSessionFromKeychain };

async function postCookieRefreshOnce(): Promise<{
  res: Response;
  data: Record<string, unknown>;
}> {
  const res = await fetch(`${AUTH_BASE}/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...nativeAuthRequestHeaders(),
    },
    body: JSON.stringify({}),
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  return { res, data };
}

async function executeCookieRefresh(options?: {
  /** When true, omit noisy failure logs for “no refresh cookie / logged out” (session probe). */
  quietExpectedNoRefreshCookie?: boolean;
}): Promise<AuthUserPublic | null> {
  let res: Response;
  let data: Record<string, unknown>;
  try {
    ({ res, data } = await postCookieRefreshOnce());
  } catch (error) {
    echoAuthDebugLog('POST /auth/refresh network failure', {
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : String(error),
    });
    return null;
  }
  if (
    !res.ok &&
    res.status === 401 &&
    typeof data.code === 'string' &&
    data.code === 'REFRESH_TOKEN_REUSED'
  ) {
    /* Concurrent rotation: another in-flight refresh consumed this token; wait for Set-Cookie then retry once. */
    echoAuthDebugLog('refresh rotation race — retrying once', {});
    await new Promise((r) => setTimeout(r, 120));
    try {
      ({ res, data } = await postCookieRefreshOnce());
    } catch (error) {
      echoAuthDebugLog('POST /auth/refresh retry network failure', {
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : String(error),
      });
      return null;
    }
  }
  if (!res.ok) {
    const code = typeof data.code === 'string' ? data.code : '';
    const quietProbe =
      options?.quietExpectedNoRefreshCookie === true &&
      (code === 'REFRESH_TOKEN_REQUIRED' ||
        (res.status === 401 && code === 'INVALID_REFRESH_TOKEN'));
    if (!quietProbe) {
      echoAuthLogRequestFailure('POST /auth/refresh', res, data, {
        hint: 'Typical causes: 400 REFRESH_TOKEN_REQUIRED (no echo_rt cookie or wrong host), 401 INVALID_REFRESH_TOKEN after logout or rotation race.',
      });
    }
    return null;
  }
  applyEchoCsrfFromAuthJson(data);
  await applyNativeAuthFromAuthJson(data);
  const user = data.user;
  if (user && typeof user === 'object') return user as AuthUserPublic;
  echoAuthDebugLog('cookie refresh unexpected body', { url: res.url });
  return null;
}

/**
 * Cookie + refresh rotation; returns user when cookies were refreshed.
 * Concurrent 401s (e.g. `/me` + `/echo/workspace` on load) must not each POST `/refresh`:
 * the second request often gets 400 after rotation and looks like a broken session.
 */
export async function authTryCookieRefresh(options?: {
  quietExpectedNoRefreshCookie?: boolean;
}): Promise<AuthUserPublic | null> {
  if (isNativeBearerClient()) {
    const native = await authTryNativeBearerRefresh({
      quietExpectedNoRefreshToken: options?.quietExpectedNoRefreshCookie,
    });
    if (native) return native;
  }
  assertAuthDomainNetworkAllowed();
  if (!cookieRefreshInFlight) {
    cookieRefreshInFlight = executeCookieRefresh(options).finally(() => {
      cookieRefreshInFlight = null;
    });
  }
  return cookieRefreshInFlight;
}

export async function authDiscordOAuthStart(): Promise<{
  authorizeUrl: string;
  /** Echo sends this to Discord; it must be listed verbatim in Developer Portal → OAuth2 → Redirects. */
  redirectUri?: string;
}> {
  assertAuthDomainNetworkAllowed();
  const traceId = newTraceId();
  const url = appendDiagTraceId(`${AUTH_BASE}/discord/start`, traceId);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: echoCsrfHeaders(),
      credentials: 'include',
    });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'discord_oauth_start',
      traceId,
      url,
      method: 'POST',
      headers: echoCsrfHeaders(),
      error,
    });
    throw error;
  }
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/discord/start');
  const authorizeUrl =
    typeof data.authorizeUrl === 'string' ? data.authorizeUrl : '';
  const redirectUri =
    typeof data.redirectUri === 'string' ? data.redirectUri : undefined;
  if (!authorizeUrl) throw new Error('INVALID_DISCORD_START_RESPONSE');
  return { authorizeUrl, ...(redirectUri ? { redirectUri } : {}) };
}

export async function authYoutubeOAuthStart(): Promise<{
  authorizeUrl: string;
  redirectUri?: string;
}> {
  assertAuthDomainNetworkAllowed();
  const traceId = newTraceId();
  const url = appendDiagTraceId(`${AUTH_BASE}/youtube/start`, traceId);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: echoCsrfHeaders(),
      credentials: 'include',
    });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'youtube_oauth_start',
      traceId,
      url,
      method: 'POST',
      headers: echoCsrfHeaders(),
      error,
    });
    throw error;
  }
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/youtube/start');
  const authorizeUrl =
    typeof data.authorizeUrl === 'string' ? data.authorizeUrl : '';
  const redirectUri =
    typeof data.redirectUri === 'string' ? data.redirectUri : undefined;
  if (!authorizeUrl) throw new Error('INVALID_YOUTUBE_START_RESPONSE');
  return { authorizeUrl, ...(redirectUri ? { redirectUri } : {}) };
}

/**
 * Absolute GET URL for `/auth/discord/login/start` with desktop handoff query params.
 * Open this in the **system browser** (`openExternal`) so OAuth starts without a credentialed
 * `fetch(POST …)` from the WebView (WebView2 can reject those while simple GETs succeed).
 */
export function authDiscordDesktopHandoffStartUrl(
  desktopHandoffNonce: string,
): string {
  const n = desktopHandoffNonce.trim();
  if (!n) throw new Error('DESKTOP_HANDOFF_NONCE_REQUIRED');
  const u = new URL(`${AUTH_BASE}/discord/login/start`);
  u.searchParams.set('desktopBrowserHandoff', '1');
  u.searchParams.set('desktopHandoffNonce', n);
  return u.toString();
}

/**
 * Absolute GET URL for `/auth/google/login/start` with desktop handoff query params.
 * Open in the system browser on Tauri (same pattern as Discord desktop OAuth).
 */
export function authGoogleDesktopHandoffStartUrl(
  desktopHandoffNonce: string,
): string {
  const n = desktopHandoffNonce.trim();
  if (!n) throw new Error('DESKTOP_HANDOFF_NONCE_REQUIRED');
  const u = new URL(`${AUTH_BASE}/google/login/start`);
  u.searchParams.set('desktopBrowserHandoff', '1');
  u.searchParams.set('desktopHandoffNonce', n);
  return u.toString();
}

/** Sign in with Discord (login modal). CSRF-exempt; signed OAuth state (cookie optional). */
export async function authDiscordLoginStart(body?: {
  desktopBrowserHandoff?: boolean;
  desktopHandoffNonce?: string;
}): Promise<{
  authorizeUrl: string;
  redirectUri?: string;
}> {
  assertAuthDomainNetworkAllowed();
  const traceId = newTraceId();
  const isDesktop = IS_ECHO_TAURI_SHELL;
  const hasHandoff =
    body?.desktopBrowserHandoff === true || !!body?.desktopHandoffNonce?.trim();

  const url = appendDiagTraceId(`${AUTH_BASE}/discord/login/start`, traceId);
  let res: Response;
  try {
    res = isDesktop
      ? hasHandoff
        ? await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            credentials: 'include',
            body: (() => {
              const params = new URLSearchParams();
              params.set('diagTraceId', traceId);
              if (body?.desktopBrowserHandoff === true) {
                params.set('desktopBrowserHandoff', '1');
              }
              if (body?.desktopHandoffNonce?.trim()) {
                params.set(
                  'desktopHandoffNonce',
                  body.desktopHandoffNonce.trim(),
                );
              }
              return params.toString();
            })(),
          })
        : await fetch(url, {
            method: 'POST',
            credentials: 'include',
          })
      : await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            diagTraceId: traceId,
            ...(body?.desktopBrowserHandoff === true
              ? { desktopBrowserHandoff: true }
              : {}),
            ...(body?.desktopHandoffNonce?.trim()
              ? { desktopHandoffNonce: body.desktopHandoffNonce.trim() }
              : {}),
          }),
        });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'discord_login_start',
      traceId,
      url,
      method: 'POST',
      headers:
        isDesktop && hasHandoff
          ? { 'Content-Type': 'application/x-www-form-urlencoded' }
          : !isDesktop
            ? { 'Content-Type': 'application/json' }
            : undefined,
      error,
    });
    throw error;
  }
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/discord/login/start');
  const authorizeUrl =
    typeof data.authorizeUrl === 'string' ? data.authorizeUrl : '';
  const redirectUri =
    typeof data.redirectUri === 'string' ? data.redirectUri : undefined;
  if (!authorizeUrl) throw new Error('INVALID_DISCORD_START_RESPONSE');
  return { authorizeUrl, ...(redirectUri ? { redirectUri } : {}) };
}

/** Redeem one-time code after Discord OAuth in the system browser (desktop). */
export async function authDesktopRedeemHandoff(
  code: string,
  nonce: string,
): Promise<AuthSessionPayload> {
  assertAuthDomainNetworkAllowed();
  const traceId = newTraceId();
  const url = appendDiagTraceId(`${AUTH_BASE}/desktop/redeem-handoff`, traceId);
  const trimmedCode = code.trim();
  const trimmedNonce = nonce.trim();
  if (IS_ECHO_TAURI_SHELL && authDebugEnabled()) {
    echoClientDebugWarn('[echo-desktop] redeem-handoff request', {
      traceId,
      url,
      codeLen: trimmedCode.length,
      nonceLen: trimmedNonce.length,
    });
  }
  let res: Response;
  try {
    res = IS_ECHO_TAURI_SHELL
      ? await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          credentials: 'include',
          body: (() => {
            const params = new URLSearchParams();
            params.set('diagTraceId', traceId);
            params.set('code', trimmedCode);
            params.set('nonce', trimmedNonce);
            return params.toString();
          })(),
        })
      : await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            diagTraceId: traceId,
            code: trimmedCode,
            nonce: trimmedNonce,
          }),
        });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'desktop_redeem_handoff',
      traceId,
      url,
      method: 'POST',
      headers: IS_ECHO_TAURI_SHELL
        ? { 'Content-Type': 'application/x-www-form-urlencoded' }
        : { 'Content-Type': 'application/json' },
      error,
    });
    throw error;
  }
  if (IS_ECHO_TAURI_SHELL && authDebugEnabled()) {
    echoClientDebugWarn('[echo-desktop] redeem-handoff response', {
      traceId,
      status: res.status,
      ok: res.ok,
    });
  }
  const data = (await parseJson(res)) as Record<string, unknown>;
  if (IS_ECHO_TAURI_SHELL && !res.ok && authDebugEnabled()) {
    echoClientDebugWarn('[echo-desktop] redeem-handoff error body', {
      traceId,
      status: res.status,
      code: typeof data.code === 'string' ? data.code : null,
      message: typeof data.message === 'string' ? data.message : null,
    });
  }
  throwIfError(res, data, 'POST /auth/desktop/redeem-handoff');
  await finalizeAuthSessionResponse(data);
  const user = data.user;
  if (!user || typeof user !== 'object') {
    throw new Error('INVALID_HANDOFF_RESPONSE');
  }
  return { user: user as AuthUserPublic };
}

/** Link Google to the signed-in Echo account (Settings → Google). */
export async function authGoogleOAuthStart(): Promise<{
  authorizeUrl: string;
  redirectUri?: string;
}> {
  assertAuthDomainNetworkAllowed();
  const traceId = newTraceId();
  const url = appendDiagTraceId(`${AUTH_BASE}/google/start`, traceId);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: echoCsrfHeaders(),
      credentials: 'include',
    });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'google_oauth_start',
      traceId,
      url,
      method: 'POST',
      headers: echoCsrfHeaders(),
      error,
    });
    throw error;
  }
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/google/start');
  const authorizeUrl =
    typeof data.authorizeUrl === 'string' ? data.authorizeUrl : '';
  const redirectUri =
    typeof data.redirectUri === 'string' ? data.redirectUri : undefined;
  if (!authorizeUrl) throw new Error('INVALID_GOOGLE_START_RESPONSE');
  return { authorizeUrl, ...(redirectUri ? { redirectUri } : {}) };
}

/** Sign in with Google (login modal). CSRF-exempt; uses HttpOnly OAuth state cookie. */
export async function authGoogleLoginStart(body?: {
  desktopBrowserHandoff?: boolean;
  desktopHandoffNonce?: string;
}): Promise<{
  authorizeUrl: string;
  redirectUri?: string;
}> {
  assertAuthDomainNetworkAllowed();
  const traceId = newTraceId();
  const isDesktopBuild = IS_ECHO_TAURI_SHELL;
  const hasHandoff =
    body?.desktopBrowserHandoff === true || !!body?.desktopHandoffNonce?.trim();

  const url = appendDiagTraceId(`${AUTH_BASE}/google/login/start`, traceId);
  let res: Response;
  try {
    res = isDesktopBuild
      ? hasHandoff
        ? await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            credentials: 'include',
            body: (() => {
              const params = new URLSearchParams();
              params.set('diagTraceId', traceId);
              if (body?.desktopBrowserHandoff === true) {
                params.set('desktopBrowserHandoff', '1');
              }
              if (body?.desktopHandoffNonce?.trim()) {
                params.set(
                  'desktopHandoffNonce',
                  body.desktopHandoffNonce.trim(),
                );
              }
              return params.toString();
            })(),
          })
        : await fetch(url, {
            method: 'POST',
            credentials: 'include',
          })
      : await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            diagTraceId: traceId,
            ...(body?.desktopBrowserHandoff === true
              ? { desktopBrowserHandoff: true }
              : {}),
            ...(body?.desktopHandoffNonce?.trim()
              ? { desktopHandoffNonce: body.desktopHandoffNonce.trim() }
              : {}),
          }),
        });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'google_login_start',
      traceId,
      url,
      method: 'POST',
      error,
    });
    throw error;
  }
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/google/login/start');
  const authorizeUrl =
    typeof data.authorizeUrl === 'string' ? data.authorizeUrl : '';
  const redirectUri =
    typeof data.redirectUri === 'string' ? data.redirectUri : undefined;
  if (!authorizeUrl) throw new Error('INVALID_GOOGLE_START_RESPONSE');
  return { authorizeUrl, ...(redirectUri ? { redirectUri } : {}) };
}

export async function authContinueAsGuest(body?: {
  captchaToken?: string;
  clientHwid?: string;
}): Promise<{
  user: AuthUserPublic;
  resumed?: boolean;
}> {
  assertAuthDomainNetworkAllowed();
  clearSkipAutoGuestAfterLogout();
  const traceId = newTraceId();
  const clientHwid = body?.clientHwid?.trim() || getOrCreateEchoClientHwid();
  let res: Response;
  try {
    if (IS_ECHO_TAURI_SHELL) {
      /**
       * Desktop (`http://tauri.localhost` -> `https://api`) can be blocked by
       * Cloudflare/proxy preflight handling on JSON POSTs. Keep this as a
       * CORS-simple request (no JSON body/header) to avoid OPTIONS.
       */
      const u = new URL(`${AUTH_BASE}/guest`);
      u.searchParams.set('diagTraceId', traceId);
      u.searchParams.set('clientHwid', clientHwid);
      if (body?.captchaToken?.trim()) {
        u.searchParams.set('captchaToken', body.captchaToken.trim());
      }
      res = await fetch(u.toString(), {
        method: 'POST',
        credentials: 'include',
        headers: nativeAuthRequestHeaders(),
      });
    } else {
      const payload: { captchaToken?: string; clientHwid: string } = {
        clientHwid,
      };
      if (body?.captchaToken) payload.captchaToken = body.captchaToken;
      res = await fetch(appendDiagTraceId(`${AUTH_BASE}/guest`, traceId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...nativeAuthRequestHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ ...payload, diagTraceId: traceId }),
      });
    }
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'guest',
      traceId,
      url: appendDiagTraceId(`${AUTH_BASE}/guest`, traceId),
      method: 'POST',
      headers: IS_ECHO_TAURI_SHELL
        ? undefined
        : { 'Content-Type': 'application/json' },
      error,
    });
    throw error;
  }
  const data = (await parseJson(res)) as Record<string, unknown>;
  if (authDebugEnabled()) {
    if (res.ok) {
      echoClientDebugWarn('[echo][auth][guest] response', {
        endpoint: `${AUTH_BASE}/guest`,
        status: res.status,
        resumed:
          typeof (data as { resumed?: unknown }).resumed === 'boolean'
            ? (data as { resumed?: boolean }).resumed
            : undefined,
      });
    } else {
      echoClientDebugError('[echo][auth][guest] non-ok response', {
        endpoint: `${AUTH_BASE}/guest`,
        status: res.status,
        body: data,
      });
    }
  }
  throwIfError(res, data, 'POST /auth/guest');
  await finalizeAuthSessionResponse(data);
  return data as { user: AuthUserPublic; resumed?: boolean };
}

export async function authUpgradeGuest(body: {
  email: string;
  password: string;
  username?: string;
  displayName?: string;
  pfp?: string;
}): Promise<{ user: AuthUserPublic }> {
  assertAuthDomainNetworkAllowed();
  const traceId = newTraceId();
  const url = appendDiagTraceId(`${AUTH_BASE}/guest/upgrade`, traceId);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        ...echoCsrfJsonHeaders(),
        ...nativeAuthRequestHeaders(),
      },
      credentials: 'include',
      body: JSON.stringify({ ...body, diagTraceId: traceId }),
    });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'guest_upgrade',
      traceId,
      url,
      method: 'POST',
      headers: echoCsrfJsonHeaders(),
      error,
    });
    throw error;
  }
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/guest/upgrade');
  await finalizeAuthSessionResponse(data);
  return data as { user: AuthUserPublic };
}

export async function authRegister(body: {
  username: string;
  password: string;
  email: string;
  displayName?: string;
  clientHwid?: string;
}): Promise<{ user: AuthUserPublic }> {
  const traceId = newTraceId();
  const url = appendDiagTraceId(`${AUTH_BASE}/register`, traceId);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...nativeAuthRequestHeaders(),
      },
      credentials: 'include',
      body: JSON.stringify({
        ...body,
        diagTraceId: traceId,
        clientHwid: body.clientHwid?.trim() || getOrCreateEchoClientHwid(),
      }),
    });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'register',
      traceId,
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      error,
    });
    throw error;
  }
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/register');
  await finalizeAuthSessionResponse(data);
  return data as { user: AuthUserPublic };
}

export type AuthSessionPayload = {
  user: AuthUserPublic;
};

export type AuthLoginMfaChallenge = {
  mfaRequired: true;
  mfaToken: string;
  user: { id: string; username: string };
};

export type AuthLoginResult = AuthSessionPayload | AuthLoginMfaChallenge;

export function isAuthLoginMfaChallenge(
  r: AuthLoginResult,
): r is AuthLoginMfaChallenge {
  return 'mfaRequired' in r && r.mfaRequired === true;
}

/** Parse successful login JSON (200). Exported for unit tests. */
export function parseAuthLoginResult(data: unknown): AuthLoginResult {
  if (!data || typeof data !== 'object') {
    throw new Error('INVALID_LOGIN_RESPONSE');
  }
  const o = data as Record<string, unknown>;
  if (o.mfaRequired === true) {
    const mfaToken = typeof o.mfaToken === 'string' ? o.mfaToken.trim() : '';
    const u = o.user;
    if (!mfaToken || !u || typeof u !== 'object') {
      throw new Error('INVALID_LOGIN_RESPONSE');
    }
    const user = u as Record<string, unknown>;
    const id = typeof user.id === 'string' ? user.id : '';
    const username = typeof user.username === 'string' ? user.username : '';
    if (!id || !username) throw new Error('INVALID_LOGIN_RESPONSE');
    return { mfaRequired: true, mfaToken, user: { id, username } };
  }
  const user = o.user;
  if (!user || typeof user !== 'object') {
    throw new Error('INVALID_LOGIN_RESPONSE');
  }
  return {
    user: user as AuthUserPublic,
  };
}

export async function authLogin(body: {
  username: string;
  password: string;
}): Promise<AuthLoginResult> {
  assertAuthDomainNetworkAllowed();
  const traceId = newTraceId();
  let res: Response;
  try {
    if (IS_ECHO_TAURI_SHELL) {
      /**
       * CORS-simple POST (see `authContinueAsGuest` desktop branch). Avoids OPTIONS
       * preflight that Cloudflare / some proxies break for cross-origin JSON from the
       * Tauri WebView (`https://tauri.localhost` → API).
       *
       * Use the exact media type token `application/x-www-form-urlencoded` with no
       * charset suffix so the request stays non-preflighted.
       */
      const params = new URLSearchParams();
      params.set('diagTraceId', traceId);
      params.set('username', body.username);
      params.set('password', body.password);
      res = await fetch(appendDiagTraceId(`${AUTH_BASE}/login`, traceId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...nativeAuthRequestHeaders(),
        },
        credentials: 'include',
        body: params.toString(),
      });
    } else {
      res = await fetch(appendDiagTraceId(`${AUTH_BASE}/login`, traceId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...nativeAuthRequestHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ ...body, diagTraceId: traceId }),
      });
    }
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'login',
      traceId,
      url: appendDiagTraceId(`${AUTH_BASE}/login`, traceId),
      method: 'POST',
      headers: IS_ECHO_TAURI_SHELL
        ? { 'Content-Type': 'application/x-www-form-urlencoded' }
        : { 'Content-Type': 'application/json' },
      error,
    });
    throw error;
  }
  const data = await parseJson(res);
  if (!res.ok && authDebugEnabled()) {
    echoClientDebugError('[echo][auth][login] non-ok response', {
      endpoint: `${AUTH_BASE}/login`,
      status: res.status,
      body: data,
    });
  }
  throwIfError(res, data, 'POST /auth/login');
  if (data && typeof data === 'object') {
    await finalizeAuthSessionResponse(data as Record<string, unknown>);
  }
  return parseAuthLoginResult(data);
}

export async function authLoginMfa(body: {
  mfaToken: string;
  code?: string;
  recoveryCode?: string;
}): Promise<AuthSessionPayload> {
  assertAuthDomainNetworkAllowed();
  const traceId = newTraceId();
  const url = appendDiagTraceId(`${AUTH_BASE}/login/mfa`, traceId);
  let res: Response;
  try {
    res = IS_ECHO_TAURI_SHELL
      ? await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          credentials: 'include',
          body: (() => {
            const params = new URLSearchParams();
            params.set('diagTraceId', traceId);
            params.set('mfaToken', body.mfaToken.trim());
            const c = body.code?.trim();
            const r = body.recoveryCode?.trim();
            if (c) params.set('code', c);
            else if (r) params.set('recoveryCode', r);
            return params.toString();
          })(),
        })
      : await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...body, diagTraceId: traceId }),
        });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'login_mfa',
      traceId,
      url,
      method: 'POST',
      headers: IS_ECHO_TAURI_SHELL
        ? { 'Content-Type': 'application/x-www-form-urlencoded' }
        : { 'Content-Type': 'application/json' },
      error,
    });
    throw error;
  }
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/login/mfa');
  await finalizeAuthSessionResponse(data);
  const user = data.user;
  if (!user || typeof user !== 'object') {
    throw new Error('INVALID_LOGIN_RESPONSE');
  }
  return {
    user: user as AuthUserPublic,
  };
}

export async function authResendVerification(): Promise<void> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/resend-verification`, {
    method: 'POST',
    headers: echoCsrfHeaders(),
    credentials: 'include',
  });
  if (res.status === 204) return;
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/resend-verification');
}

export async function authTotpBegin(): Promise<{
  secretBase32: string;
  otpauthUrl: string;
}> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/2fa/totp/begin`, {
    method: 'POST',
    headers: echoCsrfHeaders(),
    credentials: 'include',
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/2fa/totp/begin');
  const secretBase32 =
    typeof data.secretBase32 === 'string' ? data.secretBase32 : '';
  const otpauthUrl = typeof data.otpauthUrl === 'string' ? data.otpauthUrl : '';
  if (!secretBase32 || !otpauthUrl)
    throw new Error('INVALID_TOTP_BEGIN_RESPONSE');
  return { secretBase32, otpauthUrl };
}

export async function authTotpConfirm(
  code: string,
): Promise<{ recoveryCodes: string[] }> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/2fa/totp/confirm`, {
    method: 'POST',
    headers: echoCsrfJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify({ code: code.trim() }),
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/2fa/totp/confirm');
  const raw = data.recoveryCodes;
  if (!Array.isArray(raw)) return { recoveryCodes: [] };
  const recoveryCodes = raw.filter((c): c is string => typeof c === 'string');
  return { recoveryCodes };
}

export async function authTotpDisable(body: {
  password: string;
  code?: string;
  recoveryCode?: string;
}): Promise<{ user: AuthUserPublic }> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/2fa/totp/disable`, {
    method: 'POST',
    headers: echoCsrfJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      password: body.password,
      ...(body.code !== undefined ? { code: body.code } : {}),
      ...(body.recoveryCode !== undefined
        ? { recoveryCode: body.recoveryCode }
        : {}),
    }),
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/2fa/totp/disable');
  const user = data.user;
  if (!user || typeof user !== 'object')
    throw new Error('INVALID_TOTP_DISABLE_RESPONSE');
  return { user: user as AuthUserPublic };
}

export async function authPhoneSendCode(): Promise<void> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/phone/send-code`, {
    method: 'POST',
    headers: echoCsrfHeaders(),
    credentials: 'include',
  });
  if (res.status === 204) return;
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/phone/send-code');
}

export async function authPhoneResendCode(): Promise<void> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/phone/resend-code`, {
    method: 'POST',
    headers: echoCsrfHeaders(),
    credentials: 'include',
  });
  if (res.status === 204) return;
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/phone/resend-code');
}

export async function authPhoneVerify(
  code: string,
): Promise<{ user: AuthUserPublic }> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/phone/verify`, {
    method: 'POST',
    headers: echoCsrfJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify({ code: code.trim() }),
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/phone/verify');
  const user = data.user;
  if (!user || typeof user !== 'object')
    throw new Error('INVALID_PHONE_VERIFY_RESPONSE');
  return { user: user as AuthUserPublic };
}

/**
 * Coalesce `/auth/me` calls from independent callers (component mounts, socket
 * reconnect handlers, `setSession()` post-hook, deeplink bootstrap, etc).
 *
 * Without this, the desktop app produces bursts of 3+ parallel `/auth/me`
 * every ~300 ms because each subsystem fires its own fetch with no shared
 * source of truth — visible as `/api/v1/auth/me` storms in the backend log.
 *
 * Behavior:
 *   - In-flight singleton: any caller arriving while a request is open awaits
 *     the same Promise (stops the parallel-burst pattern).
 *   - Short success cache (2s): callers within the dedupe window reuse the
 *     last successful result (stops rapid sequential refetches from mounts
 *     and watcher-triggered code paths).
 *   - Errors are NOT cached so failures can be retried immediately.
 *   - `invalidateAuthFetchMeCache()` is called from `authSession.setSession`
 *     and `clearLocalTokens` so login / logout / session swap always refetches.
 */
const AUTH_FETCH_ME_DEDUPE_MS = 2000;
let authFetchMeInFlight: Promise<{
  user: AuthUserPublic;
  planLimits?: EchoPlanLimitsPublic;
}> | null = null;
let authFetchMeCache: {
  result: { user: AuthUserPublic; planLimits?: EchoPlanLimitsPublic };
  expiresAt: number;
} | null = null;

export function invalidateAuthFetchMeCache(): void {
  authFetchMeCache = null;
}

export async function authFetchMe(): Promise<{
  user: AuthUserPublic;
  planLimits?: EchoPlanLimitsPublic;
}> {
  if (authFetchMeInFlight) return authFetchMeInFlight;
  const cached = authFetchMeCache;
  if (cached && Date.now() < cached.expiresAt) return cached.result;
  const pending: Promise<{
    user: AuthUserPublic;
    planLimits?: EchoPlanLimitsPublic;
  }> = authFetchMeInner().then((result) => {
    authFetchMeCache = {
      result,
      expiresAt: Date.now() + AUTH_FETCH_ME_DEDUPE_MS,
    };
    return result;
  });
  authFetchMeInFlight = pending;
  void pending.finally(() => {
    if (authFetchMeInFlight === pending) authFetchMeInFlight = null;
  });
  return pending;
}

async function authFetchMeInner(): Promise<{
  user: AuthUserPublic;
  planLimits?: EchoPlanLimitsPublic;
}> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/me`, {
    method: 'GET',
    credentials: 'include',
    headers: nativeAuthRequestHeaders(),
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  if (!res.ok && res.status === 401) {
    /* Anonymous or logged-out users: /me 401 then refresh 400 is normal; avoid dev console spam. */
    const refreshed = await authTryCookieRefresh({
      quietExpectedNoRefreshCookie: true,
    });
    if (refreshed) {
      echoAuthDebugLog('session recovered via cookie refresh', {
        userId: refreshed.id,
        username: refreshed.username,
      });
      return { user: refreshed };
    }
    echoAuthDebugLog('session recovery failed', {
      userMessage: 'Your saved login could not be verified. Sign in again.',
      hint: 'Verbose auth logging when enabled (dev or non-prod + VITE_ECHO_AUTH_DEBUG).',
    });
    /* Probe-only path: do not treat as “session ended” (avoids banner + analytics on every anonymous load). */
    notifyAuthClearLocalTokensProbe();
    const b = data as unknown as ApiErrorBody;
    throw new AuthApiError(res.status, {
      code: typeof b?.code === 'string' ? b.code : 'UNAUTHORIZED',
      message: typeof b?.message === 'string' ? b.message : res.statusText,
      ...(typeof b?.detail === 'string' ? { detail: b.detail } : {}),
    });
  }
  throwIfError(res, data, 'GET /auth/me');
  applyEchoCsrfFromAuthJson(data);
  const planLimitsRaw = (data as { planLimits?: unknown }).planLimits;
  const planLimits =
    planLimitsRaw && typeof planLimitsRaw === 'object'
      ? (planLimitsRaw as EchoPlanLimitsPublic)
      : undefined;
  return {
    user: data.user as AuthUserPublic,
    ...(planLimits ? { planLimits } : {}),
  };
}

export type AuthPatchMeBody = Partial<{
  email: string;
  /** National or E.164; server normalizes. Null clears pending only. */
  phone: string | null;
  /** Login handle (`@`) — normalized server-side. */
  username: string;
  displayName: string;
  pfp: string;
  status: AuthUserPublic['status'];
  customStatus: string;
  bio: string;
  bannerImage: string;
  bannerColor: string;
  bannerRefractionEnabled: boolean;
  bannerBlurEnabled: boolean;
  bannerBlackoutEnabled: boolean;
  bannerPositionY: number;
  /** Whether to show "last online" timestamp to other users. */
  showLastOnline: boolean;
  /** IANA timezone id for Magic Time. */
  timeZone: string | null;
  /** BCP-47 UI locale. */
  locale: string | null;
}>;

export async function authPatchMe(
  body: AuthPatchMeBody,
): Promise<{ user: AuthUserPublic }> {
  const traceId = newTraceId();
  const url = appendDiagTraceId(`${AUTH_BASE}/me`, traceId);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...echoCsrfJsonHeaders(),
        ...nativeAuthRequestHeaders(),
      },
      credentials: 'include',
      body: JSON.stringify({ ...body, diagTraceId: traceId }),
    });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'patch_me',
      traceId,
      url,
      method: 'PATCH',
      headers: echoCsrfJsonHeaders(),
      error,
    });
    throw error;
  }
  const data = (await parseJson(res)) as Record<string, unknown>;
  if (!res.ok && res.status === 401) {
    echoAuthLogRequestFailure('PATCH /auth/me', res, data, {
      willInvalidateSession: true,
    });
    invalidateSessionOn401(
      'Your session expired or is no longer valid. Sign in again.',
    );
    const b = data as unknown as ApiErrorBody;
    throw new AuthApiError(res.status, {
      code: typeof b?.code === 'string' ? b.code : 'UNAUTHORIZED',
      message: typeof b?.message === 'string' ? b.message : res.statusText,
      ...(typeof b?.detail === 'string' ? { detail: b.detail } : {}),
    });
  }
  throwIfError(res, data, 'PATCH /auth/me');
  return data as { user: AuthUserPublic };
}

export async function registerEchoPlusInterest(body: {
  tier?: EchoPlusInterestTier;
  billingCycle?: EchoPlusInterestBillingCycle;
}): Promise<{ interest: EchoPlusInterestPublic }> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/echo-plus-interest`, {
    method: 'PUT',
    headers: echoCsrfJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'PUT /auth/echo-plus-interest');
  return data as { interest: EchoPlusInterestPublic };
}

export async function removeEchoPlusInterest(): Promise<void> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/echo-plus-interest`, {
    method: 'DELETE',
    headers: echoCsrfHeaders(),
    credentials: 'include',
  });
  if (res.status === 204) return;
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'DELETE /auth/echo-plus-interest');
}

export async function authVerifyPassword(password: string): Promise<void> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/verify-password`, {
    method: 'POST',
    headers: echoCsrfJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify({ password }),
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/verify-password');
}

export async function authChangePassword(body: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: boolean; message?: string }> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/change-password`, {
    method: 'POST',
    headers: echoCsrfJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    }),
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /auth/change-password');
  return data as { success: boolean; message?: string };
}

export type AuthSessionInfo = {
  id: string;
  createdAt: string;
  expiresAt: string;
  /**
   * When the request used a browser session cookie, the API marks which refresh-token
   * row powers this client. Omitted for legacy bearer auth or unknown binding.
   */
  isCurrentSession?: boolean;
  /** Stored User-Agent when available; otherwise omit or null. */
  userAgent?: string | null;
  /** Approximate location from edge headers at sign-in; otherwise omit or null. */
  location?: string | null;
};

export async function authFetchSessions(): Promise<{
  sessions: AuthSessionInfo[];
}> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/sessions`, {
    method: 'GET',
    credentials: 'include',
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'GET /auth/sessions');
  return data as { sessions: AuthSessionInfo[] };
}

export async function authRevokeSession(sessionId: string): Promise<void> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/sessions/revoke`, {
    method: 'POST',
    headers: echoCsrfJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify({ sessionId }),
  });
  const parsed = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, parsed, 'POST /auth/sessions/revoke');
}

export async function authDeleteAccount(password: string): Promise<void> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/me`, {
    method: 'DELETE',
    headers: echoCsrfJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify({ password }),
  });
  if (res.status === 204) return;
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'DELETE /auth/me');
}

/** Revokes all refresh tokens server-side; caller should clear local client state. */
export async function authLogoutAllSessions(): Promise<void> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/logout`, {
    method: 'POST',
    headers: echoCsrfJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify({ allSessions: true }),
  });
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/logout (allSessions)');
}

export async function authLogout(refreshToken?: string | null): Promise<void> {
  const rt =
    refreshToken?.trim() ||
    (await getNativeRefreshTokenForLogout()) ||
    undefined;
  const body = rt ? { refreshToken: rt } : {};
  const res = await fetch(`${AUTH_BASE}/logout`, {
    method: 'POST',
    headers: {
      ...echoCsrfJsonHeaders(),
      ...nativeAuthRequestHeaders(),
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/logout');
}

export async function authForgotPassword(body: {
  email: string;
}): Promise<{ ok: boolean; message?: string }> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email: body.email.trim() }),
  });
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/forgot-password');
  return data as { ok: boolean; message?: string };
}

export async function authVerifyEmail(token: string): Promise<{ ok: boolean }> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token: token.trim() }),
  });
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/verify-email');
  return data as { ok: boolean };
}

export async function authResetPassword(body: {
  token: string;
  newPassword: string;
  totpCode?: string;
}): Promise<{ ok: boolean; message?: string }> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      token: body.token.trim(),
      newPassword: body.newPassword,
      ...(body.totpCode?.trim() ? { totpCode: body.totpCode.trim() } : {}),
    }),
  });
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/reset-password');
  return data as { ok: boolean; message?: string };
}

export async function authPasskeyRegisterOptions(): Promise<{
  options: Record<string, unknown>;
  challengeId: string;
}> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/passkey/register/options`, {
    method: 'POST',
    headers: echoCsrfHeaders(),
    credentials: 'include',
  });
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/passkey/register/options');
  return data as { options: Record<string, unknown>; challengeId: string };
}

export async function authPasskeyRegisterVerify(body: {
  challengeId: string;
  credential: Record<string, unknown>;
  label?: string;
}): Promise<void> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/passkey/register/verify`, {
    method: 'POST',
    headers: echoCsrfJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const parsed = await parseJson(res);
  throwIfError(res, parsed, 'POST /auth/passkey/register/verify');
}

export type AuthPasskeyCredential = {
  id: string;
  credentialIdB64: string;
  label: string;
  createdAt: string;
};

export async function authFetchPasskeys(): Promise<{
  passkeys: AuthPasskeyCredential[];
}> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/passkey/credentials`, {
    method: 'GET',
    credentials: 'include',
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'GET /auth/passkey/credentials');
  return data as { passkeys: AuthPasskeyCredential[] };
}

export async function authRevokePasskey(id: string): Promise<void> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/passkey/credentials/revoke`, {
    method: 'POST',
    headers: echoCsrfJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify({ id: id.trim() }),
  });
  const parsed = await parseJson(res);
  throwIfError(res, parsed, 'POST /auth/passkey/credentials/revoke');
}

export async function authRenamePasskey(
  id: string,
  label: string,
): Promise<void> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/passkey/credentials/rename`, {
    method: 'POST',
    headers: echoCsrfJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify({ id: id.trim(), label: label.trim() }),
  });
  const parsed = await parseJson(res);
  throwIfError(res, parsed, 'POST /auth/passkey/credentials/rename');
}

export async function authPasskeyLoginOptions(body: {
  username?: string;
  email?: string;
}): Promise<{ options: Record<string, unknown>; challengeId: string }> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/passkey/login/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      ...(body.username?.trim() ? { username: body.username.trim() } : {}),
      ...(body.email?.trim() ? { email: body.email.trim() } : {}),
    }),
  });
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/passkey/login/options');
  return data as { options: Record<string, unknown>; challengeId: string };
}

export async function authPasskeyLoginVerify(body: {
  challengeId: string;
  credential: Record<string, unknown>;
}): Promise<AuthLoginResult> {
  assertAuthDomainNetworkAllowed();
  const res = await fetch(`${AUTH_BASE}/passkey/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/passkey/login/verify');
  if (data && typeof data === 'object') {
    applyEchoCsrfFromAuthJson(data as Record<string, unknown>);
  }
  return parseAuthLoginResult(data);
}
