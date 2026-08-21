import { describe, expect, it, vi } from 'vitest';
import {
  postEchoReportMessage,
  postEchoReportUser,
} from '@/api/echo/safetyReports';
import { submitSafetyReport } from '@/features/safety/submitSafetyReport';

vi.mock('@/api/echo/safetyReports', () => ({
  postEchoReportUser: vi.fn(),
  postEchoReportMessage: vi.fn(),
}));

describe('submitSafetyReport', () => {
  it('submits user report from user context', async () => {
    await submitSafetyReport({
      token: 'tok',
      context: { kind: 'user', targetUserId: 'u2' },
      category: 'spam',
      reason: 'bad',
    });
    expect(postEchoReportUser).toHaveBeenCalledWith('tok', {
      targetUserId: 'u2',
      reason: 'bad',
      category: 'spam',
    });
  });

  it('submits message report from message context', async () => {
    await submitSafetyReport({
      token: 'tok',
      context: {
        kind: 'message',
        messageId: 'm1',
        channelId: 'c1',
        authorId: 'u2',
      },
      category: 'harassment',
      reason: '',
    });
    expect(postEchoReportMessage).toHaveBeenCalledWith('tok', {
      messageId: 'm1',
      channelId: 'c1',
      category: 'harassment',
    });
  });
});
