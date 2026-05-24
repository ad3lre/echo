import en from '../i18n/en.json';

export type MarketingLocale = 'en';

export const DEFAULT_MARKETING_LOCALE: MarketingLocale = 'en';

const catalogs: Record<MarketingLocale, typeof en> = {
  en,
};

export function getMarketingStrings(
  locale: MarketingLocale = DEFAULT_MARKETING_LOCALE,
) {
  return catalogs[locale] ?? catalogs.en;
}

export function marketingOgLocale(locale: MarketingLocale): string {
  return locale === 'en' ? 'en_US' : `${locale}_${locale.toUpperCase()}`;
}

export const MARKETING_LOCALES: MarketingLocale[] = ['en'];
