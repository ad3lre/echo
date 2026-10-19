/** BCP-47 UI locales Echo supports today. Keep aligned with frontend `SUPPORTED_ECHO_UI_LOCALES`. */
export const SUPPORTED_ECHO_AUTH_LOCALES = [
  'en-US',
  'en-GB',
  'es',
  'pt-BR',
  'de',
] as const;

export type EchoAuthLocale = (typeof SUPPORTED_ECHO_AUTH_LOCALES)[number];

export function normalizeEchoAuthLocale(value: unknown): EchoAuthLocale | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase().replace(/_/g, '-');
  if (lower === 'en-gb') return 'en-GB';
  if (lower.startsWith('en')) return 'en-US';
  if (lower === 'pt-br' || lower === 'pt') return 'pt-BR';
  if (lower.startsWith('pt-')) return 'pt-BR';
  if (lower === 'de' || lower.startsWith('de-')) return 'de';
  if (lower === 'es' || lower.startsWith('es-')) return 'es';
  if ((SUPPORTED_ECHO_AUTH_LOCALES as readonly string[]).includes(trimmed)) {
    return trimmed as EchoAuthLocale;
  }
  return null;
}

export function assertEchoAuthLocale(value: unknown): EchoAuthLocale {
  const normalized = normalizeEchoAuthLocale(value);
  if (!normalized) throw new Error('INVALID_LOCALE');
  return normalized;
}
