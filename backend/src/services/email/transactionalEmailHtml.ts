import { config } from '../../config';

export type TransactionalEmailBranding = {
  /** Shown in browser tab; keep short. */
  documentTitle: string;
  /** Inbox preview line (many clients show first text). Hidden in body. */
  preheader: string;
  /** Escaped display name for greeting. */
  greetingName: string;
  /** Plain sentences, HTML-escaped and each wrapped in a paragraph. */
  bodyParagraphs: string[];
  primaryCta: { href: string; label: string };
  /** Optional extra muted paragraph (already trusted / plain text from caller). */
  finePrint?: string;
};

const BRAND_BG = '#090612';
const CARD_BG = '#0d0914';
const TEXT_PRIMARY = '#f5f2fa';
const TEXT_MUTED = '#9b8fb0';
const ACCENT = '#8b9bf8';
const ACCENT_DEEP = '#5c52e0';
const CTA_TEXT = '#ffffff';
const SUBTLE_LINE = 'rgba(155,143,176,0.12)';

/**
 * Table-based, mostly-inline HTML for transactional mail (verification, password
 * reset). Tuned for dark-mode Echo branding and conservative client support.
 */
export function buildTransactionalEmailHtml(
  input: TransactionalEmailBranding,
): string {
  const logoUrl = config.echoEmailLogoUrl?.trim() || null;
  const homeUrl = escapeHtml(config.echoAppPublicUrl.replace(/\/$/, ''));
  const title = escapeHtml(input.documentTitle);
  const pre = escapeHtml(input.preheader);
  const greeting = escapeHtml(input.greetingName);
  const ctaHref = escapeAttr(input.primaryCta.href);
  const ctaLabel = escapeHtml(input.primaryCta.label);
  const bodyPs = input.bodyParagraphs
    .map(
      (t) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${TEXT_PRIMARY};">${escapeHtml(t)}</p>`,
    )
    .join('');
  const fine = input.finePrint
    ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:${TEXT_MUTED};">${escapeHtml(input.finePrint)}</p>`
    : '';

  const logoBlock = logoUrl
    ? `<img src="${escapeAttr(logoUrl)}" width="48" height="48" alt="Echo" style="display:block;border-radius:12px;box-shadow:0 4px 20px rgba(139,155,248,0.15);" />`
    : `<div style="font-size:20px;font-weight:600;letter-spacing:-0.02em;color:${TEXT_PRIMARY};">Echo</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title}</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND_BG};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND_BG};">${pre}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND_BG};">
    <tr>
      <td align="center" style="padding:32px 16px 48px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 0 20px;text-align:center;">
              ${logoBlock}
            </td>
          </tr>
          <tr>
            <td style="background:${CARD_BG};border-radius:24px;padding:40px 32px 32px;box-shadow:0 8px 40px rgba(0,0,0,0.35),0 2px 8px rgba(0,0,0,0.2);">
              <p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${ACCENT};">Echo</p>
              <p style="margin:0 0 28px;font-size:26px;font-weight:650;letter-spacing:-0.02em;line-height:1.25;color:${TEXT_PRIMARY};">${title}</p>
              <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:${TEXT_PRIMARY};">Hi ${greeting},</p>
              ${bodyPs}
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 0;">
                <tr>
                  <td align="center" style="border-radius:12px;background:linear-gradient(135deg,${ACCENT} 0%,${ACCENT_DEEP} 100%);box-shadow:0 4px 16px rgba(139,155,248,0.25);">
                    <a href="${ctaHref}" style="display:inline-block;padding:16px 32px;font-size:15px;font-weight:600;color:${CTA_TEXT};text-decoration:none;border-radius:12px;">${ctaLabel}</a>
                  </td>
                </tr>
              </table>
              ${fine}
              <p style="margin:32px 0 0;padding-top:24px;border-top:1px solid ${SUBTLE_LINE};font-size:12px;line-height:1.6;color:${TEXT_MUTED};">
                If the button doesn't work, copy this link:<br />
                <a href="${ctaHref}" style="color:${ACCENT};word-break:break-all;text-decoration:none;">${escapeHtml(input.primaryCta.href)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 8px 0;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:${TEXT_MUTED};">
                <a href="${homeUrl}" style="color:${ACCENT};text-decoration:none;font-weight:500;">Open Echo</a>
                <span style="margin:0 10px;opacity:0.4;">·</span>
                Sent by Echo
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
