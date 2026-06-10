import type { FastifyBaseLogger } from 'fastify';
import { config } from '../../config';
import { sendTransactionalEmail } from './sendMail';

export const BOOT_STALL_ALERT_KINDS = [
  'boot_gate_settled_still_visible',
  'boot_gate_past_safety_timeout',
  'app_layout_chunk_stall',
] as const;

export type BootStallAlertKind = (typeof BOOT_STALL_ALERT_KINDS)[number];

export type BootStallAlertEmailPayload = {
  kind: BootStallAlertKind;
  clientMeta: Record<string, unknown>;
  timingMeta: Record<string, unknown>;
  stateMeta: Record<string, unknown>;
  requestIp: string;
  userAgent: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildBootStallMail(payload: BootStallAlertEmailPayload): {
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; content: string; contentType: string }[];
} {
  const subject = `[Echo Boot Stall] ${payload.kind}`;
  const meta = {
    kind: payload.kind,
    reportedAt: new Date().toISOString(),
    requestIp: payload.requestIp,
    userAgent: payload.userAgent,
    client: payload.clientMeta,
    timing: payload.timingMeta,
    state: payload.stateMeta,
  };
  const text =
    `Echo client boot stall detected\n\n` +
    `Kind: ${payload.kind}\n` +
    `IP: ${payload.requestIp}\n` +
    `User-Agent: ${payload.userAgent}\n\n` +
    `--- metadata ---\n` +
    `${JSON.stringify(meta, null, 2)}\n`;
  const html =
    `<p><strong>Echo client boot stall detected</strong></p>` +
    `<table style="border-collapse:collapse"><tbody>` +
    `<tr><td style="padding:2px 12px 2px 0"><strong>Kind</strong></td>` +
    `<td><code>${escapeHtml(payload.kind)}</code></td></tr>` +
    `<tr><td style="padding:2px 12px 2px 0"><strong>IP</strong></td>` +
    `<td>${escapeHtml(payload.requestIp)}</td></tr>` +
    `<tr><td style="padding:2px 12px 2px 0;vertical-align:top"><strong>UA</strong></td>` +
    `<td>${escapeHtml(payload.userAgent)}</td></tr>` +
    `</tbody></table>` +
    `<hr/><pre style="white-space:pre-wrap;font-family:monospace;font-size:12px">${escapeHtml(JSON.stringify(meta, null, 2))}</pre>`;
  return {
    subject,
    text,
    html,
    attachments: [
      {
        filename: `echo-boot-stall-${payload.kind}-${Date.now()}.json`,
        content: JSON.stringify(meta, null, 2),
        contentType: 'application/json',
      },
    ],
  };
}

/**
 * Notifies {@link config.echoBugsEmail} when the web client reports a prolonged
 * boot splash / gate stall. Logs and swallows SMTP errors.
 */
export async function sendBootStallAlertEmail(
  log: FastifyBaseLogger,
  payload: BootStallAlertEmailPayload,
): Promise<void> {
  const mail = buildBootStallMail(payload);
  try {
    await sendTransactionalEmail(log, {
      to: config.echoBugsEmail,
      from: config.echoBugReportEmailFrom,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: mail.attachments,
    });
    log.info(
      {
        msg: 'echo_boot_stall_alert_email_sent',
        kind: payload.kind,
        to: config.echoBugsEmail,
      },
      'Boot stall alert email sent',
    );
  } catch (err) {
    log.error(
      {
        err,
        msg: 'echo_boot_stall_alert_email_failed',
        kind: payload.kind,
      },
      'Boot stall alert email failed',
    );
  }
}
