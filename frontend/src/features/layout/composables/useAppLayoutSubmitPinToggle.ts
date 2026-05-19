import type { ComputedRef } from 'vue';
import {
  newUiCorrelationId,
  type UiTransactionManager,
} from '@/ui/transactions/TransactionManager';
import { propagateActionFailure } from '@/utils/actionFailurePropagation';

type PinSocketSubmit = (
  channelId: string,
  messageId: string,
  correlationId?: string,
) => Promise<{ ok: boolean }>;

/**
 * Pin / unpin with optional optimistic UI transaction + socket submit + rollback on failure.
 */
export function createSubmitPinToggle(deps: {
  pinChannelId: ComputedRef<string>;
  getPinnedIdsSnapshot: (channelId: string) => string[];
  isLiveReactionReady: () => boolean;
  uiTransactions: Pick<
    UiTransactionManager,
    'beginTransaction' | 'rollbackTransaction'
  >;
  pinMessage: (channelId: string, messageId: string) => void;
  unpinMessage: (channelId: string, messageId: string) => void;
  submitPinViaSocket: PinSocketSubmit;
  submitUnpinViaSocket: PinSocketSubmit;
}) {
  return function submitPinToggle(kind: 'pin' | 'unpin', mid: string) {
    const cid = deps.pinChannelId.value;
    if (!cid) return;
    let corr: string | undefined;
    if (deps.isLiveReactionReady()) {
      corr = newUiCorrelationId();
      deps.uiTransactions.beginTransaction({
        id: corr,
        type: 'message-pin',
        state: 'pending',
        channelId: cid,
        messageId: mid,
        correlationId: corr,
        kind,
        previousPinnedIds: deps.getPinnedIdsSnapshot(cid),
      });
      (kind === 'pin' ? deps.pinMessage : deps.unpinMessage)(cid, mid);
    }
    const submit =
      kind === 'pin' ? deps.submitPinViaSocket : deps.submitUnpinViaSocket;
    void (async () => {
      const r = await submit(cid, mid, corr);
      if (!r.ok) {
        if (corr) deps.uiTransactions.rollbackTransaction(corr);
        propagateActionFailure(r, {
          flow: `socket.message_${kind}`,
          context: `${kind}_message`,
        });
      }
    })();
  };
}
