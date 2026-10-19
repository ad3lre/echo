import { echoT } from '@/i18n';
import type { EchoReportCategory } from '@shared/safetyReports';

export function reportCategoryLabels(): Record<EchoReportCategory, string> {
  return {
    spam: echoT('safety.spam'),
    harassment: echoT('safety.harassmentOrBullying'),
    hate: echoT('safety.hateSpeech'),
    sexual: echoT('safety.sexualContent'),
    violence: echoT('safety.violenceOrThreats'),
    impersonation: echoT('safety.impersonation'),
    other: echoT('safety.other'),
  };
}

export function reportCategoryHints(): Record<EchoReportCategory, string> {
  return {
    spam: echoT('safety.hints.spam'),
    harassment: echoT('safety.hints.harassment'),
    hate: echoT('safety.hints.hate'),
    sexual: echoT('safety.hints.sexual'),
    violence: echoT('safety.hints.violence'),
    impersonation: echoT('safety.hints.impersonation'),
    other: echoT('safety.hints.other'),
  };
}

/** @deprecated Prefer reportCategoryLabels() so locale switches refresh copy. */
export const REPORT_CATEGORY_LABELS: Record<EchoReportCategory, string> =
  new Proxy({} as Record<EchoReportCategory, string>, {
    get(_t, prop: string) {
      return reportCategoryLabels()[prop as EchoReportCategory];
    },
  });

/** @deprecated Prefer reportCategoryHints() so locale switches refresh copy. */
export const REPORT_CATEGORY_HINTS: Record<EchoReportCategory, string> =
  new Proxy({} as Record<EchoReportCategory, string>, {
    get(_t, prop: string) {
      return reportCategoryHints()[prop as EchoReportCategory];
    },
  });
