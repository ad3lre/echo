import {
  AGPL_LICENSE_URL,
  CHAT_APP_ORIGIN,
  GITHUB_REPO_URL,
  MARKETING_SITE_NAME,
  MARKETING_SITE_ORIGIN,
  SUPPORT_CONTACT_EMAIL,
} from '../site';
import { marketingUrl } from './canonicalUrl';

export const OG_IMAGE_PATH = '/og-card.svg';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_ALT =
  'Echo — open source community platform for chat, voice, and collaboration';

/** Single JSON-LD script: one object, an array, or a merged @graph. */
export function jsonLdScript(
  ...nodes: Record<string, unknown>[]
): Record<string, unknown> {
  if (nodes.length === 1) return nodes[0];
  return {
    '@context': 'https://schema.org',
    '@graph': nodes.map((node) => {
      const { '@context': _ctx, ...rest } = node;
      return rest;
    }),
  };
}

export function organizationNode(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${MARKETING_SITE_ORIGIN}/#organization`,
    name: MARKETING_SITE_NAME,
    url: marketingUrl('/'),
    logo: marketingUrl('/echo-rounded-logo.png'),
    email: SUPPORT_CONTACT_EMAIL,
    sameAs: [GITHUB_REPO_URL],
  };
}

export function webSiteNode(description: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${MARKETING_SITE_ORIGIN}/#website`,
    name: MARKETING_SITE_NAME,
    url: marketingUrl('/'),
    description,
    publisher: { '@id': `${MARKETING_SITE_ORIGIN}/#organization` },
    inLanguage: 'en-US',
  };
}

export function webPageNode(opts: {
  title: string;
  description: string;
  path: string;
}): Record<string, unknown> {
  const url = marketingUrl(opts.path);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: opts.title,
    description: opts.description,
    isPartOf: { '@id': `${MARKETING_SITE_ORIGIN}/#website` },
    inLanguage: 'en-US',
  };
}

export function breadcrumbNode(
  crumbs: { name: string; path: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: marketingUrl(crumb.path),
    })),
  };
}

export function faqPageNode(
  faqs: { question: string; answer: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function softwareApplicationNode(
  description: string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: MARKETING_SITE_NAME,
    applicationCategory: 'CommunicationApplication',
    operatingSystem: 'Web, Windows, macOS, Linux',
    description,
    url: marketingUrl('/'),
    installUrl: CHAT_APP_ORIGIN,
    downloadUrl: marketingUrl('/download'),
    screenshot: marketingUrl('/desktop-screenshot.png'),
    codeRepository: GITHUB_REPO_URL,
    license: AGPL_LICENSE_URL,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'Real-time chat and communities',
      'Voice channels',
      'Screen sharing',
      'Privacy-minded sign-up',
      'Open source under GNU AGPL v3',
    ],
  };
}

export function pageStructuredData(opts: {
  title: string;
  description: string;
  path: string;
  breadcrumbs?: { name: string; path: string }[];
  extra?: Record<string, unknown>[];
}): Record<string, unknown> {
  const crumbs = opts.breadcrumbs ?? [
    { name: 'Home', path: '/' },
    { name: opts.title.replace(/\s*\|\s*Echo$/, ''), path: opts.path },
  ];
  const nodes: Record<string, unknown>[] = [
    organizationNode(),
    webPageNode(opts),
    breadcrumbNode(crumbs),
  ];
  if (opts.extra?.length) nodes.push(...opts.extra);
  return jsonLdScript(...nodes);
}

export function homeStructuredData(opts: {
  description: string;
  faqs: { question: string; answer: string }[];
}): Record<string, unknown> {
  return jsonLdScript(
    organizationNode(),
    webSiteNode(opts.description),
    softwareApplicationNode(opts.description),
    faqPageNode(opts.faqs),
  );
}
