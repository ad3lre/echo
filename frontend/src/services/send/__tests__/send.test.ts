import { describe, it, expect } from 'vitest';
import type { SocketSendFn } from '@/features/chat/sendIntent';
import type { MainSurface } from '@/features/layout/mainSurface';
import { createSendService } from '../send';

describe('createSendService', () => {
  it('returns an object with sendMessage and does not throw when socketSend provided', () => {
    const socketCalls: unknown[][] = [];
    const socketSend: SocketSendFn = (...args) => {
      socketCalls.push(args);
    };
    const deps = {
      getChatPermissions: () => null,
      getMainSurface: (): MainSurface => ({ type: 'explore' }),
      socketSend,
    };
    const svc = createSendService(deps);
    expect(typeof svc.sendMessage).toBe('function');
    svc.sendMessage('chan1', { content: 'hi' });
    expect(socketCalls.length).toBe(1);
  });
});
