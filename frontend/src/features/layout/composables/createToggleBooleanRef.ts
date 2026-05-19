import type { Ref } from 'vue';

export function createToggleBooleanRef(target: Ref<boolean>) {
  return () => {
    target.value = !target.value;
  };
}
