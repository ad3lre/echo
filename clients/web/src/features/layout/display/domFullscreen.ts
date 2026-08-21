type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};

export function getFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function elementSupportsFullscreen(
  el: HTMLElement | null | undefined,
): boolean {
  if (!el) return false;
  const node = el as FullscreenCapableElement;
  return (
    typeof node.requestFullscreen === 'function' ||
    typeof node.webkitRequestFullscreen === 'function'
  );
}

export async function requestElementFullscreen(el: HTMLElement): Promise<void> {
  const node = el as FullscreenCapableElement;
  if (typeof node.requestFullscreen === 'function') {
    await node.requestFullscreen();
    return;
  }
  node.webkitRequestFullscreen?.();
}

export async function exitDocumentFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return;
  const doc = document as FullscreenDocument;
  if (typeof doc.exitFullscreen === 'function') {
    await doc.exitFullscreen();
    return;
  }
  doc.webkitExitFullscreen?.();
}

export function isElementFullscreen(
  el: HTMLElement | null | undefined,
): boolean {
  if (!el) return false;
  return getFullscreenElement() === el;
}
