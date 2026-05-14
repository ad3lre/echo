import type { InjectionKey, Ref } from 'vue';
import { ref } from 'vue';

/**
 * Scroll/jump FAB state for a single MessageList instance.
 * Kept outside the list row render graph: MessageList mutates these refs from scroll
 * handlers without reading them in its template, so hover/ephemeral bubble UI does not
 * rerender when jump visibility or badge counts change. Only MessageListJumpFab injects.
 */
export interface MessageListJumpUi {
  scrollAwayFromBottom: Ref<boolean>;
  pendingNewWhileAway: Ref<number>;
  reset: () => void;
}

export const MESSAGE_LIST_JUMP_UI_KEY: InjectionKey<MessageListJumpUi> =
  Symbol('messageListJumpUi');

export function createMessageListJumpUi(): MessageListJumpUi {
  const scrollAwayFromBottom = ref(false);
  const pendingNewWhileAway = ref(0);

  function reset() {
    pendingNewWhileAway.value = 0;
    scrollAwayFromBottom.value = false;
  }

  return { scrollAwayFromBottom, pendingNewWhileAway, reset };
}
