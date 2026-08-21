import type { EchoReportCategory } from '@shared/safetyReports';
import {
  postEchoReportMessage,
  postEchoReportUser,
} from '@/api/echo/safetyReports';
import type { ReportModalContext } from '@/features/safety/reportModal';

export type SubmitSafetyReportInput = {
  token: string;
  context: ReportModalContext;
  category: EchoReportCategory;
  reason: string;
  general?: {
    targetType: 'user' | 'message';
    targetUserId: string;
    messageId: string;
    channelId: string;
  };
};

export async function submitSafetyReport(
  input: SubmitSafetyReportInput,
): Promise<void> {
  const { token, context, category, reason } = input;
  const trimmedReason = reason.trim();

  if (context.kind === 'user') {
    await postEchoReportUser(token, {
      targetUserId: context.targetUserId,
      reason: trimmedReason || undefined,
      category,
      ...(context.messageId ? { messageId: context.messageId } : {}),
      ...(context.channelId ? { channelId: context.channelId } : {}),
    });
    return;
  }

  if (context.kind === 'message') {
    await postEchoReportMessage(token, {
      messageId: context.messageId,
      channelId: context.channelId,
      reason: trimmedReason || undefined,
      category,
    });
    return;
  }

  const general = input.general;
  if (!general) {
    throw new Error('Report details are incomplete.');
  }

  if (general.targetType === 'user') {
    const targetUserId = general.targetUserId.trim();
    if (!targetUserId) throw new Error('User ID is required.');
    await postEchoReportUser(token, {
      targetUserId,
      reason: trimmedReason || undefined,
      category,
      ...(general.messageId.trim() && general.channelId.trim()
        ? {
            messageId: general.messageId.trim(),
            channelId: general.channelId.trim(),
          }
        : {}),
    });
    return;
  }

  const messageId = general.messageId.trim();
  const channelId = general.channelId.trim();
  if (!messageId || !channelId) {
    throw new Error('Message ID and channel ID are required.');
  }
  await postEchoReportMessage(token, {
    messageId,
    channelId,
    reason: trimmedReason || undefined,
    category,
  });
}
