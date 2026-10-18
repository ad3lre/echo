import { newTraceId } from '@/observability/sessionDiagnostics';
import { echoClientDebugError } from '@/features/layout/ids/echoClientDebug';
import type { AuthUserPublic } from './authClientCore';
import {
  AUTH_BASE,
  appendDiagTraceId,
  assertAuthDomainNetworkAllowed,
  authDebugEnabled,
  finalizeAuthSessionResponse,
  logAuthNetworkFailure,
  parseJson,
  throwIfError,
} from './authClientCore';

export type AuthSessionPayload = {
  user: AuthUserPublic;
};

export type AuthLoginMfaChallenge = {
  mfaRequired: true;
  mfaToken: string;
  user: { id: string; username: string };
};

export type AuthLoginEmailVerificationChallenge = {
  emailVerificationRequired: true;
  loginToken: string;
  maskedEmail: string;
  user: { id: string; username: string };
};

export type AuthLoginEmailIpChallenge = {
  emailIpVerificationRequired: true;
  loginToken: string;
  maskedEmail: string;
  user: { id: string; username: string };
};

export type AuthLoginResult =
  | AuthSessionPayload
  | AuthLoginMfaChallenge
  | AuthLoginEmailVerificationChallenge
  | AuthLoginEmailIpChallenge;

export function isAuthLoginMfaChallenge(
  r: AuthLoginResult,
): r is AuthLoginMfaChallenge {
  return 'mfaRequired' in r && r.mfaRequired === true;
}

export function isAuthLoginEmailVerificationChallenge(
  r: AuthLoginResult,
): r is AuthLoginEmailVerificationChallenge {
  return (
    'emailVerificationRequired' in r && r.emailVerificationRequired === true
  );
}

export function isAuthLoginEmailIpChallenge(
  r: AuthLoginResult,
): r is AuthLoginEmailIpChallenge {
  return (
    'emailIpVerificationRequired' in r && r.emailIpVerificationRequired === true
  );
}

function parseChallengeUser(u: unknown): { id: string; username: string } {
  if (!u || typeof u !== 'object') throw new Error('INVALID_LOGIN_RESPONSE');
  const user = u as Record<string, unknown>;
  const id = typeof user.id === 'string' ? user.id : '';
  const username = typeof user.username === 'string' ? user.username : '';
  if (!id || !username) throw new Error('INVALID_LOGIN_RESPONSE');
  return { id, username };
}

/** Parse successful login / register challenge JSON. Exported for unit tests. */
export function parseAuthLoginResult(data: unknown): AuthLoginResult {
  if (!data || typeof data !== 'object') {
    throw new Error('INVALID_LOGIN_RESPONSE');
  }
  const o = data as Record<string, unknown>;
  if (o.emailVerificationRequired === true) {
    const loginToken =
      typeof o.loginToken === 'string' ? o.loginToken.trim() : '';
    const maskedEmail =
      typeof o.maskedEmail === 'string' ? o.maskedEmail.trim() : '';
    if (!loginToken) throw new Error('INVALID_LOGIN_RESPONSE');
    return {
      emailVerificationRequired: true,
      loginToken,
      maskedEmail,
      user: parseChallengeUser(o.user),
    };
  }
  if (o.emailIpVerificationRequired === true) {
    const loginToken =
      typeof o.loginToken === 'string' ? o.loginToken.trim() : '';
    const maskedEmail =
      typeof o.maskedEmail === 'string' ? o.maskedEmail.trim() : '';
    if (!loginToken) throw new Error('INVALID_LOGIN_RESPONSE');
    return {
      emailIpVerificationRequired: true,
      loginToken,
      maskedEmail,
      user: parseChallengeUser(o.user),
    };
  }
  if (o.mfaRequired === true) {
    const mfaToken = typeof o.mfaToken === 'string' ? o.mfaToken.trim() : '';
    if (!mfaToken) throw new Error('INVALID_LOGIN_RESPONSE');
    return {
      mfaRequired: true,
      mfaToken,
      user: parseChallengeUser(o.user),
    };
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
    res = await fetch(appendDiagTraceId(`${AUTH_BASE}/login`, traceId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...body, diagTraceId: traceId }),
    });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'login',
      traceId,
      url: appendDiagTraceId(`${AUTH_BASE}/login`, traceId),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  const parsed = parseAuthLoginResult(data);
  if (
    !isAuthLoginMfaChallenge(parsed) &&
    !isAuthLoginEmailVerificationChallenge(parsed) &&
    !isAuthLoginEmailIpChallenge(parsed) &&
    data &&
    typeof data === 'object'
  ) {
    await finalizeAuthSessionResponse(data as Record<string, unknown>);
  }
  return parsed;
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
    res = await fetch(url, {
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
      headers: { 'Content-Type': 'application/json' },
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

export async function authLoginEmailIpCode(body: {
  loginToken: string;
  code: string;
}): Promise<AuthLoginResult> {
  assertAuthDomainNetworkAllowed();
  const traceId = newTraceId();
  const url = appendDiagTraceId(`${AUTH_BASE}/login/email-ip-code`, traceId);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...body, diagTraceId: traceId }),
    });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'login_email_ip_code',
      traceId,
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      error,
    });
    throw error;
  }
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/login/email-ip-code');
  const parsed = parseAuthLoginResult(data);
  if (
    !isAuthLoginMfaChallenge(parsed) &&
    !isAuthLoginEmailVerificationChallenge(parsed) &&
    !isAuthLoginEmailIpChallenge(parsed) &&
    data &&
    typeof data === 'object'
  ) {
    await finalizeAuthSessionResponse(data as Record<string, unknown>);
  }
  return parsed;
}

export async function authLoginEmailIpResend(body: {
  loginToken: string;
}): Promise<AuthLoginEmailIpChallenge> {
  assertAuthDomainNetworkAllowed();
  const traceId = newTraceId();
  const url = appendDiagTraceId(`${AUTH_BASE}/login/email-ip-resend`, traceId);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...body, diagTraceId: traceId }),
    });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'login_email_ip_resend',
      traceId,
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      error,
    });
    throw error;
  }
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/login/email-ip-resend');
  const parsed = parseAuthLoginResult(data);
  if (!isAuthLoginEmailIpChallenge(parsed)) {
    throw new Error('INVALID_LOGIN_RESPONSE');
  }
  return parsed;
}

export async function authLoginResendVerification(body: {
  loginToken: string;
}): Promise<void> {
  assertAuthDomainNetworkAllowed();
  const traceId = newTraceId();
  const url = appendDiagTraceId(
    `${AUTH_BASE}/login/resend-verification`,
    traceId,
  );
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...body, diagTraceId: traceId }),
    });
  } catch (error) {
    logAuthNetworkFailure({
      operation: 'login_resend_verification',
      traceId,
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      error,
    });
    throw error;
  }
  if (res.status === 204) return;
  const data = await parseJson(res);
  throwIfError(res, data, 'POST /auth/login/resend-verification');
}
