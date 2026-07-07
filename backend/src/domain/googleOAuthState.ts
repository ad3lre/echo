import { randomBytes } from 'crypto';
import {
  oauthCookieIntegrityTag,
  oauthCookieIntegrityTagsEqual,
} from '../auth/oauthCookieIntegrity';
import { config } from '../config';

const COOKIE_NAME = 'echo_google_oauth';
const MAX_AGE_SEC = 600;

export type GoogleOAuthLinkPayload = {
  flow: 'link';
  userId: string;
  state: string;
  pkceVerifier: string;
  exp: number;
};
export type GoogleOAuthLoginPayload = {
  flow: 'login';
  state: string;
  pkceVerifier: string;
  exp: number;
  desktopHandoff?: boolean;
  desktopHandoffNonceHash?: string;
};
export type DecodedGoogleOAuthCookie =
  | GoogleOAuthLinkPayload
  | GoogleOAuthLoginPayload;

function signPayload(
  mode: 'link' | 'login',
  userId: string,
  state: string,
  pkceVerifier: string,
  exp: number,
  desktopHandoffNonceHash?: string,
): string {
  const tail =
    mode === 'login' &&
    typeof desktopHandoffNonceHash === 'string' &&
    desktopHandoffNonceHash
      ? `\n${desktopHandoffNonceHash}`
      : '';
  const payload = `${mode}\n${userId}\n${state}\n${pkceVerifier}\n${exp}${tail}`;
  return oauthCookieIntegrityTag(config.jwtSecret, payload);
}

export function encodeGoogleOAuthLinkCookieValue(
  userId: string,
  state: string,
  pkceVerifier: string,
  exp: number,
): string {
  const body = Buffer.from(
    JSON.stringify({
      m: 'link' as const,
      u: userId,
      s: state,
      v: pkceVerifier,
      e: exp,
    }),
    'utf8',
  ).toString('base64url');
  const sig = signPayload('link', userId, state, pkceVerifier, exp);
  return `${body}.${sig}`;
}

export function encodeGoogleOAuthLoginCookieValue(
  state: string,
  pkceVerifier: string,
  exp: number,
  opts?: { desktopHandoffNonceHash?: string },
): string {
  const h = opts?.desktopHandoffNonceHash?.trim().toLowerCase();
  const bodyObj: Record<string, unknown> = {
    m: 'login' as const,
    s: state,
    v: pkceVerifier,
    e: exp,
  };
  if (h && /^[0-9a-f]{64}$/.test(h)) {
    bodyObj.h = h;
  }
  const body = Buffer.from(JSON.stringify(bodyObj), 'utf8').toString(
    'base64url',
  );
  const sig = signPayload('login', '', state, pkceVerifier, exp, h);
  return `${body}.${sig}`;
}

export function decodeGoogleOAuthCookieValue(
  raw: string,
): DecodedGoogleOAuthCookie | null {
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [bodyB64, sig] = parts;
  if (!bodyB64 || !sig) return null;
  let parsed: {
    m?: string;
    u?: string;
    s?: string;
    v?: string;
    e?: number;
    h?: string;
  };
  try {
    parsed = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8')) as {
      m?: string;
      u?: string;
      s?: string;
      v?: string;
      e?: number;
      h?: string;
    };
  } catch {
    return null;
  }
  const state = typeof parsed.s === 'string' ? parsed.s : '';
  const pkceVerifier = typeof parsed.v === 'string' ? parsed.v : '';
  const exp = typeof parsed.e === 'number' ? parsed.e : 0;
  if (!state || !pkceVerifier || !exp) return null;
  if (Date.now() > exp) return null;

  if (parsed.m === 'login') {
    const hRaw =
      typeof parsed.h === 'string' ? parsed.h.trim().toLowerCase() : '';
    const h = /^[0-9a-f]{64}$/.test(hRaw) ? hRaw : undefined;
    const expect = signPayload('login', '', state, pkceVerifier, exp, h);
    if (!oauthCookieIntegrityTagsEqual(expect, sig)) return null;
    if (h) {
      return {
        flow: 'login',
        state,
        pkceVerifier,
        exp,
        desktopHandoff: true,
        desktopHandoffNonceHash: h,
      };
    }
    return { flow: 'login', state, pkceVerifier, exp };
  }

  if (parsed.m === 'link') {
    const userId = typeof parsed.u === 'string' ? parsed.u : '';
    if (!userId) return null;
    const expect = signPayload('link', userId, state, pkceVerifier, exp);
    if (!oauthCookieIntegrityTagsEqual(expect, sig)) return null;
    return { flow: 'link', userId, state, pkceVerifier, exp };
  }

  return null;
}

