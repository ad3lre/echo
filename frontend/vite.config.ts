import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { compression } from 'vite-plugin-compression2';
import { visualizer } from 'rollup-plugin-visualizer';
import * as path from 'path';
import type { IncomingMessage } from 'node:http';
import { ENABLE_NUMBERED_ICON_RENAME_TOOL } from './src/dev/echoDevTools';
import { consoleLogDevPlugin } from './vite-plugins/consoleLogDevPlugin';
import { iconRenameDevPlugin } from './vite-plugins/iconRenameDevPlugin';

const repoRoot = path.resolve(__dirname, '..');

/**
 * When Caddy terminates TLS and hits Vite with `X-Forwarded-Proto: https`, forward it to
 * the API so `ENFORCE_HTTPS` + `ECHO_TRUST_PROXY=true` on the backend accept the proxied request.
 */
function attachEchoProxyForwardedProto(proxy: {
  on(
    ev: 'proxyReq',
    fn: (
      proxyReq: { setHeader: (name: string, value: string) => void },
      req: IncomingMessage,
    ) => void,
  ): void;
}) {
  proxy.on('proxyReq', (proxyReq, req) => {
    const raw = req.headers['x-forwarded-proto'];
    const first = Array.isArray(raw) ? raw[0] : raw?.split(',')[0];
    if (typeof first === 'string' && first.trim()) {
      proxyReq.setHeader('X-Forwarded-Proto', first.trim());
    }
  });
}

/** Same-origin `/api` + `/socket.io` → Echo (dev server + `vite preview`). */
const echoBackendProxy: Record<string, import('vite').ProxyOptions> = {
  '/api': {
    target: 'http://127.0.0.1:3000',
    changeOrigin: true,
    configure(proxy) {
      attachEchoProxyForwardedProto(proxy);
    },
  },
  '/socket.io': {
    target: 'http://127.0.0.1:3000',
    changeOrigin: true,
    ws: true,
    configure(proxy) {
      attachEchoProxyForwardedProto(proxy);
    },
  },
};

/**
 * Merge `VITE_*` from monorepo root and `frontend/` so a single root `.env` works (and
 * `frontend/.env` can still override). Default Vite `envDir` is only `frontend/`, which ignored
 * root-only `VITE_*` overrides.
 */
function viteEnvDefine(mode: string) {
  const rootEnv = loadEnv(mode, repoRoot, 'VITE_');
  const feEnv = loadEnv(mode, __dirname, 'VITE_');
  const merged = { ...rootEnv, ...feEnv };
  return Object.fromEntries(
    Object.entries(merged).map(([k, v]) => [
      `import.meta.env.${k}`,
      JSON.stringify(v),
    ]),
  );
}

/**
 * Split heavy, cache-friendly **dependencies** (mostly `node_modules`). Avoid assigning
 * `src/**` into competing manual chunks — cross-imports between chat, settings, emoji, and voice
 * produce Rollup “circular chunk” warnings and defeat splitting anyway. Unlisted modules use
 * Rollup’s default split.
 */
function manualChunks(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/');

  if (
    normalized.includes('/src/assets/index.ts') ||
    normalized.includes('/src/assets/iconCatalog.ts')
  ) {
    return 'asset-registry';
  }

  if (!normalized.includes('node_modules')) return undefined;

  // Core Vue ecosystem (stable hashes for app updates).
  if (normalized.includes('pinia')) return 'vue-vendor';
  if (normalized.includes('node_modules/vue/')) return 'vue-vendor';
  if (normalized.includes('@vue')) return 'vue-vendor';

  // Chat / emoji: large deps; separate from the main layout chunk.
  if (normalized.includes('marked')) return 'markdown';
  if (normalized.includes('dompurify')) return 'dompurify';
  if (normalized.includes('twemoji')) return 'twemoji';
  if (normalized.includes('@tanstack/vue-virtual')) return 'virtual-scroll';
  if (normalized.includes('unicode-emoji-json')) return 'emoji-json';
  /**
   * LiveKit vs Krisp: separate vendor chunks so LiveKit updates do not invalidate the Krisp WASM
   * cache line. Krisp stays huge (~6 MB minified); `build.chunkSizeWarningLimit` reflects that.
   */
  if (
    normalized.includes('@livekit/krisp-noise-filter') ||
    normalized.includes('livekit/krisp-noise-filter')
  ) {
    return 'voice-krisp';
  }
  if (
    normalized.includes('livekit-client') ||
    normalized.includes('node_modules/@livekit/mutex')
  ) {
    return 'voice-livekit';
  }
  if (normalized.includes('socket.io-client')) return 'realtime-vendor';

  return undefined;
}

/**
 * Keep initial HTML preloads tight. Vite eagerly modulepreloads much of the async AppLayout graph,
 * which front-loads chat/settings/voice chunks before the shell has even executed. We strip those
 * generated preload links and keep a single explicit preload for the AppLayout shell chunk.
 */
