import { createI18n, type I18n } from 'vue-i18n';

type LocaleNamespaces = Record<string, Record<string, unknown>>;

/**
 * Namespaces are auto-discovered from `locales/<locale>/*.json` (file name = namespace).
 * `errors.json` is nested under `errors.api` for historical key compatibility.
 */
function buildMessages(modules: Record<string, unknown>): LocaleNamespaces {
  const out: LocaleNamespaces = {};
  for (const [file, mod] of Object.entries(modules)) {
    const ns = file.replace(/^.*\//, '').replace(/\.json$/, '');
    const data = ((mod as { default?: unknown }).default ?? mod) as Record<
      string,
      unknown
    >;
    if (ns === 'errors') out.errors = { api: data };
    else out[ns] = data;
  }
  return out;
}

const enUsModules = import.meta.glob('./locales/en-US/*.json', {
  eager: true,
});
const ptBrModules = import.meta.glob('./locales/pt-BR/*.json', {
  eager: true,
});

/** BCP-47 locales with UI message catalogs. */
export const SUPPORTED_ECHO_UI_LOCALES = [
  'en-US',
  'en-GB',
  'pt-BR',
  'de',
] as const;
export type EchoUiLocale = (typeof SUPPORTED_ECHO_UI_LOCALES)[number];

export const DEFAULT_ECHO_LOCALE: EchoUiLocale = 'en-US';

/** German loads lazily (separate chunks) — only users on `de` pay for it. */
const deModuleLoaders = import.meta.glob('./locales/de/*.json');

async function loadDeMessages(): Promise<LocaleNamespaces> {
  const entries = await Promise.all(
    Object.entries(deModuleLoaders).map(
      async ([file, load]) => [file, await load()] as const,
    ),
  );
  return buildMessages(Object.fromEntries(entries));
}

const enUsMessages = buildMessages(enUsModules);
const ptBrMessages = buildMessages(ptBrModules);

const localeLoaders: Record<
  EchoUiLocale,
  () => Promise<{ default: Record<string, string | Record<string, unknown>> }>
> = {
  'en-US': () => Promise.resolve({ default: enUsMessages }),
  'en-GB': () => import('./locales/en-GB.json'),
  'pt-BR': () => Promise.resolve({ default: ptBrMessages }),
  de: async () => ({
    default: (await loadDeMessages()) as Record<
      string,
      string | Record<string, unknown>
    >,
  }),
};

export const i18n: I18n = createI18n({
  legacy: false,
  locale: DEFAULT_ECHO_LOCALE,
  fallbackLocale: DEFAULT_ECHO_LOCALE,
  messages: {
    'en-US': enUsMessages as Record<string, string | Record<string, unknown>>,
  },
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
});

export function isEchoUiLocale(value: unknown): value is EchoUiLocale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_ECHO_UI_LOCALES as readonly string[]).includes(value)
  );
}

export function normalizeEchoUiLocale(value: unknown): EchoUiLocale {
  if (isEchoUiLocale(value)) return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().replace(/_/g, '-');
    if (lower === 'en-gb') return 'en-GB';
    if (lower.startsWith('en')) return 'en-US';
    if (lower === 'pt-br' || lower === 'pt' || lower.startsWith('pt-')) {
      return 'pt-BR';
    }
    if (lower === 'de' || lower.startsWith('de-')) return 'de';
  }
  return DEFAULT_ECHO_LOCALE;
}

export function resolveBrowserEchoLocale(): EchoUiLocale {
  if (typeof navigator === 'undefined') return DEFAULT_ECHO_LOCALE;
  const lang = navigator.language?.trim();
  if (!lang) return DEFAULT_ECHO_LOCALE;
  return normalizeEchoUiLocale(lang);
}

export async function ensureEchoLocaleLoaded(
  locale: EchoUiLocale,
): Promise<void> {
  if (i18n.global.availableLocales.includes(locale)) return;
  const mod = await localeLoaders[locale]();
  i18n.global.setLocaleMessage(locale, mod.default);
}

export async function setEchoLocale(locale: EchoUiLocale): Promise<void> {
  const normalized = normalizeEchoUiLocale(locale);
  await ensureEchoLocaleLoaded(normalized);
  if (typeof i18n.global.locale === 'string') {
    i18n.global.locale = normalized;
  } else {
    i18n.global.locale.value = normalized;
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = normalized;
  }
}

/** Translate outside Vue setup / components (after i18n is installed). */
export function echoT(key: string, values?: Record<string, unknown>): string {
  const t = i18n.global.t as (
    key: string,
    values?: Record<string, unknown>,
  ) => string;
  return t(key, values ?? {});
}

export function useEchoI18n() {
  return {
    t: echoT,
    setEchoLocale,
    locale: i18n.global.locale,
  };
}

export async function initEchoI18n(
  preferredLocale?: EchoUiLocale | null,
): Promise<EchoUiLocale> {
  const locale =
    preferredLocale != null
      ? normalizeEchoUiLocale(preferredLocale)
      : resolveBrowserEchoLocale();
  await setEchoLocale(locale);
  return locale;
}
