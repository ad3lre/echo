import { describe, expect, it } from 'vitest';
import { buildMessageRowShellLayout } from './messageRowShellLayout';
import type { MessageListRowPresentation } from '@/features/chat/presentation/messageListRowPresentation';

function makeRow(
  overrides: Partial<MessageListRowPresentation> = {},
): MessageListRowPresentation {
  return {
    message: {
      id: 'm1',
      authorId: 'u1',
      timestamp: '2026-04-12T10:00:00.000Z',
      contentText: 'hello world',
      author: { id: 'u1', name: 'Ada', avatar: '' },
    },
    showAvatar: true,
    showHeaderTimestamp: true,
    showGutterHoverTime: false,
    showDaySeparatorBefore: false,
    daySeparatorLabel: '',
    replyPreview: undefined,
    isCompact: false,
    readState: 'read',
    showUnreadSeparatorBefore: false,
    layout: {
      groupedWithPrevious: false,
      groupedWithNext: false,
      isFirstInList: false,
      isLastInList: false,
    },
    ...overrides,
  } as MessageListRowPresentation;
}

describe('buildMessageRowShellLayout', () => {
  it('builds grouped shell rows without header chrome', () => {
    const shell = buildMessageRowShellLayout(
      makeRow({
        layout: {
          groupedWithPrevious: true,
          groupedWithNext: true,
          isFirstInList: false,
          isLastInList: false,
        },
      }),
      'Ada',
    );
    expect(shell.grouped).toBe(true);
    expect(shell.bodyLines.length).toBeGreaterThan(0);
  });

  it('marks system messages separately from chat rows', () => {
    const shell = buildMessageRowShellLayout(
      makeRow({
        message: {
          id: 'sys1',
          authorId: 'system',
          timestamp: '2026-04-12T10:00:00.000Z',
          content: 'User joined',
          contentText: 'User joined',
          systemMessage: true,
          author: { id: 'system', name: 'System', avatar: '' },
        },
      }),
      'System',
    );
    expect(shell.isSystemMessage).toBe(true);
    expect(shell.systemText).toBe('User joined');
  });
});
