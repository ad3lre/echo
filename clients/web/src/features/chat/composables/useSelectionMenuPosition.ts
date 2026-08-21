export function updateSelectionMenuPosition(options: {
  textarea: HTMLTextAreaElement | null;
  mirror: HTMLDivElement | null;
  menu: HTMLElement | null;
  text: string;
  selectionStart: number;
  selectionEnd: number;
}): { top: number; left: number } | null {
  const { textarea, mirror, menu, text, selectionStart, selectionEnd } =
    options;
  if (!textarea || !mirror || selectionEnd <= selectionStart) return null;

  const mid = Math.floor((selectionStart + selectionEnd) / 2);
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const before = escape(text.slice(0, mid));
  const after = escape(text.slice(mid));
  mirror.innerHTML = before + '<span data-sel-marker></span>' + after;
  mirror.scrollTop = textarea.scrollTop;
  mirror.scrollLeft = textarea.scrollLeft;

  const marker = mirror.querySelector('[data-sel-marker]');
  if (!marker) return null;

  const markerRect = marker.getBoundingClientRect();
  const menuHeight = menu ? menu.offsetHeight : 44;
  const menuWidth = menu ? menu.offsetWidth : 200;
  const gap = 10;

  let top = markerRect.top - menuHeight - gap;
  let left = markerRect.left + markerRect.width / 2;
  const padding = 12;
  const minLeft = padding + menuWidth / 2;
  const maxLeft = window.innerWidth - padding - menuWidth / 2;
  left = Math.max(minLeft, Math.min(maxLeft, left));
  top = Math.max(padding, top);

  return { top, left };
}
