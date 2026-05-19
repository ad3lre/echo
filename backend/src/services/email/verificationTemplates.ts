import { buildTransactionalEmailHtml } from './transactionalEmailHtml';

export function buildSignupVerificationEmailContent(input: {
  username: string;
  verifyUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = 'Verify your Echo account';
  const text = [
    `Hi ${input.username},`,
    '',
    'Confirm this email address to finish setting up your Echo account.',
    '',
    'Open this link (or paste it into your browser):',
    input.verifyUrl,
    '',
    'If you did not create an account, you can ignore this message.',
    '— Echo',
  ].join('\n');

  const html = buildTransactionalEmailHtml({
    documentTitle: subject,
    preheader: 'Confirm your email to finish setting up Echo.',
    greetingName: input.username,
    bodyParagraphs: [
      'Confirm this email address to finish setting up your Echo account.',
    ],
    primaryCta: { label: 'Verify email', href: input.verifyUrl },
    finePrint: 'If you did not create an account, you can ignore this message.',
  });

  return { subject, text, html };
}
