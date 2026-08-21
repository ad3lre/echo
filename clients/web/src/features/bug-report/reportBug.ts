import { postEchoBugReport } from '@/api/echo/bugReports';
import { trimTraceIfNeededForSubmit } from '@/observability/bugHunterTrace';

export async function reportBug(options: { description: string }) {
  const description = options.description.trim();
  if (!description) {
    throw new Error('Describe what went wrong before submitting.');
  }

  const tracePayload = trimTraceIfNeededForSubmit(400_000);
  /* Echo API uses cookie session (`echoFetch` ignores bearer token). */
  await postEchoBugReport(null, {
    description,
    client: {
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      mode: import.meta.env.MODE,
    },
    trace: {
      traceTruncated: tracePayload.truncated,
      entries: tracePayload.entries,
    },
    attachmentUrls: [],
  });
}
