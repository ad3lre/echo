<script setup lang="ts">
import { computed } from 'vue';
import {
  ECHO_OG_BADGE_MAX_SIGNUP_ORDINAL,
  isEchoPublicBadgeId,
  type EchoPublicBadgeId,
} from '@shared/echoAccountBadges';

const props = defineProps<{
  /** Stable ids from API / workspace (e.g. `og`). */
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
  if (id === 'og') {
    return `Original Echo member — among the first ${ECHO_OG_BADGE_MAX_SIGNUP_ORDINAL} accounts`;
  }
  return id;
}
</script>

<template>
  <ul
    class="profile-user-badges inline-flex list-none flex-wrap items-center gap-1.5 p-0 m-0"
    :class="sizeClass"
    aria-label="Profile badges"
  >
    <li v-for="id in normalized" :key="id">
      <span
        v-if="id === 'og'"
        class="profile-user-badges__og"
        :title="titleFor(id)"
        role="img"
        :aria-label="titleFor(id)"
      >
        <span class="profile-user-badges__og-glint" aria-hidden="true" />
        <span class="profile-user-badges__og-rim" aria-hidden="true" />
        <span class="profile-user-badges__og-inner" aria-hidden="true">OG</span>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.profile-user-badges--sm {
  gap: 0.3rem;
}
.profile-user-badges--md {
  gap: 0.4rem;
}

/* Echo blue (915b563a): cobalt rim → vivid core — same structure as friend heart. */
.profile-user-badges__og {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  border-radius: 999px;
  padding: 0.125rem 0.55rem 0.15rem;
  min-height: 1.28rem;
  min-width: 1.85rem;
  background: linear-gradient(
    145deg,
    #07142a 0%,
    #0b2d65 22%,
    #1556b2 44%,
    #2a8dff 56%,
    #1a63c9 74%,
    #0a2b61 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(226, 242, 255, 0.4),
    inset 0 -2px 4px rgba(0, 0, 0, 0.24),
    0 0 0 1px rgba(7, 25, 56, 0.75),
    0 2px 6px rgba(2, 9, 24, 0.38),
    0 0 14px rgba(50, 139, 255, 0.3);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.profile-user-badges__og:hover {
  transform: translateY(-1px) scale(1.03);
  box-shadow:
    inset 0 1px 0 rgba(236, 247, 255, 0.52),
    inset 0 -2px 4px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(7, 25, 56, 0.68),
    0 3px 10px rgba(0, 0, 0, 0.38),
    0 0 22px rgba(82, 165, 255, 0.46);
}

.profile-user-badges__og:active {
  transform: translateY(0) scale(0.99);
}

.profile-user-badges--md .profile-user-badges__og {
  min-height: 1.48rem;
  min-width: 2.05rem;
  padding: 0.15rem 0.62rem 0.17rem;
}

.profile-user-badges__og-glint {
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(237, 247, 255, 0.56) 0%,
    rgba(191, 226, 255, 0.18) 38%,
    rgba(255, 255, 255, 0) 58%
  );
  opacity: 0.85;
}

.profile-user-badges__og-rim {
  position: absolute;
  inset: 2px;
  border-radius: inherit;
  z-index: 0;
  pointer-events: none;
  box-shadow:
    inset 0 0 0 1px rgba(208, 232, 255, 0.2),
    inset 0 -1px 2px rgba(5, 18, 41, 0.42);
}

.profile-user-badges__og-inner {
  position: relative;
  z-index: 1;
  font-size: 0.625rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  line-height: 1;
  padding-left: 0.04em;
  color: #eef7ff;
  text-transform: uppercase;
  text-shadow:
    0 1px 0 rgba(2, 12, 33, 0.62),
    0 0 10px rgba(158, 214, 255, 0.4);
}

.profile-user-badges--md .profile-user-badges__og-inner {
  font-size: 0.6875rem;
  letter-spacing: 0.16em;
}

@media (prefers-reduced-motion: reduce) {
  .profile-user-badges__og {
    transition: none;
  }
  .profile-user-badges__og:hover {
    transform: none;
  }
}
</style>

<!-- Light surfaces: flat badge, no rim/shadow stack -->
<style>
[data-theme='light'] .profile-user-badges__og {
  box-shadow: none;
  transition: transform 0.18s ease;
}

[data-theme='light'] .profile-user-badges__og:hover {
  box-shadow: none;
  transform: translateY(-1px) scale(1.03);
}

[data-theme='light'] .profile-user-badges__og-glint,
[data-theme='light'] .profile-user-badges__og-rim {
  opacity: 0;
}

[data-theme='light'] .profile-user-badges__og-inner {
  text-shadow: none;
  color: #f0f7ff;
}
</style>
