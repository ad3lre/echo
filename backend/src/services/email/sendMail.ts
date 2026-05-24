import nodemailer from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../../config';

export type MailAttachment = {
  filename: string;
  content: string | Buffer;
  contentType?: string;
};

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Overrides config.echoEmailFrom when set (e.g. bug reports). */
  from?: string;
  /** Optional Reply-To header (e.g. for support form so we can reply to the user). */
  replyTo?: string;
  attachments?: MailAttachment[];
};

function smtpConfigured(): boolean {
  return Boolean(config.echoSmtpHost?.trim());
}

/**
 * Sends via SMTP when ECHO_SMTP_HOST is set; otherwise logs (dev / misconfiguration).
 */
export async function sendTransactionalEmail(
  log: FastifyBaseLogger,
  mail: OutboundMail,
): Promise<void> {
  if (!smtpConfigured()) {
    log.info(
      {
        msg: 'email_outbound_skipped_no_smtp',
        to: mail.to,
        subject: mail.subject,
        textLength: mail.text.length,
        htmlLength: mail.html.length,
      },
      'Transactional email skipped (ECHO_SMTP_HOST unset)',
    );
    return;
  }

  const transport = nodemailer.createTransport({
    host: config.echoSmtpHost!,
    port: config.echoSmtpPort,
    secure: config.echoSmtpSecure,
    ...(config.echoSmtpUser || config.echoSmtpPassword
      ? {
          auth: {
            user: config.echoSmtpUser ?? '',
            pass: config.echoSmtpPassword ?? '',
          },
        }
      : {}),
  });

  await transport.sendMail({
    from: mail.from?.trim() || config.echoEmailFrom,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    ...(mail.attachments?.length
      ? {
          attachments: mail.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            ...(a.contentType ? { contentType: a.contentType } : {}),
          })),
        }
      : {}),
  });
  log.info(
    { msg: 'email_outbound_sent', to: mail.to, subject: mail.subject },
    'Transactional email sent via SMTP',
  );
}
