import type { Plugin } from 'vite';
import {
  CHAT_LEGAL_DOC_TO_MARKETING_PATH,
  CHAT_LEGAL_PATH_RE,
  ECHO_MARKETING_SITE_ORIGIN,
  normalizeMarketingCanonicalUrl,
} from '../../../contracts/echoMarketingSeo';

function chatLegalRedirectTarget(pathname: string): string | null {
  const match = CHAT_LEGAL_PATH_RE.exec(pathname);
  if (!match) return null;
  const marketingPath = CHAT_LEGAL_DOC_TO_MARKETING_PATH[match[1]!];
  if (!marketingPath) return null;
  return normalizeMarketingCanonicalUrl(
    ECHO_MARKETING_SITE_ORIGIN,
    marketingPath,
  );
}

function attachChatLegalRedirectMiddleware(middlewares: {
  use: (
    fn: (
      req: { url?: string; method?: string },
      res: {
        writeHead: (code: number, headers: Record<string, string>) => void;
        end: () => void;
      },
      next: () => void,
    ) => void,
  ) => void;
}): void {
  middlewares.use((req, res, next) => {
    if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
      next();
      return;
    }
    const pathname = (req.url ?? '').split('?')[0] ?? '';
    const target = chatLegalRedirectTarget(pathname);
    if (!target) {
      next();
      return;
    }
    res.writeHead(301, { Location: target });
    res.end();
  });
}

/**
 * Chat app SEO: noindex shell, and 301 `/legal/*` → marketing canonical URLs so crawlers
 * do not treat chat-echo.com legal pages as duplicates of app-echo.net.
 */
export function spaSeoPlugin(publicOrigin: string): Plugin {
  const origin = publicOrigin.replace(/\/$/, '');
  const shellCanonical = normalizeMarketingCanonicalUrl(origin, '/');

  return {
    name: 'echo-spa-seo',
    configureServer(server) {
      attachChatLegalRedirectMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachChatLegalRedirectMiddleware(server.middlewares);
    },
    transformIndexHtml(html) {
      if (!html.includes('<title>Echo</title>')) return html;
      const snippet = `
    <meta name="robots" content="noindex,nofollow" />
    <link rel="canonical" href="${shellCanonical}" />`;
      if (html.includes('name="robots"')) return html;
      return html.replace(
        '<title>Echo</title>',
        `<title>Echo</title>${snippet}`,
      );
    },
  };
}
