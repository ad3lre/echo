import { parsePhoneNumberWithError } from 'libphonenumber-js';
import type { CountryCode } from 'libphonenumber-js';
import { config } from '../config';

/** Parse and validate; returns E.164 including leading + or null. */
export function normalizeInputToE164(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const p = parsePhoneNumberWithError(
      t,
      config.echoSmsDefaultRegion as CountryCode,
    );
    if (!p.isValid()) return null;
    return p.number;
  } catch {
    return null;
  }
}

export function maskE164(e164: string): string {
  const d = e164.replace(/\D/g, '');
  if (d.length <= 4) return '****';
  return `******${d.slice(-4)}`;
}
