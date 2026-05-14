import { config } from '../../config';

export type FetchLike = (
  input: Request | string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token: string;
};

export type GoogleUserInfo = {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
  locale?: string;
};

export function buildGoogleAuthorizeUrl(
  state: string,
  promptConsent: boolean = false,
  codeChallenge?: string,
): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', config.googleOauthClientId);
  u.searchParams.set('redirect_uri', config.googleOauthRedirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', config.googleOauthScopes);
  u.searchParams.set('state', state);
  u.searchParams.set('access_type', 'offline');
  if (codeChallenge?.trim()) {
    u.searchParams.set('code_challenge', codeChallenge.trim());
    u.searchParams.set('code_challenge_method', 'S256');
  }
  if (promptConsent) {
    u.searchParams.set('prompt', 'consent');
  }
  return u.toString();
}

export async function exchangeGoogleOAuthCode(
  code: string,
  redirectUri: string,
  codeVerifier: string | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.googleOauthClientId,
    client_secret: config.googleOauthClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  if (codeVerifier?.trim()) {
    body.set('code_verifier', codeVerifier.trim());
  }
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = (await res.json()) as GoogleTokenResponse & { error?: string };
  if (!res.ok) {
    throw new Error(
      `google_token_exchange_failed:${data?.error ?? res.status}`,
    );
  }
  if (!data.access_token) throw new Error('google_token_missing');
  return data;
}

export async function fetchGoogleUserInfo(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleUserInfo> {
  const res = await fetchImpl(
    'https://openidconnect.googleapis.com/v1/userinfo',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!res.ok) {
    throw new Error(`google_userinfo_failed:${res.status}`);
  }
  return (await res.json()) as GoogleUserInfo;
}
