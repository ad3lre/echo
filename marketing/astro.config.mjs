import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://app-echo.net',
  integrations: [sitemap()],
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