export function createGoogleOAuthState(): string {
  return randomBytes(24).toString('hex');
}

export function googleOAuthCookieName(): typeof COOKIE_NAME {
  return COOKIE_NAME;
}

export function googleOAuthCookieMaxAgeSec(): number {
  return MAX_AGE_SEC;
}

/** Signed `state` for Google login — survives system-browser OAuth when API cookies do not. */
export type GoogleLoginSignedState = {
  exp: number;
  desktopHandoff: boolean;
  desktopHandoffNonceHash?: string;
  pkceVerifier: string;
};

function signGoogleLoginStateV1(bodyB64url: string): string {
  return oauthCookieIntegrityTag(
    config.jwtSecret,
    `google_login_oauth_state_v1|${bodyB64url}`,
  );
}

export function encodeGoogleLoginSignedState(
  desktopHandoff: boolean,
  desktopHandoffNonceHash: string | undefined,
  pkceVerifier: string,
): { stateForGoogle: string; exp: number } {
  const exp = Date.now() + googleOAuthCookieMaxAgeSec() * 1000;
  const nonceHash =
    desktopHandoff && desktopHandoffNonceHash
      ? desktopHandoffNonceHash.trim().toLowerCase()
      : '';
  const body = Buffer.from(
    JSON.stringify({
      n: randomBytes(24).toString('hex'),
      e: exp,
      dh: desktopHandoff,
      ...(nonceHash ? { nh: nonceHash } : {}),
      v: pkceVerifier,
    }),
    'utf8',
  ).toString('base64url');
  const sig = signGoogleLoginStateV1(body);
  return { stateForGoogle: `${body}.${sig}`, exp };
}

export function decodeGoogleLoginSignedState(
  stateForGoogle: string,
): GoogleLoginSignedState | null {
  const trimmed = stateForGoogle.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0) return null;
  const bodyB64 = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  if (!bodyB64 || !sig) return null;
  const expect = signGoogleLoginStateV1(bodyB64);
  if (!oauthCookieIntegrityTagsEqual(expect, sig)) return null;
  let parsed: {
    n?: string;
    e?: number;
    dh?: boolean;
    nh?: string;
    v?: string;
  };
  try {
    parsed = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8')) as {
      n?: string;
      e?: number;
      dh?: boolean;
      nh?: string;
      v?: string;
    };
  } catch {
    return null;
  }
  if (typeof parsed.n !== 'string' || !parsed.n) return null;
  if (typeof parsed.e !== 'number' || !Number.isFinite(parsed.e)) return null;
  if (Date.now() > parsed.e) return null;
  const pkceVerifier = typeof parsed.v === 'string' ? parsed.v : '';
  if (!pkceVerifier) return null;
  const nonceHash =
    typeof parsed.nh === 'string' ? parsed.nh.trim().toLowerCase() : '';
  if (parsed.dh === true && !/^[0-9a-f]{64}$/.test(nonceHash)) {
    return null;
  }
  return {
    exp: parsed.e,
    desktopHandoff: parsed.dh === true,
    pkceVerifier,
    ...(nonceHash ? { desktopHandoffNonceHash: nonceHash } : {}),
  };
}
