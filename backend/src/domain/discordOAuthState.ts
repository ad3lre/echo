import { randomBytes } from 'crypto';
import {
  oauthCookieIntegrityTag,
  oauthCookieIntegrityTagsEqual,
} from '../auth/oauthCookieIntegrity';
import { config } from '../config';
const COOKIE_NAME = 'echo_discord_oauth';
const MAX_AGE_SEC = 600;

/** @deprecated Use DecodedDiscordOAuthCookie */
export type DiscordOAuthCookiePayload = {
  userId: string;
  state: string;
  exp: number;
};

export type DiscordOAuthLinkPayload = {
  flow: 'link';
  userId: string;
  state: string;
  exp: number;
};
export type DiscordOAuthLoginPayload = {
  flow: 'login';
  state: string;
  exp: number;
};
export type DecodedDiscordOAuthCookie =
  | DiscordOAuthLinkPayload
  | DiscordOAuthLoginPayload;

/** Legacy HMAC: `${userId}\n${state}\n${exp}` */
function signPayloadLegacy(userId: string, state: string, exp: number): string {
  const payload = `${userId}\n${state}\n${exp}`;
  return oauthCookieIntegrityTag(config.jwtSecret, payload);
}

/** Current HMAC: `${mode}\n${userId}\n${state}\n${exp}` (userId empty for login). */
function signPayloadV2(
  mode: 'link' | 'login',
  userId: string,
  state: string,
  exp: number,
): string {
  const payload = `${mode}\n${userId}\n${state}\n${exp}`;
  return oauthCookieIntegrityTag(config.jwtSecret, payload);
}

/** Link Discord to the signed-in Echo account (Settings flow). */
export function encodeDiscordOAuthLinkCookieValue(
  userId: string,
  state: string,
  exp: number,
): string {
  const body = Buffer.from(
    JSON.stringify({ m: 'link' as const, u: userId, s: state, e: exp }),
    'utf8',
  ).toString('base64url');
  const sig = signPayloadV2('link', userId, state, exp);
  return `${body}.${sig}`;
}

/** @deprecated Use encodeDiscordOAuthLinkCookieValue */
export function encodeDiscordOAuthCookieValue(
  userId: string,
  state: string,
  exp: number,
): string {
  return encodeDiscordOAuthLinkCookieValue(userId, state, exp);
}

/** Signed `state` sent to Discord for the login modal flow. */
export function encodeDiscordLoginSignedState(): {
  stateForDiscord: string;
  exp: number;
} {
  const nonce = randomBytes(24).toString('hex');
  const exp = Date.now() + discordOAuthCookieMaxAgeSec() * 1000;
  const body = Buffer.from(
    JSON.stringify({ n: nonce, e: exp }),
    'utf8',
  ).toString('base64url');
  const sig = signDiscordLoginStateV1(body);
  return { stateForDiscord: `${body}.${sig}`, exp };
}

export type DiscordLoginSignedState = {
  exp: number;
};

function signDiscordLoginStateV1(bodyB64url: string): string {
  return oauthCookieIntegrityTag(
    config.jwtSecret,
    `discord_login_oauth_state_v1|${bodyB64url}`,
  );
}

export function decodeDiscordLoginSignedState(
  stateForDiscord: string,
): DiscordLoginSignedState | null {
  const trimmed = stateForDiscord.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0) return null;
  const bodyB64 = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  if (!bodyB64 || !sig) return null;
  const expect = signDiscordLoginStateV1(bodyB64);
  if (!oauthCookieIntegrityTagsEqual(expect, sig)) return null;
  let parsed: { n?: string; e?: number };
  try {
    parsed = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8')) as {
      n?: string;
      e?: number;
    };
  } catch {
    return null;
  }
  if (typeof parsed.n !== 'string' || !parsed.n) return null;
  if (typeof parsed.e !== 'number' || !Number.isFinite(parsed.e)) return null;
  if (Date.now() > parsed.e) return null;
  return { exp: parsed.e };
}

/** Sign in with Discord (login modal): `state` is the opaque string passed as Discord OAuth `state`. */
export function encodeDiscordOAuthLoginCookieValue(
  stateForDiscord: string,
  exp: number,
): string {
  const body = Buffer.from(
    JSON.stringify({ m: 'login' as const, s: stateForDiscord, e: exp }),
    'utf8',
  ).toString('base64url');
  const sig = signPayloadV2('login', '', stateForDiscord, exp);
  return `${body}.${sig}`;
}

export function decodeDiscordOAuthCookieValue(
  raw: string,
): DecodedDiscordOAuthCookie | null {
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [bodyB64, sig] = parts;
  if (!bodyB64 || !sig) return null;
  let parsed: { m?: string; u?: string; s?: string; e?: number };
  try {
    parsed = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8')) as {
      m?: string;
      u?: string;
      s?: string;
      e?: number;
    };
  } catch {
    return null;
  }
  const state = typeof parsed.s === 'string' ? parsed.s : '';
  const exp = typeof parsed.e === 'number' ? parsed.e : 0;
  if (!state || !exp) return null;
  if (Date.now() > exp) return null;

  if (parsed.m === 'login') {
    const expect = signPayloadV2('login', '', state, exp);
    if (!oauthCookieIntegrityTagsEqual(expect, sig)) return null;
    return { flow: 'login', state, exp };
  }

  if (parsed.m === 'link') {
    const userId = typeof parsed.u === 'string' ? parsed.u : '';
    if (!userId) return null;
    const expect = signPayloadV2('link', userId, state, exp);
    if (!oauthCookieIntegrityTagsEqual(expect, sig)) return null;
    return { flow: 'link', userId, state, exp };
  }

  /* Legacy body: { u, s, e } without m */
  const userId = typeof parsed.u === 'string' ? parsed.u : '';
  if (!userId) return null;
  const expect = signPayloadLegacy(userId, state, exp);
  if (!oauthCookieIntegrityTagsEqual(expect, sig)) return null;
  return { flow: 'link', userId, state, exp };
}

export function createDiscordOAuthState(): string {
  return randomBytes(24).toString('hex');
}

export function discordOAuthCookieName(): typeof COOKIE_NAME {
  return COOKIE_NAME;
}

export function discordOAuthCookieMaxAgeSec(): number {
  return MAX_AGE_SEC;
}
