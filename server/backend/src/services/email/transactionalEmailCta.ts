const ACCENT = '#8b9bf8';
const ACCENT_DEEP = '#5c52e0';
const CTA_TEXT = '#ffffff';
const TEXT_MUTED = '#9b8fb0';
const SUBTLE_LINE = 'rgba(155,143,176,0.12)';

const CTA_HTML = `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 0;">
  <tr>
    <td align="center" style="border-radius:12px;background:linear-gradient(135deg,__ACCENT__ 0%,__ACCENT_DEEP__ 100%);box-shadow:0 4px 16px rgba(139,155,248,0.25);">
      <a href="__HREF__" style="display:inline-block;padding:16px 32px;font-size:15px;font-weight:600;color:__CTA_TEXT__;text-decoration:none;border-radius:12px;">__LABEL__</a>
    </td>
  </tr>
</table>
<p style="margin:32px 0 0;padding-top:24px;border-top:1px solid __SUBTLE_LINE__;font-size:12px;line-height:1.6;color:__TEXT_MUTED__;">
  If the button doesn't work, copy this link:<br />
  <a href="__HREF__" style="color:__ACCENT__;word-break:break-all;text-decoration:none;">__HREF_TEXT__</a>
</p>`;

export function renderTransactionalEmailCta(input: {
  href: string;
  label: string;
  escapeHtml: (s: string) => string;
  escapeAttr: (s: string) => string;
}): string {
  const ctaHref = input.escapeAttr(input.href);
  const ctaLabel = input.escapeHtml(input.label);
  const ctaHrefText = input.escapeHtml(input.href);
  return CTA_HTML.replaceAll('__ACCENT__', ACCENT)
    .replaceAll('__ACCENT_DEEP__', ACCENT_DEEP)
    .replaceAll('__CTA_TEXT__', CTA_TEXT)
    .replaceAll('__TEXT_MUTED__', TEXT_MUTED)
    .replaceAll('__SUBTLE_LINE__', SUBTLE_LINE)
    .replaceAll('__HREF__', ctaHref)
    .replaceAll('__LABEL__', ctaLabel)
    .replaceAll('__HREF_TEXT__', ctaHrefText);
}