function appLayoutModulePreload(): Plugin {
  let base = '/';
  return {
    name: 'app-layout-module-preload',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const htmlWithoutGeneratedPreloads = html.replace(
          /\s*<link rel="modulepreload"[^>]*href="[^"]+"[^>]*>/g,
          '',
        );
        const htmlWithOnlyCoreStylesheets =
          htmlWithoutGeneratedPreloads.replace(
            /\s*<link rel="stylesheet"[^>]*href="\/assets\/(?!index-[^"]+\.css)[^"]+"[^>]*>/g,
            '',
          );
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk') continue;
          const id = chunk.facadeModuleId?.replace(/\\/g, '/') ?? '';
          const isAppLayoutFacade = id.endsWith('/components/AppLayout.vue');
          const isAppLayoutFile =
            chunk.fileName.endsWith('.js') &&
            /(^|\/)AppLayout-[^/]+\.js$/.test(chunk.fileName);
          if (!isAppLayoutFacade && !isAppLayoutFile) continue;
          const href = path.posix.join(base, chunk.fileName);
          return {
            html: htmlWithOnlyCoreStylesheets,
            tags: [
              {
                tag: 'link',
                attrs: { rel: 'modulepreload', href, crossorigin: '' },
                injectTo: 'head',
              },
            ],
          };
        }
        return htmlWithOnlyCoreStylesheets;
      },
    },
  };
}

/**
 * Crawlers that fetch `index.html` (SPA shell) without hitting invite share routes still see
 * sensible defaults. Uses `VITE_PUBLIC_INVITE_BASE` so self-hosted origins get absolute `og:image`.
 */
