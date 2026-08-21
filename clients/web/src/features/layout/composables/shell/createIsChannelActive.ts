import type { Ref } from 'vue';

export function createIsChannelActive(activeChannelId: Ref<string>) {
  return (cid: string) => cid === activeChannelId.value;
}
