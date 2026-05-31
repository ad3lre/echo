import { describe, expect, it, vi } from 'vitest';
import {
  registerEchoToastQuickReplySender,
  sendEchoToastQuickReply,
} from './echoToastQuickReplyBridge';

describe('echoToastQuickReplyBridge', () => {
  it('forwards text, mentions, and contentJson to the registered sender', () => {
    const sender = vi.fn();
    registerEchoToastQuickReplySender(sender);

    const ok = sendEchoToastQuickReply('ch-1', {
      text: 'hello @Ada',
      mentions: [
        {
          kind: 'user',
          id: 'u1',
          label: '@Ada',
          start: 6,
          end: 10,
          userId: 'u1',
        },
      ],
      contentJson: { type: 'doc' },
      contentSchemaVersion: 1,
    });

    expect(ok).toBe(true);
    expect(sender).toHaveBeenCalledWith('ch-1', {
      text: 'hello @Ada',
      mentions: [
        {
          kind: 'user',
          id: 'u1',
          label: '@Ada',
          start: 6,
          end: 10,
          userId: 'u1',
        },
      ],
      contentJson: { type: 'doc' },
      contentSchemaVersion: 1,
    });

    registerEchoToastQuickReplySender(null);
  });
});
