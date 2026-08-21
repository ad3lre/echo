import { onMounted, onUnmounted, type Ref } from 'vue';
import {
  findActionForKeyboardEvent,
  loadKeybindMap,
} from '@/features/settings/keybindPreferences';

/** User-facing shortcut label for Paper raw/rendered toggle UI hints. */
export function paperSourceViewKeybindLabel(): string {
  return loadKeybindMap()['paper.toggleSourceView'] || 'Ctrl+Alt+M';
}

export function createPaperSourceViewKeydownHandler(opts: {
  enabled: () => boolean;
  onToggle: () => void;
}): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (!opts.enabled()) return;
    if (e.defaultPrevented || e.isComposing) return;
    if (findActionForKeyboardEvent(e) !== 'paper.toggleSourceView') return;
    e.preventDefault();
    opts.onToggle();
  };
}

/** Toggle Paper raw markdown vs rendered preview (works in editor and raw textarea). */
export function usePaperSourceViewKeybind(opts: {
  enabled: Ref<boolean>;
  onToggle: () => void;
}) {
  const onKeydown = createPaperSourceViewKeydownHandler({
    enabled: () => opts.enabled.value,
    onToggle: opts.onToggle,
  });

  onMounted(() => {
    window.addEventListener('keydown', onKeydown, true);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown, true);
  });
}
