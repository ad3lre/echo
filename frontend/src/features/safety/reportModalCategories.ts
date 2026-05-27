import type { EchoReportCategory } from '@shared/safetyReports';

export const REPORT_CATEGORY_LABELS: Record<EchoReportCategory, string> = {
  spam: 'Spam',
  harassment: 'Harassment or bullying',
  hate: 'Hate speech',
  sexual: 'Sexual content',
  violence: 'Violence or threats',
  impersonation: 'Impersonation',
  other: 'Other',
};

export const REPORT_CATEGORY_HINTS: Record<EchoReportCategory, string> = {
  spam: 'Unwanted ads, scams, or repetitive messages',
  harassment: 'Bullying, threats, or targeted abuse',
  hate: 'Attacks based on identity or protected traits',
  sexual: 'NSFW content shared without consent',
  violence: 'Threats of harm or glorifying violence',
  impersonation: 'Pretending to be someone else',
  other: 'Something else not listed above',
};
