import { computed, ref, type Ref } from 'vue';

export function useDmCallState(isInDMChat: Ref<boolean>) {
  const dmCallWithUserId = ref<string | null>(null);
  const dmCallMuted = ref(false);
  const dmCallDeafened = ref(false);
  const dmCallVideo = ref(false);
  const dmCallFullscreen = ref(false);

  const dmCallQuarterView = computed(
    () =>
      !!(isInDMChat.value && dmCallWithUserId.value && !dmCallFullscreen.value),
  );

  function startDmCall(partnerUserId: string | null) {
    if (!partnerUserId) return;
    dmCallWithUserId.value = partnerUserId;
    dmCallFullscreen.value = false;
  }

  function startGroupCall(groupId: string | null) {
    if (!groupId) return;
    dmCallWithUserId.value = groupId;
    dmCallFullscreen.value = false;
  }

  function endDmCall() {
    dmCallWithUserId.value = null;
    dmCallFullscreen.value = false;
  }

  return {
    dmCallWithUserId,
    dmCallMuted,
    dmCallDeafened,
    dmCallVideo,
    dmCallFullscreen,
    dmCallQuarterView,
    startDmCall,
    startGroupCall,
    endDmCall,
  };
}
