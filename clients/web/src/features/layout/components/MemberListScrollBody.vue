<script setup lang="ts">
import { computed, ref } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import StatusIndicator from '@/components/StatusIndicator.vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import ServerOwnerCrownIcon from '@/features/layout/ServerOwnerCrownIcon.vue';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import type { MemberRole } from '@/features/member-profile/memberProfiles';
import { memberRoleIconImgSrc } from '@/features/member-profile/memberRoleIconDisplay';
import {
  MEMBER_LIST_VIRTUALIZE_THRESHOLD,
  estimateMemberListVirtualRowSize,
  flattenMemberListVirtualRows,
  type MemberListSection,
  type MemberListUser,
  type MemberListVirtualHeader,
  type MemberListVirtualMember,
} from '@/features/layout/domain/memberListVirtualRows';

const props = defineProps<{
  sections: MemberListSection[];
  serverOwnerId?: string | null;
  presenceForUser: (user: MemberListUser) => {
    sortOrder: number;
    indicatorStatus?: string;
    indicatorMobileSurface?: boolean;
    indicatorDiscordOnline?: boolean;
    isOffline?: boolean;
    discordOnline?: boolean;
  };
  isUserCommunicationTimedOut: (userId: string) => boolean;
  subtitleTextWithTimeout: (user: MemberListUser) => string;
}>();

const emit = defineEmits<{
  openProfile: [userId: string, event: MouseEvent];
  memberContextMenu: [user: MemberListUser, event: MouseEvent];
}>();

const scrollParentRef = ref<HTMLElement | null>(null);

const virtualRows = computed(() =>
  flattenMemberListVirtualRows(props.sections),
);

const useVirtual = computed(
  () => virtualRows.value.length >= MEMBER_LIST_VIRTUALIZE_THRESHOLD,
);

const virtualizer = useVirtualizer(
  computed(() => ({
    count: useVirtual.value ? virtualRows.value.length : 0,
    getScrollElement: () => scrollParentRef.value,
    estimateSize: (index: number) => {
      const row = virtualRows.value[index];
      return row ? estimateMemberListVirtualRowSize(row) : 48;
    },
    overscan: 10,
    getItemKey: (index: number) => virtualRows.value[index]?.key ?? index,
  })) as Parameters<typeof useVirtualizer>[0],
);

const totalSize = computed(() =>
  useVirtual.value ? virtualizer.value.getTotalSize() : 0,
);
const virtualItems = computed(() =>
  useVirtual.value ? virtualizer.value.getVirtualItems() : [],
);

function sectionRoleIconSrc(role: MemberRole): string {
  return memberRoleIconImgSrc({
    iconUrl: role.iconUrl,
    iconEmojiId: role.iconEmojiId,
  });
}

function headerAt(index: number): MemberListVirtualHeader | null {
  const row = virtualRows.value[index];
  return row?.type === 'header' ? row : null;
}

function memberAt(index: number): MemberListVirtualMember | null {
  const row = virtualRows.value[index];
  return row?.type === 'member' ? row : null;
}
</script>

