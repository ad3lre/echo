import type { FastifyBaseLogger } from 'fastify';
import { config } from '../../config';
import { sendTransactionalEmail } from './sendMail';

export type ExynoChatUnlockAlertPayload = {
  unlockedAt: string;
  requestIp: string;
  userAgent: string;
  acceptLanguage: string;
  forwardedFor: string;
  /** Browser / client fingerprint blob from Exyno unlock POST. */
  client: Record<string, unknown>;
  /** Server-side request headers / host meta. */
  request: Record<string, unknown>;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Google-style device / browser labels from UA (+ optional navigator.platform). */
export function summarizeUnlockClient(
  userAgent: string,
  platform?: string | null,
): { device: string; browser: string } {
  const ua = userAgent.toLowerCase();
  const plat = (platform ?? '').toLowerCase();

  let device = 'Unknown device';
  if (/iphone|ipod/.test(ua)) device = 'iPhone';
  else if (/ipad/.test(ua) || (plat === 'macintel' && /mobile/.test(ua))) device = 'iPad';
  else if (/android/.test(ua)) device = /mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  else if (/windows phone/.test(ua)) device = 'Windows phone';
  else if (/windows nt|win64|win32/.test(ua) || plat.startsWith('win')) device = 'Windows';
  else if (/cros/.test(ua)) device = 'Chromebook';
  else if (/macintosh|mac os x/.test(ua) || plat === 'macintel' || plat === 'macppc') device = 'Mac';
  else if (/linux/.test(ua)) device = 'Linux';

  let browser = 'Unknown browser';
  if (/edg\//.test(ua) || /edga\//.test(ua) || /edgios\//.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/.test(ua)) browser = 'Opera';
  else if (/firefox|fxios/.test(ua)) browser = 'Firefox';
  else if (/crios|chrome|chromium/.test(ua) && !/edg\//.test(ua)) browser = 'Chrome';
  else if (/safari/.test(ua) && !/chrome|crios|chromium|android/.test(ua)) browser = 'Safari';

  return { device, browser };
}

function formatWhen(iso: string, timeZone?: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const tz =
    typeof timeZone === 'string' && timeZone.trim() ? timeZone.trim() : 'Europe/Berlin';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function clientStr(client: Record<string, unknown>, key: string): string | null {
  const v = client[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function buildExynoChatUnlockMail(payload: ExynoChatUnlockAlertPayload): {
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; content: string; contentType: string }[];
} {
  const hwid = clientStr(payload.client, 'hwid') ?? '(missing)';
  const platform = clientStr(payload.client, 'platform');
  const timezone = clientStr(payload.client, 'timezone');
  const { device, browser } = summarizeUnlockClient(payload.userAgent, platform);
  const when = formatWhen(payload.unlockedAt, timezone);
  const where = payload.requestIp.trim() || 'Unknown IP';

  // Google-style: lead with device, not HWID / raw UA.
  const subject = `New sign-in to chat.exyno.de · ${device}`;

  const lines = [
    `New sign-in to chat.exyno.de`,
    ``,
    `Someone just unlocked Exyno chat with the shared password.`,
    ``,
    `Device:  ${device}`,
    `Browser: ${browser}`,
    `When:    ${when}`,
    `IP:      ${where}`,
    ``,
    `If this was you, you can ignore this email.`,
    `If it wasn’t, change the chat password.`,
  ];
  const text = lines.join('\n');

  const row = (label: string, value: string): string =>
    `<tr><td style="padding:6px 16px 6px 0;color:#5f6368;vertical-align:top">${escapeHtml(label)}</td>` +
    `<td style="padding:6px 0;color:#202124;font-weight:500">${escapeHtml(value)}</td></tr>`;

  const html =
    `<div style="font-family:Google Sans,Roboto,Helvetica,Arial,sans-serif;max-width:520px;color:#202124;line-height:1.45">` +
    `<h1 style="font-size:22px;font-weight:400;margin:0 0 12px">New sign-in to chat.exyno.de</h1>` +
    `<p style="margin:0 0 18px;color:#3c4043">Someone just unlocked Exyno chat with the shared password.</p>` +
    `<table style="border-collapse:collapse;margin:0 0 18px"><tbody>` +
    row('Device', device) +
    row('Browser', browser) +
    row('When', when) +
    row('IP', where) +
    `</tbody></table>` +
    `<p style="margin:0;color:#5f6368;font-size:13px">` +
    `If this was you, you can ignore this email. If it wasn’t, change the chat password.` +
    `</p>` +
    `</div>`;

  const meta = {
    unlockedAt: payload.unlockedAt,
    when,
    device,
    browser,
    requestIp: payload.requestIp,
    userAgent: payload.userAgent,
    acceptLanguage: payload.acceptLanguage,
    forwardedFor: payload.forwardedFor,
    hwid,
    client: payload.client,
    request: payload.request,
  };

  return {
    subject,
    text,
    html,
    attachments: [
      {
        filename: `exyno-chat-unlock-${Date.now()}.json`,
        content: JSON.stringify(meta, null, 2),
        contentType: 'application/json',
      },
    ],
  };
}

/**
 * Sign-in style alert when chat.exyno.de is unlocked with the shared password.
 * Destination defaults to reachbypass@gmail.com via ECHO_EXYNO_CHAT_UNLOCK_EMAIL.
 */
export async function sendExynoChatUnlockAlertEmail(
  log: FastifyBaseLogger,
  payload: ExynoChatUnlockAlertPayload,
): Promise<void> {
  const to = config.echoExynoChatUnlockEmail;
  const mail = buildExynoChatUnlockMail(payload);
  try {
    await sendTransactionalEmail(log, {
      to,
      from: config.echoBugReportEmailFrom,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: mail.attachments,
    });
    log.info(
      {
        msg: 'exyno_chat_unlock_alert_email_sent',
        to,
        hwid: typeof payload.client.hwid === 'string' ? payload.client.hwid : undefined,
        requestIp: payload.requestIp,
      },
      'Exyno chat unlock alert email sent',
    );
  } catch (err) {
    log.error(
      {
        err,
        msg: 'exyno_chat_unlock_alert_email_failed',
        to,
      },
      'Exyno chat unlock alert email failed',
    );
  }
}
