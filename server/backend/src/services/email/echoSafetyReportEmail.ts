import type { FastifyBaseLogger } from 'fastify';
import type { EchoReportCategory } from '../../../../../contracts/safetyReports';
import { config } from '../../config';
import { sendTransactionalEmail } from './sendMail';

export type SafetyReportEmailReporter = {
  id: string;
  username: string;
  displayName: string;
  email?: string;
};

export type UserSafetyReportEmailPayload = {
  kind: 'user';
  id: string;
  category: EchoReportCategory;
  reason: string;
  targetUserId: string;
  messageId?: string;
  channelId?: string;
  serverId?: string | null;
  reporter: SafetyReportEmailReporter;
};

export type MessageSafetyReportEmailPayload = {
  kind: 'message';
  id: string;
  category: EchoReportCategory;
  reason: string;
  messageId: string;
  channelId: string;
  serverId?: string | null;
  authorId: string;
  contentSnapshot: string;
  reporter: SafetyReportEmailReporter;
};

export type SafetyReportEmailPayload =
  | UserSafetyReportEmailPayload
  | MessageSafetyReportEmailPayload;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSafetyReportMail(payload: SafetyReportEmailPayload): {
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  attachments: { filename: string; content: string; contentType: string }[];
} {
  const { reporter } = payload;
  const replyTo =
    typeof reporter.email === 'string' && reporter.email.trim()
      ? reporter.email.trim()
      : undefined;

  const metadata =
    payload.kind === 'user'
      ? {
          kind: 'user',
          id: payload.id,
          category: payload.category,
          reason: payload.reason,
          targetUserId: payload.targetUserId,
          messageId: payload.messageId ?? null,
          channelId: payload.channelId ?? null,
          serverId: payload.serverId ?? null,
          reporter,
        }
      : {
          kind: 'message',
          id: payload.id,
          category: payload.category,
          reason: payload.reason,
          messageId: payload.messageId,
          channelId: payload.channelId,
          serverId: payload.serverId ?? null,
          authorId: payload.authorId,
          contentSnapshot: payload.contentSnapshot,
          reporter,
        };

  const subject =
    payload.kind === 'user'
      ? `[Echo User Report] ${reporter.username} → ${payload.targetUserId} (${payload.id})`
      : `[Echo Message Report] ${reporter.username} msg ${payload.messageId} (${payload.id})`;

  const text =
    payload.kind === 'user'
      ? `Category: ${payload.category}\n\n${payload.reason}`
      : `Category: ${payload.category}\nAuthor: ${payload.authorId}\nChannel: ${payload.channelId}\n\n${payload.reason}\n\n--- message snapshot ---\n${payload.contentSnapshot}`;

  const html = `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(text)}</pre>`;

  return {
    subject,
    text,
    html,
    replyTo,
    attachments: [
      {
        filename: `echo-safety-report-${payload.id}-metadata.json`,
        content: JSON.stringify(metadata, null, 2),
        contentType: 'application/json',
      },
    ],
  };
}

export async function sendSafetyReportSupportEmail(
  log: FastifyBaseLogger,
  payload: SafetyReportEmailPayload,
): Promise<void> {
  const mail = buildSafetyReportMail(payload);
  try {
    await sendTransactionalEmail(log, {
      to: config.echoSupportEmail,
      from: config.echoBugReportEmailFrom,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: mail.replyTo,
      attachments: mail.attachments,
    });
    log.info(
      {
        msg: 'echo_safety_report_support_email_sent',
        echoSafetyReportId: payload.id,
        kind: payload.kind,
        reporterId: payload.reporter.id,
      },
      'Safety report notification email sent',
    );
  } catch (err) {
    log.error(
      {
        err,
        msg: 'echo_safety_report_support_email_failed',
        echoSafetyReportId: payload.id,
        kind: payload.kind,
        reporterId: payload.reporter.id,
      },
      'Safety report notification email failed',
    );
  }
}