function echoSpaDefaultOgMeta(mode: string): Plugin {
  const env = loadEnv(mode, repoRoot, 'VITE_');
  const inviteBase = (
    env.VITE_PUBLIC_INVITE_BASE || 'https://chat-echo.com'
  ).replace(/\/$/, '');
  const ogImage = `${inviteBase}/echo-rounded-logo.png`;
  const description = 'Echo — privacy-focused chat, voice, and communities.';
  const snippet = `
    <meta name="description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Echo" />
    <meta property="og:title" content="Echo" />
    <meta property="og:description" content="${description}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:alt" content="Echo" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Echo" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${ogImage}" />
    <meta name="twitter:image:alt" content="Echo" />`;
  return {
    name: 'echo-spa-default-og-meta',
    transformIndexHtml(html) {
      if (html.includes('property="og:title"')) return html;
      if (!html.includes('<title>Echo</title>')) return html;
      return html.replace(
        '<title>Echo</title>',
        `<title>Echo</title>${snippet}`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const shouldAnalyze = process.env.ANALYZE === '1';
  /** Fewer parallel transforms + skip dev-only middleware; use for iOS sim / tight RAM (`npm run dev:low-mem`). */
  const lowMemDev =
    mode === 'development' && process.env.ECHO_VITE_LOW_MEM === '1';
  /**
   * Set by the Tauri CLI for hook commands (`beforeDevCommand`, `beforeBuildCommand`, …).
   * See https://v2.tauri.app/reference/environment-variables/ (`TAURI_ENV_PLATFORM`).
   * `TAURI_PLATFORM` kept for older/alternate setups.
   */
  const isTauri = Boolean(
    process.env.TAURI_ENV_PLATFORM || process.env.TAURI_PLATFORM,
  );
  /**
   * Plain `npm run build -w frontend` must not require `@tauri-apps/plugin-*` in node_modules
   * (workspace installs can omit hoisted deps). Under `tauri build` / `tauri dev`, resolve real plugins.
   */
  const tauriPluginStubDir = path.resolve(
    __dirname,
    './vite-shims/tauri-plugins',
  );
  const tauriPluginStubs = isTauri
    ? []
    : [
        {
          find: '@tauri-apps/plugin-notification',
          replacement: path.join(tauriPluginStubDir, 'notification.ts'),
        },
        {
          find: '@tauri-apps/plugin-autostart',
          replacement: path.join(tauriPluginStubDir, 'autostart.ts'),
        },
        {
          find: '@tauri-apps/plugin-updater',
          replacement: path.join(tauriPluginStubDir, 'updater.ts'),
        },
        {
          find: '@tauri-apps/plugin-process',
          replacement: path.join(tauriPluginStubDir, 'process.ts'),
        },
        {
          find: '@tauri-apps/plugin-dialog',
          replacement: path.join(tauriPluginStubDir, 'dialog.ts'),
        },
        {
          find: '@tauri-apps/plugin-opener',
          replacement: path.join(tauriPluginStubDir, 'opener.ts'),
        },
        {
          find: '@tauri-apps/plugin-global-shortcut',
          replacement: path.join(tauriPluginStubDir, 'global-shortcut.ts'),
        },
        {
          find: '@tauri-apps/plugin-deep-link',
          replacement: path.join(tauriPluginStubDir, 'deep-link.ts'),
        },
      ];
  return {
    base: isTauri ? './' : '/',
    define: viteEnvDefine(mode),
    plugins: [
      vue(),
      echoSpaDefaultOgMeta(mode),
      appLayoutModulePreload(),
      tailwindcss(),
      ...(mode !== 'development'
        ? [
            compression({
              threshold: 1024,
              include: [
                /\.(js|mjs|css|json|svg|webmanifest)$/i,
                /^index\.html$/,
              ],
            }),
            ...(shouldAnalyze
              ? [
                  visualizer({
                    filename: 'dist/bundle-stats.html',
                    gzipSize: true,
                    brotliSize: true,
                    open: false,
                  }) as Plugin,
                ]
              : []),
          ]
        : []),
      ...(mode === 'development' && !lowMemDev
        ? [consoleLogDevPlugin(repoRoot)]
        : []),
      ...(mode === 'development' && ENABLE_NUMBERED_ICON_RENAME_TOOL
        ? [iconRenameDevPlugin(path.join(__dirname, 'src/assets/icons'))]
        : []),
    ],
    build: {
      /** Explicit prod defaults: no shipped client source maps; minified JS. */
      sourcemap: false,
      minify: 'esbuild',
      modulePreload: {
        resolveDependencies(filename, deps, context) {
          if (
            context.hostType === 'js' &&
            /(^|\/)AppLayout-[^/]+\.js$/.test(filename)
          ) {
            // Let the async import fetch AppLayout itself, but do not eagerly preload its entire
            // feature graph from the entry chunk.
            return deps.filter((dep) =>
              /(^|\/)AppLayout-[^/]+\.css$/.test(dep),
            );
          }
          return deps;
        },
      },
      /**
       * Rollup measures minified JS (not gzip). `AppLayout` + voice stack exceed 1 MB by design;
       * Krisp WASM alone is ~6 MB. Keep this above the largest known chunk so the build surfaces
       * accidental regressions (e.g. a new dep bloating the entry) without noise every release.
       */
      chunkSizeWarningLimit: 8000,
      rollupOptions: {
        onwarn(warning, defaultHandler) {
          // Transitive protobufjs helper uses `eval` for optional module loading; not actionable
          // in our bundle and drowns real warnings.
          if (
            warning.code === 'EVAL' &&
            typeof warning.id === 'string' &&
            warning.id.includes('protobufjs')
          ) {
            return;
          }
          defaultHandler(warning);
        },
        output: {
          manualChunks,
        },
      },
    },
    resolve: {
      alias: [
        ...tauriPluginStubs,
        {
          find: '@',
          replacement: path.resolve(__dirname, './src'),
        },
        {
          find: '@shared',
          replacement: path.resolve(__dirname, '../shared'),
        },
        // Emscripten bundles may reference Node builtins; browser path is unused at runtime.
        {
          find: /^path$/,
          replacement: path.resolve(
            __dirname,
            './vite-shims/node-builtin-stub.js',
          ),
        },
        {
          find: /^fs$/,
          replacement: path.resolve(
            __dirname,
            './vite-shims/node-builtin-stub.js',
          ),
        },
      ],
    },
    optimizeDeps: {
      /** CJS package; prebundle avoids dev-time default-export interop issues with Vue/Vite. */
      include: ['qrcode'],
    },
    server: {
      port: 8080,
      /** Listen on all interfaces so other devices on the LAN can load the dev server. */
      host: true,
      /**
       * Vite 6+ blocks unknown `Host` headers. Allow dev behind a reverse proxy (e.g. Caddy → domain).
       * Add your public hostname or set `true` to allow any host in dev only.
       */
      allowedHosts: ['chat-echo.com', 'localhost', '127.0.0.1'],
      /** Proxy API + Socket.IO to the backend so the client can use same-origin (avoids CORS; WebSocket upgrade works). */
      proxy: echoBackendProxy,
      // Low-RAM: don’t eagerly pre-transform linked modules (less parallel work / peak heap).
      ...(lowMemDev ? { preTransformRequests: false } : {}),
      // Polling fixes HMR on some Windows setups (WSL paths, OneDrive) but is slower/CPU-heavy.
      // Default: native FS events. Set VITE_DEV_POLLING=1 if saves don't hot-reload.
      ...(process.env.VITE_DEV_POLLING === '1'
        ? { watch: { usePolling: true, interval: 200 } }
        : {}),
    },
    /** Match dev: same-origin `/api` and `/socket.io` so LAN `vite preview` does not need split-origin CORS. */
    preview: {
      host: true,
      allowedHosts: ['chat-echo.com', 'localhost', '127.0.0.1'],
      proxy: echoBackendProxy,
    },
  };
});
