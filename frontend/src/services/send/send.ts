import type { MainSurface } from '@/features/layout/mainSurface';
import {
  executeShellSend,
  type SocketSendFn,
} from '@/features/chat/sendIntent';
import {
  buildSendIntent,
  type ShellSendPayload,
} from '@/services/domain/sendIntent';
import type { OutgoingContentType } from '@/services/domain/permissions';

export type SendServiceDeps = {
  getChatPermissions: (
    channelId: string,
    types: OutgoingContentType[],
  ) => string | null;
  /** Reserved for future surface checks; not used by `createSendService` today. */
  getMainSurface: () => MainSurface;
  socketSend: SocketSendFn;
};

// Factory used because runtime deps (socket & permission getters) are required.
export function createSendService(deps: SendServiceDeps) {
  const { getChatPermissions, socketSend } = deps;
  return {
    sendMessage(channelId: string, payload: ShellSendPayload) {
      const intent = buildSendIntent(channelId, payload);
      executeShellSend(intent, {
        getBlockReason: getChatPermissions,
        socketSend,
      });
    },
  };
}
