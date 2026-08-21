/**
 * Central invalidation API for message list row presentation updates.
 * Propagates dirty IDs to neighbors when grouping may change.
 */

export type MessageListRowInvalidationReason =
  | 'message_entity'
  | 'author_profile'
  | 'role_color'
  | 'reaction'
  | 'own_reaction'
  | 'message_delete'
  | 'message_edit'
  | 'moderation'
  | 'append'
  | 'prepend'
  | 'embed_enrichment'
  | 'presence'
  | 'typing'
  | 'permission'
  | 'structural';

/** Reasons that must apply immediately even during active scroll. */
export const MESSAGE_LIST_IMMEDIATE_INVALIDATION_REASONS =
  new Set<MessageListRowInvalidationReason>([
    'own_reaction',
    'message_delete',
    'message_edit',
    'moderation',
    'append',
    'prepend',
    'structural',
  ]);

export type MessageListRowInvalidationControllerOptions = {
  /** Max dirty IDs processed per drain pass (settle budget). */
  drainBudgetPerPass: number;
};

export function createMessageListRowInvalidationController(
  options: Partial<MessageListRowInvalidationControllerOptions> = {},
) {
  const drainBudget = options.drainBudgetPerPass ?? 32;
  const dirtyImmediate = new Set<string>();
  const dirtyDeferred = new Set<string>();

  function propagateNeighbors(
    orderedIds: readonly string[],
    seedIds: Iterable<string>,
    out: Set<string>,
  ): void {
    const indexById = new Map<string, number>();
    for (let i = 0; i < orderedIds.length; i++) {
      indexById.set(orderedIds[i]!, i);
    }
    for (const id of seedIds) {
      const mid = id.trim();
      if (!mid) continue;
      out.add(mid);
      const idx = indexById.get(mid);
      if (idx == null) continue;
      if (idx > 0) out.add(orderedIds[idx - 1]!);
      if (idx + 1 < orderedIds.length) out.add(orderedIds[idx + 1]!);
    }
  }

  function invalidate(
    reason: MessageListRowInvalidationReason,
    orderedIds: readonly string[],
    seedIds: readonly string[],
    isUserScrollActive: boolean,
  ): ReadonlySet<string> {
    const batch = new Set<string>();
    propagateNeighbors(orderedIds, seedIds, batch);
    const immediate =
      MESSAGE_LIST_IMMEDIATE_INVALIDATION_REASONS.has(reason) ||
      !isUserScrollActive;
    const target = immediate ? dirtyImmediate : dirtyDeferred;
    for (const id of batch) target.add(id);
    return batch;
  }

  function drain(isUserScrollActive: boolean): string[] {
    const source =
      isUserScrollActive && dirtyImmediate.size === 0
        ? null
        : dirtyImmediate.size > 0
          ? dirtyImmediate
          : dirtyDeferred;
    if (!source || source.size === 0) return [];
    const out: string[] = [];
    for (const id of source) {
      out.push(id);
      source.delete(id);
      if (out.length >= drainBudget) break;
    }
    return out;
  }

  function peekDirtyCount(): number {
    return dirtyImmediate.size + dirtyDeferred.size;
  }

  function flushDeferredToImmediate(): void {
    for (const id of dirtyDeferred) dirtyImmediate.add(id);
    dirtyDeferred.clear();
  }

  function reset(): void {
    dirtyImmediate.clear();
    dirtyDeferred.clear();
  }

  return {
    invalidate,
    drain,
    peekDirtyCount,
    flushDeferredToImmediate,
    reset,
  };
}

export type MessageListRowInvalidationController = ReturnType<
  typeof createMessageListRowInvalidationController
>;

export function shouldDeferInvalidationReason(
  reason: MessageListRowInvalidationReason,
  isUserScrollActive: boolean,
): boolean {
  if (!isUserScrollActive) return false;
  return !MESSAGE_LIST_IMMEDIATE_INVALIDATION_REASONS.has(reason);
}
