import { randomBytes } from 'crypto';
import {
  oauthCookieIntegrityTag,
  oauthCookieIntegrityTagsEqual,
} from '../../auth/oauthCookieIntegrity';
import { config } from '../../config';

const COOKIE_NAME = 'echo_youtube_oauth';
const MAX_AGE_SEC = 600;

export type YoutubeOAuthLinkPayload = {
  flow: 'link';
  userId: string;
  state: string;
  pkceVerifier: string;
  exp: number;
};

function signPayload(
  userId: string,
  state: string,
  pkceVerifier: string,
  exp: number,
): string {
  const payload = `youtube_link\n${userId}\n${state}\n${pkceVerifier}\n${exp}`;
  return oauthCookieIntegrityTag(config.jwtSecret, payload);
}

export function createYoutubeOAuthState(): string {
  return randomBytes(24).toString('hex');
}

export function encodeYoutubeOAuthLinkCookieValue(
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
  const sig = signPayload(userId, state, pkceVerifier, exp);
  return `${body}.${sig}`;
}

export function decodeYoutubeOAuthCookieValue(
  raw: string,
): YoutubeOAuthLinkPayload | null {
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
  };
  try {
    parsed = JSON.parse(
      Buffer.from(bodyB64, 'base64url').toString('utf8'),
    ) as typeof parsed;
  } catch {
    return null;
  }
  if (
    parsed.m !== 'link' ||
    typeof parsed.u !== 'string' ||
    typeof parsed.s !== 'string' ||
    typeof parsed.v !== 'string' ||
    typeof parsed.e !== 'number'
  ) {
    return null;
  }
  const expected = signPayload(parsed.u, parsed.s, parsed.v, parsed.e);
  if (!oauthCookieIntegrityTagsEqual(expected, sig)) return null;
  if (parsed.e < Date.now()) return null;
  return {
    flow: 'link',
    userId: parsed.u,
    state: parsed.s,
    pkceVerifier: parsed.v,
    exp: parsed.e,
  };
}

export function youtubeOAuthCookieName(): string {
  return COOKIE_NAME;
}

export function youtubeOAuthCookieMaxAgeSec(): number {
  return MAX_AGE_SEC;
}
