<script setup lang="ts">
import { echoT } from '@/i18n';
import { iconsCritical as icons } from '@/assets/iconsCritical';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import type { DmIncomingRailAvatar } from '@/features/layout/composables/dm/useAppLayoutDmRailUnread';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';

const props = defineProps<{
  avatars: DmIncomingRailAvatar[];
  overflowCount: number;
  /** Inline next to the DM icon on the top horizontal action rail. */
  layout?: 'vertical' | 'horizontal';
}>();

const emit = defineEmits<{
  'select-incoming-dm': [userId: string];
  'select-incoming-group-dm': [channelId: string];
  'open-dm-inbox-overflow': [];
}>();

function formatUnread(n: number): string {
  if (n <= 0) return '';
  if (n > 99) return '99+';
  return String(n);
}

function onAvatarClick(a: DmIncomingRailAvatar) {
  if (a.kind === 'group') {
    emit('select-incoming-group-dm', a.channelId);
    return;
  }
  emit('select-incoming-dm', a.userId);
}

function avatarKey(a: DmIncomingRailAvatar): string {
  return a.kind === 'user' ? a.userId : a.channelId;
}

function titleFor(a: DmIncomingRailAvatar): string {
  const n = a.unreadCount;
  const suffix = a.inCall
    ? ` (${echoT('layout.rail.inCall')})`
    : n > 0
      ? ` (${echoT('layout.rail.unreadCount', { count: n })})`
      : '';
  if (a.kind === 'group') {
    return echoT('layout.rail.openGroupMessage', { name: a.name, suffix });
  }
  return echoT('layout.rail.openDirectMessageFrom', {
    name: a.name,
    suffix,
  });
}
</script>

<template>
  <div
    class="dm-incoming-rail flex w-full items-center"
    :class="
      props.layout === 'horizontal'
        ? 'mt-0 max-w-[min(42vw,18rem)] flex-row gap-2 overflow-x-auto overflow-y-hidden'
        : 'mt-1.5 flex-col gap-2'
    "
    :aria-label="echoT('layout.rail.unreadDirectMessages')"
  >
    <div
      v-for="a in avatars"
      :key="avatarKey(a)"
      class="dm-incoming-rail__slot mb-0 flex justify-center overflow-visible"
      :class="props.layout === 'horizontal' ? 'w-auto shrink-0' : 'w-full'"
    >
      <button
        type="button"
        class="dm-incoming-rail__item relative flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-full transition-all"
        :title="titleFor(a)"
        @click="onAvatarClick(a)"
      >
        <span
          class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden rounded-full"
          aria-hidden="true"
        >
          <PausedGifAvatar
            v-if="a.pfp?.trim()"
            :src="safeImageUrl(a.pfp)"
            :alt="a.name"
            img-class="h-full w-full rounded-full object-cover"
          />
          <span v-else class="dm-incoming-rail__initials">
            {{ a.name.charAt(0).toUpperCase() }}
          </span>
        </span>
        <span
          v-if="a.inCall"
          class="dm-avatar-call pointer-events-none absolute -right-0.5 -top-0.5 inline-flex min-h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-[var(--bg)] px-1"
          aria-hidden="true"
        >
          <img :src="icons.phoneCall" alt="" class="h-2.5 w-2.5 opacity-95" />
        </span>
        <span
          v-else-if="a.unreadCount > 0"
          class="dm-avatar-unread pointer-events-none absolute -right-0.5 -top-0.5 inline-flex min-h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-[var(--bg)] bg-[#f23f42] px-1 text-[9px] font-bold leading-none text-white"
          aria-hidden="true"
        >
          {{ formatUnread(a.unreadCount) }}
        </span>
      </button>
    </div>
    <div
      v-if="overflowCount > 0"
      class="dm-incoming-rail__slot mb-0 flex justify-center"
      :class="props.layout === 'horizontal' ? 'w-auto shrink-0' : 'w-full'"
    >
      <button
        type="button"
        class="dm-incoming-rail__item dm-incoming-rail__item--more flex h-10 w-10 items-center justify-center rounded-full transition-all"
        :title="echoT('layout.rail.moreUnreadDms', { count: overflowCount })"
        @click="emit('open-dm-inbox-overflow')"
      >
        <span class="more-servers-count">+{{ overflowCount }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/DmIncomingRailCluster.scss"></style>
