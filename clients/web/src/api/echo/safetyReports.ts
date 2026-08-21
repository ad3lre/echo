import type { EchoReportCategory } from '@shared/safetyReports';
import { echoFetch } from './transport';

export type EchoReportUserBody = {
  targetUserId: string;
  reason?: string;
  category?: EchoReportCategory;
  messageId?: string;
  channelId?: string;
};

export type EchoReportMessageBody = {
  messageId: string;
  channelId: string;
  reason?: string;
  category?: EchoReportCategory;
};

export async function postEchoReportUser(
  token: string,
  body: EchoReportUserBody,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(token, '/reports/user', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function postEchoReportMessage(
  token: string,
  body: EchoReportMessageBody,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(token, '/reports/message', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
