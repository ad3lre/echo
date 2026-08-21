import type { EchoInvitePreview } from '../domain/echoStore/community/invites';

export function escapeHtmlAttributeValue(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Resolve relative upload paths against the public API origin. */
export function absolutizeEchoMediaUrl(
  raw: string,
  apiPublicBase: string,
): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  try {
    const base = apiPublicBase.replace(/\/$/, '');
    return new URL(t.startsWith('/') ? t : `/${t}`, `${base}/`).href;
  } catch {
    return '';
  }
}

function defaultEchoBrandIconUrl(canonicalAppBase: string): string {
  const appBase = canonicalAppBase.replace(/\/$/, '');
  return `${appBase}/echo-rounded-logo.png`;
}

/**
 * HTML shell for invalid invite tokens (rich previews + humans who open the API URL).
 * No auto-redirect — avoids sending users in circles when the slug does not resolve.
 */
export function buildEchoInviteShareNotFoundHtml(input: {
  canonicalAppBase: string;
  /** Path + query only, e.g. `/bad-slug` or `/bad-slug?voice=…`. */
  socialRequestPath: string;
}): string {
  const appBase = input.canonicalAppBase.replace(/\/$/, '');
  const path = input.socialRequestPath.startsWith('/')
    ? input.socialRequestPath
    : `/${input.socialRequestPath}`;
  const canonicalHref = escapeHtmlAttributeValue(`${appBase}${path}`);
  const title = escapeHtmlAttributeValue('Echo · Invite not found');
  const description = escapeHtmlAttributeValue(
    'This invite link is invalid or no longer available.',
  );
  const ogImage = escapeHtmlAttributeValue(defaultEchoBrandIconUrl(appBase));
  const imageAlt = escapeHtmlAttributeValue('Echo');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${description}">
<meta name="theme-color" content="#0d0812">
<title>${title}</title>
<link rel="canonical" href="${canonicalHref}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonicalHref}">
<meta property="og:site_name" content="Echo">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:alt" content="${imageAlt}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${ogImage}">
<meta name="twitter:image:alt" content="${imageAlt}">
</head>
<body style="font-family:system-ui,sans-serif;margin:2rem;line-height:1.4;color:#111">
<p><strong>Invite not found</strong></p>
<p>${description}</p>
<p><a href="${canonicalHref}">Open this link</a> · <a href="${escapeHtmlAttributeValue(`${appBase}/`)}">Echo home</a></p>
</body>
</html>
`;
}

export function buildEchoInviteShareHtml(input: {
  preview: EchoInvitePreview;
  /** Where humans should land in the SPA (no trailing slash). */
  canonicalAppBase: string;
  /** Path only, e.g. `/my-server` or `/invite/abc…`. */
  landingPath: string;
  /** Used to absolutize `iconUrl` / `bannerUrl` when stored as relative paths. */
  apiPublicBase: string;
}): string {
  const appBase = input.canonicalAppBase.replace(/\/$/, '');
  const path = input.landingPath.startsWith('/')
    ? input.landingPath
    : `/${input.landingPath}`;
  const canonicalHref = escapeHtmlAttributeValue(`${appBase}${path}`);
  const { preview } = input;
  const vc = preview.voiceChannel;
  const serverLabel = preview.name.trim() || 'Server';
  const title = escapeHtmlAttributeValue(
    vc?.name?.trim()
      ? `${vc.name.trim()} · ${serverLabel} · Voice on Echo`
      : `${serverLabel} · Echo`,
  );
  const memberLine =
    preview.memberCount === 1 ? '1 member' : `${preview.memberCount} members`;
  const descBody = vc?.name?.trim()
    ? `Join ${serverLabel} on Echo and connect to #${vc.name.trim()} — ${memberLine}.`
    : preview.description.trim() || `Join this server on Echo — ${memberLine}.`;
  const description = escapeHtmlAttributeValue(descBody);
  const banner = absolutizeEchoMediaUrl(preview.bannerUrl, input.apiPublicBase);
  const icon = absolutizeEchoMediaUrl(preview.iconUrl, input.apiPublicBase);
  const brandFallback = defaultEchoBrandIconUrl(appBase);
  const ogImageRaw = (banner || icon).trim();
  const ogImageHref = escapeHtmlAttributeValue(ogImageRaw || brandFallback);
  const imageAltText = vc?.name?.trim()
    ? `${serverLabel} · #${vc.name.trim()} on Echo`
    : `${serverLabel} on Echo`;
  const imageAlt = escapeHtmlAttributeValue(imageAltText);
  const twitterCard = ogImageRaw ? 'summary_large_image' : 'summary';
  const pageTitle = escapeHtmlAttributeValue(
    vc?.name?.trim()
      ? `${vc.name.trim()} · ${serverLabel}`
      : preview.name.trim() || 'Echo',
  );
  const bodyName = escapeHtmlAttributeValue(
    vc?.name?.trim() ? `${vc.name.trim()} · ${serverLabel}` : serverLabel,
  );
  const bodyDesc = escapeHtmlAttributeValue(descBody);

  const redirectTarget = `${appBase}${path}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${description}">
<meta name="theme-color" content="#0d0812">
<title>${pageTitle}</title>
<link rel="canonical" href="${canonicalHref}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonicalHref}">
<meta property="og:site_name" content="Echo">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${ogImageHref}">
<meta property="og:image:alt" content="${imageAlt}">
<meta name="twitter:card" content="${twitterCard}">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${ogImageHref}">
<meta name="twitter:image:alt" content="${imageAlt}">
</head>
<body style="font-family:system-ui,sans-serif;margin:2rem;line-height:1.4;color:#111">
<p><strong>${bodyName}</strong></p>
<p>${bodyDesc}</p>
<p><a href="${canonicalHref}">Open in Echo</a></p>
<script>location.replace(${JSON.stringify(redirectTarget)})</script>
</body>
</html>
`;
}
