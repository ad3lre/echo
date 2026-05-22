import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const SITE = 'https://app-echo.net';

/** Relative path (no trailing slash) → sitemap priority. */
const SITEMAP_PRIORITY = {
  '/': 1,
  '/download': 0.9,
  '/communities': 0.85,
  '/support': 0.75,
  '/status': 0.6,
  '/privacy': 0.5,
  '/terms': 0.5,
  '/community-guidelines': 0.45,
  '/attributions': 0.35,
};

export default defineConfig({
  site: SITE,
  trailingSlash: 'always',
  compressHTML: true,
  integrations: [
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
      serialize(item) {
        const path = new URL(item.url).pathname.replace(/\/$/, '') || '/';
        const priority = SITEMAP_PRIORITY[path];
        if (priority == null) return item;
        return { ...item, priority };
      },
    }),
  ],
  vite: {
    server: {
      allowedHosts: [
        'app-echo.net',
        'www.app-echo.net',
        'localhost',
        '127.0.0.1',
      ],
    },
    preview: {
      allowedHosts: [
        'app-echo.net',
        'www.app-echo.net',
        'localhost',
        '127.0.0.1',
      ],
    },
  },
});
