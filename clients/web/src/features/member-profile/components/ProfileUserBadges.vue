<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed } from 'vue';
import {
  echoPublicBadgeLabel,
  echoPublicBadgeTitle,
  isEchoPublicBadgeId,
  type EchoPublicBadgeId,
} from '@shared/echoAccountBadges';
import { echoPlanBadgeUrl } from '@/assets/subscriptionTierIcons';

const props = defineProps<{
  /** Stable ids from API / workspace (e.g. `og`, `plus`, `black`). */
  badges: readonly string[];
  /** Visual size for icon row. */
  size?: 'sm' | 'md';
}>();

const sizeClass = computed(() =>
  props.size === 'md' ? 'profile-user-badges--md' : 'profile-user-badges--sm',
);

const normalized = computed((): EchoPublicBadgeId[] =>
  props.badges.filter((b): b is EchoPublicBadgeId => isEchoPublicBadgeId(b)),
);

function titleFor(id: EchoPublicBadgeId): string {
  return echoPublicBadgeTitle(id);
}

function labelFor(id: EchoPublicBadgeId): string {
  return echoPublicBadgeLabel(id);
}

function badgeIconUrl(id: EchoPublicBadgeId): string | null {
  if (id === 'plus' || id === 'black') return echoPlanBadgeUrl(id);
  if (id === 'bug_hunter' || id === 'developer') return null;
  return null;
}
</script>

<template>
  <ul
    class="profile-user-badges inline-flex list-none flex-wrap items-center gap-1.5 p-0 m-0"
    :class="sizeClass"
    :aria-label="echoT('b44.badges.profile')"
  >
    <li v-for="id in normalized" :key="id">
      <span
        class="profile-user-badges__pill"
        :class="`profile-user-badges__pill--${id}`"
        :title="titleFor(id)"
        role="img"
        :aria-label="titleFor(id)"
      >
        <span class="profile-user-badges__pill-glint" aria-hidden="true" />
        <span class="profile-user-badges__pill-rim" aria-hidden="true" />
        <img
          v-if="badgeIconUrl(id)"
          :src="badgeIconUrl(id)!"
          class="profile-user-badges__pill-icon"
          aria-hidden="true"
          alt=""
        />
        <span class="profile-user-badges__pill-inner" aria-hidden="true">{{
          labelFor(id)
        }}</span>
      </span>
    </li>
  </ul>
</template>

<style scoped src="./styles/ProfileUserBadges.scss"></style>

<!-- Light surfaces: flat badge, no rim/shadow stack -->
<style>
[data-theme='light'] .profile-user-badges__pill {
  box-shadow: none;
  transition: transform 0.18s ease;
}

[data-theme='light'] .profile-user-badges__pill:hover {
  box-shadow: none;
  transform: translateY(-1px) scale(1.03);
}

[data-theme='light'] .profile-user-badges__pill-glint,
[data-theme='light'] .profile-user-badges__pill-rim {
  opacity: 0;
}

[data-theme='light']
  .profile-user-badges__pill--plus
  .profile-user-badges__pill-inner {
  text-shadow: none;
  color: var(--echo-palette-eef2ff-3b57);
}

[data-theme='light']
  .profile-user-badges__pill--black
  .profile-user-badges__pill-inner {
  text-shadow: none;
  color: var(--echo-palette-fafafa-64f1);
}

[data-theme='light']
  .profile-user-badges__pill--og
  .profile-user-badges__pill-inner {
  text-shadow: none;
  color: var(--echo-palette-f0f7ff-9e4f);
}

[data-theme='light']
  .profile-user-badges__pill--bug_hunter
  .profile-user-badges__pill-inner {
  text-shadow: none;
  color: var(--echo-palette-f0fdf4-1167);
}

[data-theme='light']
  .profile-user-badges__pill--developer
  .profile-user-badges__pill-inner {
  text-shadow: none;
  color: var(--echo-palette-f0fdfa-d27e);
}
</style>
