import { TURNSTILE_VERIFY_MS } from '../../constants/outboundHttp';
import { config } from '../../config';

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  const secret = config.turnstileSecretKey.trim();
  const siteKey = config.turnstileSiteKey.trim();
  // Fail closed when the UI exposes Turnstile but the server secret is missing.
  if (!secret) return siteKey.length === 0;
  const t = token.trim();
  if (!t) return false;
  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', t);
    const ip = remoteIp?.trim();
    if (ip) body.set('remoteip', ip);
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        signal: AbortSignal.timeout(TURNSTILE_VERIFY_MS),
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
