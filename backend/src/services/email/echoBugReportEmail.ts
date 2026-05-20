import type { FastifyBaseLogger } from 'fastify';
import { config } from '../../config';
import { sendTransactionalEmail } from './sendMail';

const MAX_TRACE_CHARS_IN_EMAIL = 48_000;
const MAX_CLIENT_META_CHARS_IN_EMAIL = 8_000;

export type BugReportEmailReporter = {
  id: string;
  username: string;
  displayName: string;
  email?: string;
};

export type BugReportEmailPayload = {
  id: string;
  body: string;
  clientMeta: unknown;
  traceJson: unknown;
  attachmentUrls: string[];
  reporter: BugReportEmailReporter;
  /** ISO timestamp; included in backfill emails. */
  createdAt?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stringifyForEmail(
  value: unknown,
  maxChars: number,
): { text: string; truncated: boolean } {
  let raw: string;
  try {
    raw = JSON.stringify(value, null, 2);
  } catch {
    raw = String(value);
  }
  if (raw.length <= maxChars) {
    return { text: raw, truncated: false };
  }
  return {
    text: `${raw.slice(0, maxChars)}\n… [truncated for email; full payload in database]`,
    truncated: true,
  };
}

function buildBugReportMail(payload: BugReportEmailPayload): {
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
} {
  const { reporter } = payload;
  const reporterLabel =
    reporter.displayName.trim() || reporter.username || reporter.id;
  const subject = `[Echo Bug Report] ${reporter.username} (${payload.id})`;

  const client = stringifyForEmail(
    payload.clientMeta ?? {},
    MAX_CLIENT_META_CHARS_IN_EMAIL,
  );
  const trace = stringifyForEmail(
    payload.traceJson ?? {},
    MAX_TRACE_CHARS_IN_EMAIL,
  );

  const attachmentLines =
    payload.attachmentUrls.length > 0
      ? payload.attachmentUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')
      : '(none)';

  const attachmentHtml =
    payload.attachmentUrls.length > 0
      ? `<ul>${payload.attachmentUrls
          .map(
            (u) =>
              `<li><a href="${escapeHtml(u)}">${escapeHtml(u)}</a></li>`,
          )
          .join('')}</ul>`
      : '<p><em>(none)</em></p>';

  const createdLine = payload.createdAt
    ? `Submitted: ${payload.createdAt}\n`
    : '';

  const text =
    `New in-app bug report\n\n` +
    `Report ID: ${payload.id}\n` +
    createdLine +
    `Reporter: ${reporterLabel} (@${reporter.username}, id ${reporter.id})\n` +
    (reporter.email ? `Reporter email: ${reporter.email}\n` : '') +
    `\nAttachments:\n${attachmentLines}\n` +
    `\n--- Description ---\n${payload.body}\n` +
    `\n--- Client meta${client.truncated ? ' (truncated)' : ''} ---\n${client.text}\n` +
    `\n--- Trace${trace.truncated ? ' (truncated)' : ''} ---\n${trace.text}\n`;

  const html =
    `<p><strong>New in-app bug report</strong></p>` +
    `<table style="border-collapse:collapse"><tbody>` +
    `<tr><td style="padding:2px 12px 2px 0"><strong>Report ID</strong></td>` +
    `<td><code>${escapeHtml(payload.id)}</code></td></tr>` +
    (payload.createdAt
      ? `<tr><td style="padding:2px 12px 2px 0"><strong>Submitted</strong></td>` +
        `<td>${escapeHtml(payload.createdAt)}</td></tr>`
      : '') +
    `<tr><td style="padding:2px 12px 2px 0"><strong>Reporter</strong></td>` +
    `<td>${escapeHtml(reporterLabel)} (@${escapeHtml(reporter.username)}, id ${escapeHtml(reporter.id)})</td></tr>` +
    (reporter.email
      ? `<tr><td style="padding:2px 12px 2px 0"><strong>Email</strong></td>` +
        `<td><a href="mailto:${escapeHtml(reporter.email)}">${escapeHtml(reporter.email)}</a></td></tr>`
      : '') +
    `<tr><td style="padding:2px 12px 2px 0;vertical-align:top"><strong>Attachments</strong></td>` +
    `<td>${attachmentHtml}</td></tr>` +
    `</tbody></table>` +
    `<h3>Description</h3>` +
    `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(payload.body)}</pre>` +
    `<h3>Client meta${client.truncated ? ' (truncated)' : ''}</h3>` +
    `<pre style="white-space:pre-wrap;font-family:monospace;font-size:12px">${escapeHtml(client.text)}</pre>` +
    `<h3>Trace${trace.truncated ? ' (truncated)' : ''}</h3>` +
    `<pre style="white-space:pre-wrap;font-family:monospace;font-size:12px">${escapeHtml(trace.text)}</pre>`;

  const replyTo =
    typeof reporter.email === 'string' && reporter.email.trim()
      ? reporter.email.trim()
      : undefined;

  return { subject, text, html, replyTo };
}

/**
 * Notifies ECHO_SUPPORT_EMAIL about an in-app bug report (DB row already saved).
 * Logs and swallows SMTP errors so submission is not lost.
 */
export async function sendBugReportSupportEmail(
  log: FastifyBaseLogger,
  payload: BugReportEmailPayload,
): Promise<void> {
  const mail = buildBugReportMail(payload);
  try {
    await sendTransactionalEmail(log, {
      to: config.echoSupportEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: mail.replyTo,
    });
    log.info(
      {
        msg: 'echo_bug_report_support_email_sent',
        echoBugReportId: payload.id,
        reporterId: payload.reporter.id,
      },
      'Bug report notification email sent',
    );
  } catch (err) {
    log.error(
      {
        err,
        msg: 'echo_bug_report_support_email_failed',
        echoBugReportId: payload.id,
        reporterId: payload.reporter.id,
      },
      'Bug report notification email failed',
    );
  }
}
