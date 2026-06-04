import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import {
  authPasskeyLoginOptions,
  authPasskeyRegisterOptions,
  authPasskeyRegisterVerify,
} from '@/api/authClient';

/** Server challenges expire in 10 minutes; refresh client cache earlier. */
const CEREMONY_CACHE_TTL_MS = 8 * 60 * 1000;

export type PasskeyLoginIdent = { username?: string; email?: string };

export class PasskeyCeremonyNotReadyError extends Error {
  readonly mode: 'login' | 'register';

  constructor(mode: 'login' | 'register') {
    super(
      mode === 'register'
        ? 'Passkey registration options are not ready yet.'
        : 'Passkey sign-in options are not ready yet.',
    );
    this.name = 'PasskeyCeremonyNotReadyError';
    this.mode = mode;
  }
}

type Timed<T> = { at: number; value: T };

let registerCache: Timed<{
  options: Record<string, unknown>;
  challengeId: string;
}> | null = null;

let loginCache: Timed<{
  options: Record<string, unknown>;
  challengeId: string;
  identKey: string;
}> | null = null;

function isFresh<T>(entry: Timed<T> | null): entry is Timed<T> {
  return !!entry && Date.now() - entry.at <= CEREMONY_CACHE_TTL_MS;
}

export function passkeyLoginIdentFromRaw(raw: string): PasskeyLoginIdent {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.includes('@')) return { email: trimmed };
  return { username: trimmed };
}

function loginIdentKey(ident: PasskeyLoginIdent): string {
  return `${ident.email ?? ''}\0${ident.username ?? ''}`;
}

export async function prefetchPasskeyRegistrationOptions(): Promise<void> {
  try {
    const value = await authPasskeyRegisterOptions();
    registerCache = { at: Date.now(), value };
  } catch {
    registerCache = null;
  }
}

export function getCachedPasskeyRegistrationOptions(): {
  options: Record<string, unknown>;
  challengeId: string;
} | null {
  if (!isFresh(registerCache)) {
    registerCache = null;
    return null;
  }
  return registerCache.value;
}

export function clearPasskeyRegistrationCache(): void {
  registerCache = null;
}

export async function prefetchPasskeyLoginOptions(
  ident: PasskeyLoginIdent = {},
): Promise<void> {
  const key = loginIdentKey(ident);
  try {
    const value = await authPasskeyLoginOptions(ident);
    loginCache = { at: Date.now(), value: { ...value, identKey: key } };
  } catch {
    if (loginCache?.value.identKey === key) loginCache = null;
  }
}

export function getCachedPasskeyLoginOptions(
  ident: PasskeyLoginIdent = {},
): { options: Record<string, unknown>; challengeId: string } | null {
  const key = loginIdentKey(ident);
  if (!isFresh(loginCache) || loginCache.value.identKey !== key) {
    if (loginCache?.value.identKey === key) loginCache = null;
    return null;
  }
  const { options, challengeId } = loginCache.value;
  return { options, challengeId };
}

export function clearPasskeyLoginCache(): void {
  loginCache = null;
}

/**
 * Runs WebAuthn registration. Options must be prefetched so Safari keeps the
 * click user-activation through to `credentials.create()` (no fetch/import first).
 */
export async function runPasskeyRegistrationCeremony(
  label?: string,
): Promise<void> {
  const cached = getCachedPasskeyRegistrationOptions();
  if (!cached) {
    throw new PasskeyCeremonyNotReadyError('register');
  }
  clearPasskeyRegistrationCache();

  const credential = (await startRegistration({
    optionsJSON:
      cached.options as unknown as PublicKeyCredentialCreationOptionsJSON,
  })) as RegistrationResponseJSON;

  await authPasskeyRegisterVerify({
    challengeId: cached.challengeId,
    credential: credential as unknown as Record<string, unknown>,
    label: label || undefined,
  });

  void prefetchPasskeyRegistrationOptions();
}

/**
 * Runs WebAuthn authentication. Prefer prefetched options (pointerdown / modal open).
 */
export async function runPasskeyAuthenticationCeremony(
  ident: PasskeyLoginIdent = {},
): Promise<{
  credential: AuthenticationResponseJSON;
  challengeId: string;
}> {
  let options: Record<string, unknown>;
  let challengeId: string;

  const cached = getCachedPasskeyLoginOptions(ident);
  if (cached) {
    clearPasskeyLoginCache();
    options = cached.options;
    challengeId = cached.challengeId;
  } else {
    const fetched = await authPasskeyLoginOptions(ident);
    options = fetched.options;
    challengeId = fetched.challengeId;
  }

  const credential = (await startAuthentication({
    optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
  })) as AuthenticationResponseJSON;

  return { credential, challengeId };
}
