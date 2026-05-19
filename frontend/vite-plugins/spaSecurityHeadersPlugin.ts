import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Single source for SPA CSP/HSTS (also written to `deploy/_headers` for Pages). */
export const SPA_STRICT_TRANSPORT_SECURITY =
  'max-age=31536000; includeSubDomains; preload';

/** `frame-src`: third-party iframes used by chat link embeds + VC activities (align with `src-tauri/tauri.conf.json`). */
export const SPA_CONTENT_SECURITY_POLICY =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; media-src 'self' blob: https:; worker-src 'self' blob:; manifest-src 'self'; frame-src 'self' https://challenges.cloudflare.com https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://openguessr.com https://skribbl.io https://garticphone.com https://www.garticphone.com https://krunker.io https://codenames.game https://richup.io https://gooberdash.winterpixel.io https://smashkarts.io https://www.y8.com https://html5.gamedistribution.com https://clusterrush.io; upgrade-insecure-requests";

const BLOCKED_DEPLOY_PATHS = new Set([
  '/_headers',
  '/_redirects',
  '/netlify.toml',
  '/vercel.json',
]);

function applySpaSecurityHeaders(res: {
  setHeader: (name: string, value: string) => void;
}): void {
  res.setHeader('Strict-Transport-Security', SPA_STRICT_TRANSPORT_SECURITY);
  res.setHeader('Content-Security-Policy', SPA_CONTENT_SECURITY_POLICY);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function blockDeployManifestRequest(
  req: { url?: string },
  res: {
    statusCode: number;
    end: (body?: string) => void;
    setHeader: (name: string, value: string) => void;
  },
  next: () => void,
): void {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (BLOCKED_DEPLOY_PATHS.has(pathname)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not Found');
    return;
  }
  next();
}

/**
 * Applies CSP/HSTS on Vite dev + preview (where `_headers` is not read) and copies
 * `deploy/_headers` into `dist/` after build for Netlify/Pages. Blocks public fetch of
 * deployment manifest paths when the static root is served directly.
 */
export function spaSecurityHeadersPlugin(repoRoot: string): Plugin {
  const deployDir = path.join(repoRoot, 'frontend', 'deploy');
  const headersSrc = path.join(deployDir, '_headers');

  const attach = (
    server: {
      middlewares: {
        use: (
          fn: (
            req: { url?: string },
            res: {
              statusCode: number;
              end: (body?: string) => void;
              setHeader: (name: string, value: string) => void;
            },
            next: () => void,
          ) => void,
        ) => void;
      };
    },
    applySecurityHeaders: boolean,
  ) => {
    server.middlewares.use((req, res, next) => {
      blockDeployManifestRequest(req, res, () => {
        if (applySecurityHeaders) {
          applySpaSecurityHeaders(res);
        }
        next();
      });
    });
  };

  return {
    name: 'echo-spa-security-headers',
    configureServer(server) {
      attach(server, false);
    },
    configurePreviewServer(server) {
      attach(server, true);
    },
    closeBundle() {
      if (!fs.existsSync(headersSrc)) return;
      const outDir = path.join(repoRoot, 'frontend', 'dist');
      fs.mkdirSync(outDir, { recursive: true });
      fs.copyFileSync(headersSrc, path.join(outDir, '_headers'));
    },
  };
}
