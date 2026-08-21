import { ref, onMounted, onUnmounted } from 'vue';

export function useShiftKey() {
  const shiftPressed = ref(false);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Shift') shiftPressed.value = true;
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key === 'Shift') shiftPressed.value = false;
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  });

  return { shiftPressed };
}
