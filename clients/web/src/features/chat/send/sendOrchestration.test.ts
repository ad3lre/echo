import { describe, it, expect } from 'vitest';
import type { SocketSendFn } from '@/features/chat/sendIntent';
import type { MainSurface } from '@/features/layout/mainSurface';
import { createSendOrchestrationFactory } from '@/features/chat/send/sendOrchestration';

describe('send orchestration', () => {
  it('provides a factory that creates a send service', () => {
    const orchestration = createSendOrchestrationFactory();
    const socketSend: SocketSendFn = () => {};
    const deps = {
      getChatPermissions: () => null,
      getMainSurface: (): MainSurface => ({ type: 'explore' }),
      socketSend,
    };
    const sendSvc = orchestration.createSendService(deps);
    expect(typeof sendSvc.sendMessage).toBe('function');
  });
});
