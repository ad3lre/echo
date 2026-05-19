# Same-origin embed proxy

The embed proxy serves allowlisted third-party sites from Echo's own API origin so the SPA can frame them with same-origin access (`contentWindow.location`). This enables automatic room-URL detection for multiplayer games like Codenames.

## How it works

```
SPA (Echo origin)
  └─ iframe src="/api/v1/embed/codenames/o/main/"
       └─ GET /api/v1/embed/codenames/o/main/  (same origin, carries echo_sid cookie)
            └─ upstream: https://codenames.game/
                 (HTML rewritten — CDN asset URLs → /api/v1/embed/codenames/o/cdn2/…;
                 root-relative `/_next/…` and `/favicon.ico` → under `/o/main/…` for Next.js)
```

The iframe is now same-origin with the SPA. The SPA polls `iframe.contentWindow.location.href` (Next.js client navigations do not always fire `load`) and maps `/api/v1/embed/codenames/o/{main|www}/…` back to a canonical `https://(www.)codenames.game/…` room URL for LiveKit sync.

## Security boundary — read before enabling

**This feature has a serious security trade-off.** Proxied third-party JavaScript runs under Echo's origin. It can:

- Read and write `localStorage`, `sessionStorage`, and `indexedDB` at Echo's origin.
- Access same-site session cookies that are NOT `HttpOnly`-scoped to a sub-path (though `echo_sid` is `HttpOnly`, so JS cannot read it directly).
- Make credentialed same-origin XHR/fetch requests to `/api/*` using the user's session cookie.

**Only enable this for targets that have been explicitly reviewed and accepted as trusted.**  The built-in catalog contains only Codenames. Adding a new target to `embedProxyCatalog.ts` is an explicit operator decision.

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `ECHO_EMBED_PROXY_ENABLED` | `false` | Master switch. Must be explicitly set to `true`. |
| `ECHO_EMBED_PROXY_SLUGS` | (all in catalog) | Comma-separated list of enabled slugs. When unset, all catalog entries are allowed. |
| `ECHO_EMBED_PROXY_SECRET` | `JWT_SECRET` | HMAC key for signing embed tokens. Set independently in production. |

## Authentication model

Bearer tokens are not sent by browsers on iframe navigations. The proxy uses two complementary mechanisms:

1. **Embed token (initial document)**: The SPA calls `POST /api/v1/embed/token { slug }` (authenticated via session cookie) and receives a short-lived HMAC-signed token. This token is appended to the iframe `src` URL as `?_eproxy_t=…`. The proxy route validates it on the first request.

2. **Session cookie (subsequent requests)**: After the initial load, subsequent navigations within the iframe and subresource loads (CSS, fonts, images) send the `echo_sid` session cookie automatically because the proxy is same-origin. The proxy validates the cookie via `getServerSession`.

## URL path design

```
/api/v1/embed/:slug/o/:originAlias/*
```

- `:slug` — catalog key (e.g. `codenames`)
- `:originAlias` — short alias for the upstream origin (e.g. `main`, `www`, `cdn2` for Codenames)
- `*` — path remainder forwarded upstream

Aliases are defined in `backend/src/services/embedProxy/embedProxyCatalog.ts`.

## v1 rewrite scope (static text only)

The rewriter (`embedProxyRewrite.ts`) replaces absolute and protocol-relative upstream URLs in **text/html** and **text/css** responses.

For **Codenames** (Next.js on `codenames.game` / `www.codenames.game`), HTML served from the `main` or `www` origin aliases also rewrites **root-relative** `href` / `src` / `action` attributes (`/_next/…`, `/favicon.ico`, …) so they resolve under `/api/v1/embed/codenames/o/{alias}/…` instead of the Echo host root. This is required because Next ships many assets as absolute `https://cdn2…` URLs (rewritten separately) but still uses path-root assets for the app shell.

URLs constructed **only** in JavaScript at runtime may still bypass the proxy; the SPA supplements detection by polling `contentWindow.location` when the embed proxy is active.

## Adding a new proxy target

1. Add an entry to `EMBED_PROXY_CATALOG` in `embedProxyCatalog.ts`:

   ```typescript
   {
     slug: 'mygame',
     origins: [
       { alias: 'main', httpsOrigin: 'https://mygame.example.com' },
       { alias: 'assets', httpsOrigin: 'https://cdn.mygame.example.com' },
     ],
     maxRewriteBytes: 4 * 1024 * 1024,
     blockedUpstreamHeaders: ['cookie', 'authorization'],
   }
   ```

2. Review the security boundary (does this site's JS represent acceptable risk on Echo's origin?).

3. Enable via `ECHO_EMBED_PROXY_ENABLED=true` and optionally `ECHO_EMBED_PROXY_SLUGS=codenames,mygame`.

4. Wire the frontend to mint a token and build the proxy URL via `mintEmbedProxyToken` / `buildEmbedProxyUrl`.

## Stripped upstream response headers

The proxy removes these headers from all upstream responses before forwarding to the browser:

- `set-cookie` — upstream sites cannot set cookies under Echo's origin
- `content-security-policy`, `content-security-policy-report-only`
- `x-frame-options`
- `clear-site-data`
- `cross-origin-opener-policy`, `cross-origin-embedder-policy`, `cross-origin-resource-policy`
- `origin-agent-cluster`
- `report-to`, `nel`

Echo's own Helmet headers (`X-Frame-Options: DENY`, `Content-Security-Policy: frameAncestors 'none'`) are also removed for proxy responses via a scoped `onSend` hook so the iframe can load the document.

## Redirect handling

Redirects are followed manually (undici `maxRedirections: 0`). Each `Location` header is:

1. Resolved relative to the current upstream URL.
2. Validated against the catalog — only HTTPS URLs whose origin is in the target's `origins` list are followed.
3. Rejected with 502 if they point outside the catalog, use HTTP, or exceed 4 hops.

This prevents open-redirect and SSRF attacks via redirect chains.

## Compression

For rewriteable content types (`text/html`, `text/css`), the proxy sets `Accept-Encoding: identity` upstream so the body is always uncompressed plain text. Binary assets (images, fonts, scripts) are passed through with whatever encoding the upstream returns.

## Tauri / split-host limitation

When `VITE_API_URL` is set to a different host than the SPA (e.g. the desktop Tauri shell), the proxy iframe will be cross-origin from the SPA shell, losing `contentWindow.location` access. The proxy still works as a reverse-proxy in that configuration, but same-origin detection falls back to `postMessage`.

## Cookie / localStorage isolation note

Because the proxy makes third-party content same-origin with Echo, there is no browser-enforced isolation of cookies or storage between Echo's own JavaScript and the proxied game's JavaScript. `sandbox="allow-same-origin allow-scripts"` on the iframe would partially restore isolation, but `allow-same-origin` + `allow-scripts` together effectively restores most same-origin capabilities. This trade-off is documented here intentionally — do not assume sandboxing provides strong isolation for proxied content.
