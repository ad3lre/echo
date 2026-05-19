# Mozilla HTTP Observatory (CSP + HSTS on HTML)

[Mozilla HTTP Observatory](https://observatory.mozilla.org/) scores the **response it fetches for the URL you scan** (for Echo, that is usually `https://<your-app-host>/` — the HTML document).

Echo’s **API** responses already include `Content-Security-Policy` and `Strict-Transport-Security` via Helmet (`backend/src/bootstrap/httpPlugins.ts`). If the HTML shell is served by a **CDN or reverse proxy** without those headers, the scan still fails CSP/HSTS even though `/api/...` looks fine in DevTools.

Use one of the following so **HTML (and ideally all same-origin static assets)** get CSP and HSTS.

## Caddy (Echo VPS)

Put **`handle /api/*`** and **`handle` / matchers for `/socket.io*`** (reverse proxy to the API) **above** a catch-all `handle` that serves `frontend/dist` with `try_files` + `file_server`. On that **SPA-only** `handle`, add the `header` block from [`scripts/deploy/templates/caddy-spa-security-headers.Caddyfile.snippet`](../../scripts/deploy/templates/caddy-spa-security-headers.Caddyfile.snippet) (same CSP/HSTS values as `_headers` below).

That way document responses get CSP + HSTS while `/api/` keeps the app’s Helmet policy — no duplicate CSP on one response.

Reload Caddy, then verify:

```bash
curl -sI https://your-host.example/ | grep -iE 'strict-transport|content-security'
```

(Windows PowerShell: `curl -sI https://your-host.example/ | Select-String -Pattern 'strict-transport|content-security'`)

### Edge-wide CSP + HSTS (unusual)

If you configure Caddy to emit CSP and HSTS on **every** response including `/api/`, set **`ECHO_EDGE_SECURITY_HEADERS=1`** on the API (see [`.env.example`](../../.env.example)) so Helmet omits those two headers and the edge policy stays single-valued.

## Cloudflare Pages (or Netlify)

The frontend build copies [`frontend/deploy/_headers`](../../frontend/deploy/_headers) into `frontend/dist/` (not from `public/`) for **Cloudflare Pages** and **Netlify**. `vite preview` and production Caddy must still set the same headers — see [`frontend/vite-plugins/spaSecurityHeadersPlugin.ts`](../../frontend/vite-plugins/spaSecurityHeadersPlugin.ts).

## Cloudflare proxy → your origin

`_headers` only applies to **Pages** static output, not to arbitrary proxied origins. Add **Response headers** (Transform Rules, or “Modify response header” in the dashboard) for the site host, scoped so you do **not** send a second CSP on API responses (browsers merge multiple CSPs by intersection and can break the app).

Example **Custom filter expression** (adjust host and path prefixes):

```txt
(http.host eq "chat-echo.com") and not starts_with(http.request.uri.path, "/api/") and not starts_with(http.request.uri.path, "/socket.io")
```

Add two static response headers (same values as in `frontend/deploy/_headers`):

- `Strict-Transport-Security`: `max-age=31536000; includeSubDomains; preload`
- `Content-Security-Policy`: copy the single-line policy from [`frontend/deploy/_headers`](../../frontend/deploy/_headers) (the long `Content-Security-Policy:` value after the header name).

Then re-run the Observatory scan on `https://chat-echo.com/`.

## SPA policy notes

Boot splash styles live in [`frontend/public/echo-boot-splash.css`](../../frontend/public/echo-boot-splash.css) so the deployed CSP can keep **`style-src 'self'`** without `'unsafe-inline'`. The policy uses broad **`connect-src` / `img-src`** HTTPS allowances so Discord avatars, media CDNs, LiveKit, and similar integrations keep working; tighten per environment if you have a fixed hostname list.
