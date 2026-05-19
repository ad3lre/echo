import { authenticator } from 'otplib';

/** ±1 standard 30s TOTP step via epoch tolerance (seconds). */
const TOTP_EPOCH_TOLERANCE_SEC = 30;

export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const t = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(t)) return false;
  const previousWindow = authenticator.options.window;
  try {
    authenticator.options = {
      ...authenticator.options,
      window: Math.max(1, Math.floor(TOTP_EPOCH_TOLERANCE_SEC / 30)),
    };
    return authenticator.verify({ secret: secretBase32, token: t });
  } catch {
    return false;
  } finally {
    authenticator.options = {
      ...authenticator.options,
      window: previousWindow,
    };
  }
}

export function generateTotpSecretBase32(): string {
  return authenticator.generateSecret();
}

export function buildTotpKeyUri(params: {
  secretBase32: string;
  accountLabel: string;
  issuer: string;
}): string {
  return authenticator.keyuri(
    params.accountLabel,
    params.issuer,
    params.secretBase32,
  );
}
