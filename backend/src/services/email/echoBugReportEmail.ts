import type { FastifyBaseLogger } from 'fastify';
import { config } from '../../config';
import { sendTransactionalEmail } from './sendMail';

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

function buildMetadataAttachment(payload: BugReportEmailPayload): {
  filename: string;
  content: string;
} {
  const { reporter } = payload;
  const metadata = {
    id: payload.id,
    ...(payload.createdAt ? { createdAt: payload.createdAt } : {}),
    reporter: {
      id: reporter.id,
      username: reporter.username,
      displayName: reporter.displayName,
      ...(reporter.email ? { email: reporter.email } : {}),
    },
    attachmentUrls: payload.attachmentUrls,
    clientMeta: payload.clientMeta ?? {},
    traceJson: payload.traceJson ?? {},
  };
  return {
    filename: `echo-bug-report-${payload.id}-metadata.json`,
    content: JSON.stringify(metadata, null, 2),
  };
}

function buildBugReportMail(payload: BugReportEmailPayload): {
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  attachments: { filename: string; content: string; contentType: string }[];
} {
  const { reporter } = payload;
  const subject = `[Echo Bug Report] ${reporter.username} (${payload.id})`;
  const text = payload.body;
  const html = `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(payload.body)}</pre>`;

  const replyTo =
    typeof reporter.email === 'string' && reporter.email.trim()
      ? reporter.email.trim()
      : undefined;

  const meta = buildMetadataAttachment(payload);
  return {
    subject,
    text,
    html,
    replyTo,
    attachments: [
      {
        filename: meta.filename,
        content: meta.content,
        contentType: 'application/json',
      },
    ],
  };
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
      attachments: mail.attachments,
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
