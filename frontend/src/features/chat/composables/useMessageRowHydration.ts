import { onUnmounted, ref, shallowRef, watch, type ShallowRef } from 'vue';
import {
  createMessageRowHydrationQueue,
  type MessageRowHydrationQueue,
} from '@/features/chat/domain/messageRowHydrationQueue';

export type UseMessageRowHydrationOptions = {
  channelId: () => string | null | undefined;
  isUserScrollActive: () => boolean;
  getVisibleMessageIds: () => readonly string[];
  maxBatchSize?: number;
};

type HydrationCtx = {
  queue: ShallowRef<MessageRowHydrationQueue>;
  hydrationEpoch: { value: number };
  hydrateRaf: { current: number | null };
  options: UseMessageRowHydrationOptions;
};

function bumpHydrationEpoch(ctx: HydrationCtx): void {
  ctx.hydrationEpoch.value++;
}

function flushHydrationQueue(ctx: HydrationCtx): void {
  const cid = ctx.options.channelId()?.trim();
  if (!cid || ctx.options.isUserScrollActive()) return;

  const visible = ctx.options.getVisibleMessageIds();
  ctx.queue.value.enqueue(cid, visible);

  let batch = ctx.queue.value.dequeueBatch(cid);
  let hydratedAny = false;
  while (batch.length > 0) {
    hydratedAny = true;
    if (ctx.options.isUserScrollActive()) break;
    batch = ctx.queue.value.dequeueBatch(cid);
  }
  if (hydratedAny) bumpHydrationEpoch(ctx);

  if (!ctx.options.isUserScrollActive() && ctx.queue.value.queueLength > 0) {
    scheduleHydrationPass(ctx);
  }
}

function scheduleHydrationPass(ctx: HydrationCtx): void {
  if (ctx.hydrateRaf.current != null) return;
  ctx.hydrateRaf.current = requestAnimationFrame(() => {
    ctx.hydrateRaf.current = null;
    flushHydrationQueue(ctx);
  });
}

function bindMessageRowHydration(ctx: HydrationCtx) {
  return {
    isRowHydrated(messageId: string | null | undefined): boolean {
      const cid = ctx.options.channelId()?.trim();
      const mid = messageId?.trim();
      if (!cid || !mid) return false;
      return ctx.queue.value.isHydrated(cid, mid);
    },
    scheduleHydrationPass: () => scheduleHydrationPass(ctx),
    onScrollActivityChanged(active: boolean): void {
      if (active) return;
      const cid = ctx.options.channelId()?.trim();
      if (!cid) return;
      ctx.queue.value.enqueue(cid, ctx.options.getVisibleMessageIds());
      scheduleHydrationPass(ctx);
    },
    prioritizeMessage(messageId: string | null | undefined): void {
      const cid = ctx.options.channelId()?.trim();
      const mid = messageId?.trim();
      if (!cid || !mid) return;
      ctx.queue.value.enqueue(cid, [mid]);
      scheduleHydrationPass(ctx);
    },
    resetForChannel(channelId: string | null | undefined): void {
      const cid = channelId?.trim();
      if (cid) ctx.queue.value.clearChannel(cid);
      bumpHydrationEpoch(ctx);
    },
    forceHydrateMessage(messageId: string | null | undefined): void {
      const cid = ctx.options.channelId()?.trim();
      const mid = messageId?.trim();
      if (!cid || !mid) return;
      ctx.queue.value.markHydrated(cid, mid);
      bumpHydrationEpoch(ctx);
    },
  };
}

export function useMessageRowHydration(options: UseMessageRowHydrationOptions) {
  const ctx: HydrationCtx = {
    queue: shallowRef(
      createMessageRowHydrationQueue({
        maxBatchSize: options.maxBatchSize ?? 8,
      }),
    ),
    hydrationEpoch: ref(0),
    hydrateRaf: { current: null },
    options,
  };

  const actions = bindMessageRowHydration(ctx);

  watch(
    () => options.channelId()?.trim() ?? '',
    (next, prev) => {
      if (prev && prev !== next) ctx.queue.value.clearQueuedChannel(prev);
      bumpHydrationEpoch(ctx);
    },
  );

  onUnmounted(() => {
    if (ctx.hydrateRaf.current != null) {
      cancelAnimationFrame(ctx.hydrateRaf.current);
    }
    ctx.hydrateRaf.current = null;
    ctx.queue.value.reset();
  });

  return {
    hydrationEpoch: ctx.hydrationEpoch,
    ...actions,
    queue: ctx.queue,
  };
}
