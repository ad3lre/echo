import attributionsMd from '../../../../terms/ATTRIBUTIONS.md?raw';
import communityGuidelinesMd from '../../../../terms/community-guidelines.md?raw';
import privacyMd from '../../../../terms/privacy.md?raw';
import termsMd from '../../../../terms/terms.md?raw';

export type LegalDocTabId = 'privacy' | 'terms' | 'community' | 'attributions';

export interface LegalDocTab {
  id: LegalDocTabId;
  label: string;
  markdown: string;
}

export const LEGAL_DOC_TABS: readonly LegalDocTab[] = [
  { id: 'privacy', label: 'Privacy policy', markdown: privacyMd },
  { id: 'terms', label: 'Terms of service', markdown: termsMd },
  {
    id: 'community',
    label: 'Community guidelines',
    markdown: communityGuidelinesMd,
  },
  { id: 'attributions', label: 'Attributions', markdown: attributionsMd },
] as const;
