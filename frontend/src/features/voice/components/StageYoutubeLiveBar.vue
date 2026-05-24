<script setup lang="ts">
import StageYoutubeGoLiveControls from '@/features/voice/components/StageYoutubeGoLiveControls.vue';

defineProps<{
  echoServerId: string;
  stageChannelId: string;
  canManage: boolean;
}>();
</script>

<template>
  <StageYoutubeGoLiveControls
    :echo-server-id="echoServerId"
    :stage-channel-id="stageChannelId"
    :can-manage="canManage"
    hide-when-idle-for-audience
  />
</template>
