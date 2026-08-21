import { ECHO_CONTENT_SCHEMA_VERSION } from '@shared/echoMessageFormatV2';
import { socketDiagInfo } from '@/observability/socketDiagnostics';
import type { EchoRealtimePort } from '@/features/layout/realtime/echoRealtimePort';
import type { SocketAdapterInstance } from '@/features/layout/realtime/socketOutbound';
import type { MessageAttachmentPayload } from '@shared/types';
import type { ActionResult } from '@/features/layout/actionResult';

export type EchoSocketSubmitEmitters = Pick<
  EchoRealtimePort,
  | 'submitPollVote'
  | 'submitReactionToggle'
  | 'submitPin'
  | 'submitUnpin'
  | 'submitMessageDelete'
  | 'submitMessageEdit'
  | 'submitImageSlotFill'
  | 'submitDmCallInvite'
  | 'submitDmCallAccept'
  | 'submitDmCallEnd'
>;

export function createEchoSocketSubmitEmitters(opts: {
  tryEmitRealtime: (
    emitFn: (adapter: SocketAdapterInstance) => void,
  ) => ActionResult;
  newCorrelationId: () => string;
}): EchoSocketSubmitEmitters {
  const { tryEmitRealtime, newCorrelationId } = opts;

  async function submitPollVote(
    channelId: string,
    messageId: string,
    optionId: string,
  ): Promise<ActionResult> {
    return Promise.resolve(
      tryEmitRealtime((a) => {
        a.emit('poll:vote', {
          channelId,
          messageId,
          optionId,
          correlationId: newCorrelationId(),
        });
      }),
    );
  }

  async function submitReactionToggle(
    channelId: string,
    messageId: string,
    emoji: string,
    correlationId?: string,
    _ctx?: { removing: boolean },
  ): Promise<ActionResult> {
    const corr = correlationId ?? newCorrelationId();
    return Promise.resolve(
      tryEmitRealtime((a) => {
        a.emit('message:reaction_toggle', {
          channelId,
          messageId,
          emoji,
          correlationId: corr,
        });
      }),
    );
  }

  async function submitPin(
    channelId: string,
    messageId: string,
    correlationId?: string,
  ): Promise<ActionResult> {
    const corr = correlationId ?? newCorrelationId();
    return Promise.resolve(
      tryEmitRealtime((a) => {
        a.emit('message:pin', {
          channelId,
          messageId,
          correlationId: corr,
        });
      }),
    );
  }

  async function submitUnpin(
    channelId: string,
    messageId: string,
    correlationId?: string,
  ): Promise<ActionResult> {
    const corr = correlationId ?? newCorrelationId();
    return Promise.resolve(
      tryEmitRealtime((a) => {
        a.emit('message:unpin', {
          channelId,
          messageId,
          correlationId: corr,
        });
      }),
    );
  }

  async function submitMessageDelete(
    channelId: string,
    messageId: string,
    correlationId?: string,
  ): Promise<ActionResult> {
    const corr = correlationId ?? newCorrelationId();
    return Promise.resolve(
      tryEmitRealtime((a) => {
        a.emit('message:delete', {
          channelId,
          messageId,
          correlationId: corr,
        });
      }),
    );
  }

  async function submitMessageEdit(
    channelId: string,
    messageId: string,
    body: {
      content: string;
      contentJson?: unknown;
      contentSchemaVersion?: number;
      attachments?: MessageAttachmentPayload[];
    },
    correlationId?: string,
  ): Promise<ActionResult> {
    const corr = correlationId ?? newCorrelationId();
    const base = {
      channelId,
      messageId,
      correlationId: corr,
    };
    return Promise.resolve(
      tryEmitRealtime((a) => {
        if (
          body.contentJson !== undefined &&
          body.contentJson !== null &&
          typeof body.contentJson === 'object'
        ) {
          a.emit('message:edit', {
            ...base,
            contentJson: body.contentJson,
            contentSchemaVersion:
              body.contentSchemaVersion ?? ECHO_CONTENT_SCHEMA_VERSION,
            ...(body.attachments !== undefined
              ? { attachments: body.attachments }
              : {}),
          });
        } else {
          a.emit('message:edit', {
            ...base,
            content: body.content,
            ...(body.attachments !== undefined
              ? { attachments: body.attachments }
              : {}),
          });
        }
      }),
    );
  }

  async function submitImageSlotFill(
    channelId: string,
    messageId: string,
    slotId: string,
    body: {
      imageUrl: string;
      storageKey?: string;
      width?: number;
      height?: number;
    },
    correlationId?: string,
  ): Promise<ActionResult> {
    const corr = correlationId ?? newCorrelationId();
    return Promise.resolve(
      tryEmitRealtime((a) => {
        a.emit('message:fillImageSlot', {
          channelId,
          messageId,
          slotId,
          imageUrl: body.imageUrl,
          ...(body.storageKey ? { storageKey: body.storageKey } : {}),
          ...(body.width != null ? { width: body.width } : {}),
          ...(body.height != null ? { height: body.height } : {}),
          correlationId: corr,
        });
      }),
    );
  }

  async function submitDmCallInvite(channelId: string): Promise<ActionResult> {
    const correlationId = newCorrelationId();
    return Promise.resolve(
      tryEmitRealtime((a) => {
        socketDiagInfo('dm_call_invite_emit', {
          channelId,
          correlationId,
        });
        a.emit('dm_call:invite', {
          channelId,
          correlationId,
        });
      }),
    );
  }

  async function submitDmCallAccept(channelId: string): Promise<ActionResult> {
    const correlationId = newCorrelationId();
    return Promise.resolve(
      tryEmitRealtime((a) => {
        socketDiagInfo('dm_call_accept_emit', {
          channelId,
          correlationId,
        });
        a.emit('dm_call:accept', {
          channelId,
          correlationId,
        });
      }),
    );
  }

  async function submitDmCallEnd(
    channelId: string,
    reason: 'ended' | 'declined' = 'ended',
  ): Promise<ActionResult> {
    const correlationId = newCorrelationId();
    return Promise.resolve(
      tryEmitRealtime((a) => {
        socketDiagInfo('dm_call_end_emit', {
          channelId,
          correlationId,
          reason,
        });
        a.emit('dm_call:end', {
          channelId,
          correlationId,
          reason,
        });
      }),
    );
  }

  return {
    submitPollVote,
    submitReactionToggle,
    submitPin,
    submitUnpin,
    submitMessageDelete,
    submitMessageEdit,
    submitImageSlotFill,
    submitDmCallInvite,
    submitDmCallAccept,
    submitDmCallEnd,
  };
}
