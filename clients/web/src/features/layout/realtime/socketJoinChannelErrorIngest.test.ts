import type { JoinChannelErrorPayload } from '@shared/types';
import { describe, expect, it, vi } from 'vitest';
import {
  ingestEchoSocketJoinChannelError,
  isJoinChannelErrorPayload,
} from '@/features/layout/realtime/socketJoinChannelErrorIngest';

describe('socketJoinChannelErrorIngest', () => {
  it('recognizes join channel error payloads', () => {
    expect(
      isJoinChannelErrorPayload({
        code: 'FORBIDDEN',
        channelId: 'ch1',
        detail: 'nope',
      }),
    ).toBe(true);
    expect(isJoinChannelErrorPayload({ code: 'OTHER' })).toBe(false);
  });

  it('notifies when active channel join is denied', () => {
    const onPermissionDenied = vi.fn();
    ingestEchoSocketJoinChannelError(
      {
        code: 'FORBIDDEN',
        channelId: 'ch1',
        detail: 'denied',
      } satisfies JoinChannelErrorPayload,
      {
        activeChannelId: () => 'ch1',
        onPermissionDenied,
      },
    );
    expect(onPermissionDenied).toHaveBeenCalledOnce();
  });
});
