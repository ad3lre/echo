import { buildTransactionalEmailHtml } from './transactionalEmailHtml';

export function buildNewIpLoginOtpEmailContent(input: {
  username: string;
  code: string;
  ttlMinutes: number;
}): { subject: string; text: string; html: string } {
  const subject = 'Confirm a new sign-in to Echo';
  const text = [
    `Hi ${input.username},`,
    '',
    'We noticed a sign-in from a device or network we do not recognize yet.',
    `Your verification code is: ${input.code}`,
    '',
    `This code expires in ${input.ttlMinutes} minutes.`,
    'If you did not try to sign in, change your password and ignore this message.',
    '— Echo',
  ].join('\n');

  const html = buildTransactionalEmailHtml({
    documentTitle: subject,
    preheader: `Your Echo sign-in code is ${input.code}`,
    greetingName: input.username,
    bodyParagraphs: [
      'We noticed a sign-in from a device or network we do not recognize yet.',
      `Your verification code is: ${input.code}`,
      `This code expires in ${input.ttlMinutes} minutes.`,
    ],
    finePrint:
      'If you did not try to sign in, change your password and ignore this message.',
  });

  return { subject, text, html };
}
