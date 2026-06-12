import type { ApiErrorBody } from '@shared/types/api';
import { translateApiErrorBody } from '@/i18n/apiErrors';
import { API_BASE, IS_ECHO_TAURI_SHELL } from '@/config';
import { applyEchoCsrfFromAuthJson } from '@/utils/echoCsrf';
import { applyNativeAuthFromAuthJson } from '@/services/auth/nativeAuthToken';
import {
  echoClientDebugEnabled,
  echoClientDebugError,
} from '@/utils/echoClientDebug';

export const AUTH_BASE = `${API_BASE.replace(/\/$/, '')}/api/v1/auth`;

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
  /** Profile "about me" (server-persisted). */
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

export function appendDiagTraceId(url: string, traceId: string): string {
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

export function logAuthNetworkFailure(params: {
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

/** Legacy no-op - auth always uses the real `/api/v1/auth/*` surface. */
export function assertAuthDomainNetworkAllowed(): void {}

export async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

export function throwIfError(
  res: Response,
  data: unknown,
  operation: string,
): void {
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
      label: 'GET /discord/login/start (desktop -> system browser)',
      href: `${base}/discord/login/start`,
    },
    {
      label: 'POST /desktop/redeem-handoff',
      href: `${base}/desktop/redeem-handoff`,
    },
    { label: 'GET /discord/callback', href: `${base}/discord/callback` },
  ];
}

export async function finalizeAuthSessionResponse(
  data: Record<string, unknown>,
): Promise<void> {
  applyEchoCsrfFromAuthJson(data);
  await applyNativeAuthFromAuthJson(data);
}
