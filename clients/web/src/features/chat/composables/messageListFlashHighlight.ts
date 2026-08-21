/**
 * Retry a message-row highlight class after the virtualizer has painted the node.
 * Does not write scroll. Caller should invoke after Vue `nextTick`.
 */

export const MESSAGE_LIST_FLASH_HIGHLIGHT_MS = 2000;
export const MESSAGE_LIST_FLASH_HIGHLIGHT_ATTEMPTS = 2;

function queryMessageElement(root: Element, messageId: string): Element | null {
  try {
    return root.querySelector(`#${CSS.escape(`message-${messageId}`)}`);
  } catch {
    return root.querySelector(
      `[id="message-${String(messageId).replace(/"/g, '')}"]`,
    );
  }
}

export function flashMessageHighlightInRoot(
  root: HTMLElement | null,
  messageId: string,
): void {
  const tryFlash = (): boolean => {
    if (!root) return false;
    const el = queryMessageElement(root, messageId);
    if (!el) return false;
    el.classList.add('message-highlight');
    setTimeout(
      () => el.classList.remove('message-highlight'),
      MESSAGE_LIST_FLASH_HIGHLIGHT_MS,
    );
    return true;
  };

  let attempt = 0;
  const step = () => {
    attempt++;
    if (attempt > MESSAGE_LIST_FLASH_HIGHLIGHT_ATTEMPTS) return;
    if (tryFlash()) return;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
