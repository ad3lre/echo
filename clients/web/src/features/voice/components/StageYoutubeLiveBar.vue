<script setup lang="ts">
import StageYoutubeGoLiveControls from '@/features/voice/components/StageYoutubeGoLiveControls.vue';

withDefaults(
  defineProps<{
    echoServerId: string;
    stageChannelId: string;
    canManage: boolean;
    callViewHeader?: boolean;
  }>(),
  { callViewHeader: false },
);
</script>

<template>
  <StageYoutubeGoLiveControls
    :echo-server-id="echoServerId"
    :stage-channel-id="stageChannelId"
    :can-manage="canManage"
    :call-view-header="callViewHeader"
    hide-when-idle-for-audience
  />
</template>
