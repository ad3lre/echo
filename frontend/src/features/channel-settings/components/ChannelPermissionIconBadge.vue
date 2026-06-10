<script setup lang="ts">
import type { ChannelPermissionKey } from '@shared/types';
import { channelPermissionIconUrl } from '@/features/channel-settings/domain/channelPermissionIcons';

defineProps<{
  permissionKey: ChannelPermissionKey;
}>();
</script>

<template>
  <span class="channel-perm-icon-badge" aria-hidden="true">
    <img
      :src="channelPermissionIconUrl(permissionKey)"
      alt=""
      class="channel-perm-icon-badge__img"
    />
  </span>
</template>

<style scoped lang="scss">
.channel-perm-icon-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--vue-auto-005);
  flex-shrink: 0;
}

.channel-perm-icon-badge__img {
  width: 16px;
  height: 16px;
  opacity: 0.82;
  filter: invert(1);
}
</style>
