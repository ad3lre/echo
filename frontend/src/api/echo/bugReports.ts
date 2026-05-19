import { echoFetch } from './transport';

export type EchoBugReportPayload = {
  description: string;
  client: { userAgent?: string; mode?: string };
  trace: unknown;
  attachmentUrls: string[];
};

export async function postEchoBugReport(
  token: string | null,
  body: EchoBugReportPayload,
): Promise<{ id: string; ok: boolean }> {
  return echoFetch<{ id: string; ok: boolean }>(token, '/bug-reports', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
