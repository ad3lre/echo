import { createI18n, type I18n } from 'vue-i18n';

import common from './locales/en-US/common.json';
import bootstrap from './locales/en-US/bootstrap.json';
import time from './locales/en-US/time.json';
import legal from './locales/en-US/legal.json';
import tauri from './locales/en-US/tauri.json';
import errors from './locales/en-US/errors.json';
import dialogs from './locales/en-US/dialogs.json';
import auth from './locales/en-US/auth.json';
import integrations from './locales/en-US/integrations.json';
import settings from './locales/en-US/settings.json';
import serverSettings from './locales/en-US/serverSettings.json';
import serverNotifications from './locales/en-US/serverNotifications.json';
import channelSettings from './locales/en-US/channelSettings.json';

/** BCP-47 locales with UI message catalogs. */
export const SUPPORTED_ECHO_UI_LOCALES = ['en-US', 'en-GB'] as const;
export type EchoUiLocale = (typeof SUPPORTED_ECHO_UI_LOCALES)[number];

export const DEFAULT_ECHO_LOCALE: EchoUiLocale = 'en-US';

function buildEnUsMessages() {
  return {
    common,
    bootstrap,
    time,
    legal,
    tauri,
    errors: { api: errors },
    dialogs,
    auth,
    integrations,
    settings,
    serverSettings,
    serverNotifications,
    channelSettings,
  };
}

const enUsMessages = buildEnUsMessages();

const localeLoaders: Record<
  EchoUiLocale,
  () => Promise<{ default: Record<string, string | Record<string, unknown>> }>
> = {
  'en-US': () => Promise.resolve({ default: enUsMessages }),
  'en-GB': () => import('./locales/en-GB.json'),
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
    const lower = value.toLowerCase();
    if (lower === 'en-gb' || lower === 'en_gb') return 'en-GB';
    if (lower.startsWith('en')) return 'en-US';
  }
  return DEFAULT_ECHO_LOCALE;
}

export function resolveBrowserEchoLocale(): EchoUiLocale {
  if (typeof navigator === 'undefined') return DEFAULT_ECHO_LOCALE;
  const lang = navigator.language?.trim();
  if (!lang) return DEFAULT_ECHO_LOCALE;
  if (lang.toLowerCase() === 'en-gb') return 'en-GB';
  return DEFAULT_ECHO_LOCALE;
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
  void import('@/platform/desktopTrayLocale')
    .then((m) => m.syncDesktopTrayLocale())
    .catch(() => {
      /* web vitest / non-Tauri bundles may fail to load the tray module */
    });
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
