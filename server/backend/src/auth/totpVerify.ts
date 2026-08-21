import { generateSecret, generateURI, verifySync } from 'otplib';

/** ±1 standard 30s TOTP step via epoch tolerance (seconds). */
const TOTP_EPOCH_TOLERANCE_SEC = 30;

export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const t = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(t)) return false;
  try {
    return verifySync({
      secret: secretBase32,
      token: t,
      epochTolerance: TOTP_EPOCH_TOLERANCE_SEC,
    }).valid;
  } catch {
    return false;
  }
}

export function generateTotpSecretBase32(): string {
  return generateSecret();
}

export function buildTotpKeyUri(params: {
  secretBase32: string;
  accountLabel: string;
  issuer: string;
}): string {
  return generateURI({
    issuer: params.issuer,
    label: params.accountLabel,
    secret: params.secretBase32,
  });
}
