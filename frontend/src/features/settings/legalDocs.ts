export type LegalDocTabId = 'privacy' | 'terms' | 'community' | 'attributions';

import { echoT } from '@/i18n';
import { legalDocTabLabel } from '@/i18n/labels';
import type { EchoUiLocale } from '@/i18n';
import { loadTimeLanguagePreferences } from '@/features/settings/timeLanguagePreferences';

export interface LegalDocTab {
  id: LegalDocTabId;
  label: string;
  markdown: string;
  fallbackLocale?: boolean;
}

import privacyEnUs from '../../../../terms/en-US/privacy.md?raw';
import termsEnUs from '../../../../terms/en-US/terms.md?raw';
import communityEnUs from '../../../../terms/en-US/community-guidelines.md?raw';
import attributionsEnUs from '../../../../terms/en-US/ATTRIBUTIONS.md?raw';

const EN_US_MARKDOWN: Record<LegalDocTabId, string> = {
  privacy: privacyEnUs,
  terms: termsEnUs,
  community: communityEnUs,
  attributions: attributionsEnUs,
};

/** en-GB uses en-US legal text until dedicated files exist under terms/en-GB/. */
const LOCALE_MARKDOWN: Partial<
  Record<EchoUiLocale, Partial<Record<LegalDocTabId, string>>>
> = {
  'en-US': EN_US_MARKDOWN,
  'en-GB': EN_US_MARKDOWN,
};

function resolveLegalMarkdown(
  tabId: LegalDocTabId,
  locale: EchoUiLocale,
): { markdown: string; fallbackLocale: boolean } {
  const catalog = LOCALE_MARKDOWN[locale]?.[tabId];
  if (catalog) {
    return {
      markdown: catalog,
      fallbackLocale: locale !== 'en-US' && locale !== 'en-GB',
    };
  }
  return {
    markdown: EN_US_MARKDOWN[tabId],
    fallbackLocale: locale !== 'en-US',
  };
}

export function buildLegalDocTabs(
  locale?: EchoUiLocale,
): readonly LegalDocTab[] {
  const loc = locale ?? loadTimeLanguagePreferences().locale;
  const ids: LegalDocTabId[] = [
    'privacy',
    'terms',
    'community',
    'attributions',
  ];
  return ids.map((id) => {
    const { markdown, fallbackLocale } = resolveLegalMarkdown(id, loc);
    return {
      id,
      label: legalDocTabLabel(id),
      markdown,
      fallbackLocale,
    };
  });
}

/** Default en-US tabs at import time (Settings boot). */
export const LEGAL_DOC_TABS: readonly LegalDocTab[] =
  buildLegalDocTabs('en-US');

export const LEGAL_NOT_YET_TRANSLATED_BANNER = () =>
  echoT('legal.notYetTranslated');
