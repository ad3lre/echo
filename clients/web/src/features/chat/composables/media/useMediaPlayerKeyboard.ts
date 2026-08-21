import { onMounted, onUnmounted, type Ref } from 'vue';

export type MediaPlayerKeyboardActions = {
  togglePlay: () => void;
  toggleMute: () => void;
  seekBy: (delta: number) => void;
  setVolume: (v: number) => void;
  toggleFullscreen?: () => void;
};

export function useMediaPlayerKeyboard(
  shellRef: Ref<HTMLElement | null | undefined>,
  mediaRef: Ref<HTMLMediaElement | null | undefined>,
  actions: MediaPlayerKeyboardActions,
  options: { allowFullscreen?: boolean } = {},
): void {
  const allowFullscreen = options.allowFullscreen ?? false;

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return target.isContentEditable;
  }

  function onKeydown(e: KeyboardEvent): void {
    const shell = shellRef.value;
    if (
      !shell?.contains(document.activeElement) &&
      document.activeElement !== shell
    ) {
      if (!shell?.contains(e.target as Node)) return;
    }
    if (isTypingTarget(e.target)) return;

    const key = e.key.toLowerCase();
    const handled =
      key === ' ' ||
      key === 'k' ||
      key === 'm' ||
      key === 'f' ||
      key === 'arrowleft' ||
      key === 'arrowright' ||
      key === 'arrowup' ||
      key === 'arrowdown';

    if (!handled) return;

    const el = mediaRef.value;
    if (!el) return;

    switch (key) {
      case ' ':
      case 'k':
        e.preventDefault();
        actions.togglePlay();
        break;
      case 'm':
        e.preventDefault();
        actions.toggleMute();
        break;
      case 'f':
        if (allowFullscreen && actions.toggleFullscreen) {
          e.preventDefault();
          void actions.toggleFullscreen();
        }
        break;
      case 'arrowleft':
        e.preventDefault();
        actions.seekBy(-5);
        break;
      case 'arrowright':
        e.preventDefault();
        actions.seekBy(5);
        break;
      case 'arrowup': {
        e.preventDefault();
        actions.setVolume(Math.min(1, el.volume + 0.05));
        break;
      }
      case 'arrowdown': {
        e.preventDefault();
        actions.setVolume(Math.max(0, el.volume - 0.05));
        break;
      }
      default:
        break;
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', onKeydown);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown);
  });
}
