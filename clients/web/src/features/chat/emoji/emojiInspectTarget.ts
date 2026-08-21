/**
 * Locate emoji elements in chat message HTML that should open the inspect popover.
 */

const INSPECT_ZONE_SELECTOR = '.message-content, .markdown-preview__content';

const EXCLUDED_ANCESTOR_SELECTOR = [
  '.reaction-pill',
  '.emoji-btn',
  '.emoji-autocomplete-popover',
  '.chat-popout',
  '.message-reaction-emoji-popover',
  '.poll-emoji-popover',
  '.emoji-picker-body-scroll',
  '.emoji-nav-wrap',
].join(', ');

const EMOJI_TARGET_SELECTOR = [
  'img.custom-emoji[data-emoji-id]',
  'img.emoji:not(.custom-emoji):not(.app-inline-icon)',
  '[data-emoji-id][data-emoji-name]',
  '.twemoji-char',
].join(', ');

export type EmojiInspectAnchor =
  | { kind: 'unicode'; emoji: string }
  | { kind: 'custom'; id: string; name: string; animated: boolean };

export function isEmojiInspectExcluded(target: Element): boolean {
  return Boolean(target.closest(EXCLUDED_ANCESTOR_SELECTOR));
}

export function isEmojiInspectZone(target: Element): boolean {
  return Boolean(target.closest(INSPECT_ZONE_SELECTOR));
}

/** Nearest inspectable emoji element for positioning and parsing. */
export function findEmojiInspectElement(target: Element): HTMLElement | null {
  if (isEmojiInspectExcluded(target)) return null;
  if (!isEmojiInspectZone(target)) return null;
  if (target.closest('[data-mention-user], [data-mention-channel], a[href]')) {
    return null;
  }
  const el = target.closest(EMOJI_TARGET_SELECTOR);
  return el instanceof HTMLElement ? el : null;
}

export function parseEmojiInspectAnchor(
  el: HTMLElement,
): EmojiInspectAnchor | null {
  const customImg = el.matches('img.custom-emoji[data-emoji-id]')
    ? el
    : el.closest('img.custom-emoji[data-emoji-id]');
  if (customImg instanceof HTMLImageElement) {
    const id = customImg.getAttribute('data-emoji-id')?.trim();
    if (!id) return null;
    const name =
      customImg.getAttribute('data-emoji-name')?.trim() ||
      customImg
        .getAttribute('alt')
        ?.trim()
        .replace(/^:/, '')
        .replace(/:$/, '') ||
      'emoji';
    const animated = customImg.getAttribute('data-emoji-animated') === 'true';
    return { kind: 'custom', id, name, animated };
  }

  const mention = el.matches('[data-emoji-id][data-emoji-name]')
    ? el
    : el.closest('[data-emoji-id][data-emoji-name]');
  if (mention instanceof HTMLElement) {
    const id = mention.getAttribute('data-emoji-id')?.trim();
    const name = mention.getAttribute('data-emoji-name')?.trim();
    if (!id || !name) return null;
    const animated = mention.getAttribute('data-emoji-animated') === 'true';
    return { kind: 'custom', id, name, animated };
  }

  const unicodeImg = el.matches('img.emoji')
    ? el
    : el.closest('img.emoji:not(.custom-emoji):not(.app-inline-icon)');
  if (unicodeImg instanceof HTMLImageElement) {
    const emoji =
      unicodeImg.getAttribute('data-echo-unicode-emoji')?.trim() ||
      unicodeImg.getAttribute('alt')?.trim();
    if (emoji) return { kind: 'unicode', emoji };
  }

  const twChar = el.matches('.twemoji-char') ? el : el.closest('.twemoji-char');
  if (twChar instanceof HTMLElement) {
    const native = twChar.querySelector('.twemoji-native');
    const emoji = native?.textContent?.trim();
    if (emoji) return { kind: 'unicode', emoji };
  }

  return null;
}
