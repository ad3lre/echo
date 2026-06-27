export const MAX_MESSAGE_TOAST_QUEUE = 25;

export function appendMessageToast<T>(
  queue: readonly T[],
  toast: T,
  max = MAX_MESSAGE_TOAST_QUEUE,
): T[] {
  const next = [...queue, toast];
  if (next.length <= max) return next;
  return next.slice(next.length - max);
}

export function removeMessageToastAtIndex<T>(
  queue: readonly T[],
  index: number,
): { queue: T[]; nextIndex: number } {
  if (index < 0 || index >= queue.length) {
    return {
      queue: [...queue],
      nextIndex: Math.max(0, Math.min(index, queue.length - 1)),
    };
  }
  const next = queue.filter((_, i) => i !== index);
  const nextIndex = next.length === 0 ? 0 : Math.min(index, next.length - 1);
  return { queue: next, nextIndex };
}

export function canNavigateMessageToasts(
  queueLength: number,
  index: number,
  direction: 'prev' | 'next',
): boolean {
  if (queueLength <= 1) return false;
  if (direction === 'prev') return index > 0;
  return index < queueLength - 1;
}

export function messageToastNavLabel(
  index: number,
  queueLength: number,
): string {
  return `${index + 1}/${queueLength}`;
}