<template>
  <div
    ref="scrollParentRef"
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-4 pt-14 custom-scrollbar"
    v-scrollbar-on-scroll
  >
    <div
      v-if="useVirtual"
      class="relative w-full"
      :style="{ height: `${totalSize}px` }"
    >
      <div
        v-for="vItem in virtualItems"
        :key="String(vItem.key)"
        class="absolute left-0 top-0 w-full"
        :style="{
          height: `${vItem.size}px`,
          transform: `translateY(${vItem.start}px)`,
        }"
      >
        <div
          v-if="headerAt(vItem.index)"
          class="flex items-center gap-2 pt-1 pb-1 text-xs font-semibold uppercase tracking-wider"
          :style="{ color: headerAt(vItem.index)!.role.color }"
        >
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :style="{
              backgroundColor: headerAt(vItem.index)!.role.color,
            }"
            :title="`${headerAt(vItem.index)!.role.name} role color`"
            aria-hidden="true"
          />
          <PausedGifAvatar
            v-if="sectionRoleIconSrc(headerAt(vItem.index)!.role)"
            :src="sectionRoleIconSrc(headerAt(vItem.index)!.role)"
            alt=""
            :session-key="`ml-hdr-${headerAt(vItem.index)!.role.id}`"
            wrapper-class="relative h-3.5 w-3.5 shrink-0 overflow-hidden"
            img-class="h-3.5 w-3.5 shrink-0 rounded object-cover ring-1 ring-white/10"
          />
          {{ headerAt(vItem.index)!.role.name }} —
          {{ headerAt(vItem.index)!.memberCount }}
        </div>
        <div
          v-else-if="memberAt(vItem.index)"
          :data-member-id="memberAt(vItem.index)!.user.id"
          class="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-glass-tint"
          @click="emit('openProfile', memberAt(vItem.index)!.user.id, $event)"
          @contextmenu="
            emit('memberContextMenu', memberAt(vItem.index)!.user, $event)
          "
        >
          <div class="avatar-wrap relative h-8 w-8 shrink-0">
            <div
              class="member-pfp-clip h-full w-full overflow-hidden rounded-full"
            >
              <PausedGifAvatar
                :src="safeImageUrl(memberAt(vItem.index)!.user.pfp)"
                :alt="memberAt(vItem.index)!.user.name"
                :session-key="memberAt(vItem.index)!.user.id"
                img-class="member-pfp block rounded-full object-cover"
              />
            </div>
            <StatusIndicator
              v-if="
                presenceForUser(memberAt(vItem.index)!.user).indicatorStatus ||
                presenceForUser(memberAt(vItem.index)!.user)
                  .indicatorDiscordOnline
              "
              :status="
                presenceForUser(memberAt(vItem.index)!.user).indicatorStatus
              "
              :mobile-surface="
                presenceForUser(memberAt(vItem.index)!.user)
                  .indicatorMobileSurface
              "
              :discord-online="
                presenceForUser(memberAt(vItem.index)!.user)
                  .indicatorDiscordOnline
              "
              size="sm"
            />
          </div>
          <div class="min-w-0 flex-1 truncate">
            <div class="flex min-w-0 items-center gap-2">
              <div
                class="flex min-w-0 flex-1 items-center gap-1 truncate font-semibold"
                :class="[
                  presenceForUser(memberAt(vItem.index)!.user).isOffline
                    ? 'text-muted'
                    : '',
                  presenceForUser(memberAt(vItem.index)!.user).discordOnline
                    ? 'discord-active-user'
                    : '',
                ]"
                :style="
                  presenceForUser(memberAt(vItem.index)!.user).isOffline
                    ? {}
                    : { color: memberAt(vItem.index)!.role.color }
                "
              >
                <span class="truncate">{{
                  memberAt(vItem.index)!.user.name
                }}</span>
                <ServerOwnerCrownIcon
                  v-if="
                    serverOwnerId &&
                    memberAt(vItem.index)!.user.id === serverOwnerId.trim()
                  "
                />
              </div>
              <span
                v-if="
                  isUserCommunicationTimedOut(memberAt(vItem.index)!.user.id)
                "
                class="inline-flex shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-400/20"
                title="Communication timeout"
                aria-label="Communication timeout"
              >
                Timed out
              </span>
            </div>
            <div class="truncate text-xs text-muted">
              {{ subtitleTextWithTimeout(memberAt(vItem.index)!.user) }}
            </div>
          </div>
        </div>
      </div>
    </div>
    <template v-else>
      <div v-for="section in sections" :key="section.role.id" class="mb-4">
        <div
          class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          :style="{ color: section.role.color }"
        >
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :style="{ backgroundColor: section.role.color }"
            :title="`${section.role.name} role color`"
            aria-hidden="true"
          />
          <PausedGifAvatar
            v-if="sectionRoleIconSrc(section.role)"
            :src="sectionRoleIconSrc(section.role)"
            alt=""
            :session-key="`ml-hdr-${section.role.id}`"
            wrapper-class="relative h-3.5 w-3.5 shrink-0 overflow-hidden"
            img-class="h-3.5 w-3.5 shrink-0 rounded object-cover ring-1 ring-white/10"
          />
          {{ section.role.name }} — {{ section.members.length }}
        </div>
        <div class="flex flex-col gap-1">
          <div
            v-for="user in section.members"
            :key="user.id"
            :data-member-id="user.id"
            class="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-glass-tint"
            @click="emit('openProfile', user.id, $event)"
            @contextmenu="emit('memberContextMenu', user, $event)"
          >
            <div class="avatar-wrap relative h-8 w-8 shrink-0">
              <div
                class="member-pfp-clip h-full w-full overflow-hidden rounded-full"
              >
                <PausedGifAvatar
                  :src="safeImageUrl(user.pfp)"
                  :alt="user.name"
                  :session-key="user.id"
                  img-class="member-pfp block rounded-full object-cover"
                />
              </div>
              <StatusIndicator
                v-if="
                  presenceForUser(user).indicatorStatus ||
                  presenceForUser(user).indicatorDiscordOnline
                "
                :status="presenceForUser(user).indicatorStatus"
                :mobile-surface="presenceForUser(user).indicatorMobileSurface"
                :discord-online="presenceForUser(user).indicatorDiscordOnline"
                size="sm"
              />
            </div>
            <div class="min-w-0 flex-1 truncate">
              <div class="flex min-w-0 items-center gap-2">
                <div
                  class="flex min-w-0 flex-1 items-center gap-1 truncate font-semibold"
                  :class="[
                    presenceForUser(user).isOffline ? 'text-muted' : '',
                    presenceForUser(user).discordOnline
                      ? 'discord-active-user'
                      : '',
                  ]"
                  :style="
                    presenceForUser(user).isOffline
                      ? {}
                      : { color: section.role.color }
                  "
                >
                  <span class="truncate">{{ user.name }}</span>
                  <ServerOwnerCrownIcon
                    v-if="serverOwnerId && user.id === serverOwnerId.trim()"
                  />
                </div>
                <span
                  v-if="isUserCommunicationTimedOut(user.id)"
                  class="inline-flex shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-400/20"
                  title="Communication timeout"
                  aria-label="Communication timeout"
                >
                  Timed out
                </span>
              </div>
              <div class="truncate text-xs text-muted">
                {{ subtitleTextWithTimeout(user) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
