/**
 * Root-relative URLs served from `clients/web/public/` (also written by prebuild).
 * Using stable paths avoids production 404s when hashed `/assets/echo-rounded-logo-*.png`
 * drifts from CDN/cache or partial deploys.
 */
export const iconEchoRounded = '/echo-rounded-logo.png';
export const iconEcho = '/echo-logo.png';
/** Tab favicon — dedicated 32×32 raster (see `server/ops/scripts/generate-pwa-icons.mjs`). */
export const iconEchoFavicon = '/icons/favicon-32.png';
