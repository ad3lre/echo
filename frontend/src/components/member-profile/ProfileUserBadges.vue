<script setup lang="ts">
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
  if (id === 'bug_hunter') return null;
  return null;
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

<style scoped>
.profile-user-badges--sm {
  gap: 0.3rem;
}
.profile-user-badges--md {
  gap: 0.4rem;
}

/* Shared pill structure — matches friend heart / OG badges. */
.profile-user-badges__pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  border-radius: 999px;
  padding: 0.125rem 0.55rem 0.15rem;
  min-height: 1.28rem;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.profile-user-badges__pill:hover {
  transform: translateY(-1px) scale(1.03);
}

.profile-user-badges__pill:active {
  transform: translateY(0) scale(0.99);
}

.profile-user-badges--md .profile-user-badges__pill {
  min-height: 1.48rem;
  padding: 0.15rem 0.62rem 0.17rem;
}

.profile-user-badges__pill-icon {
  position: relative;
  z-index: 1;
  width: 0.72rem;
  height: 0.72rem;
  margin-right: 0.22rem;
  flex-shrink: 0;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3));
}

.profile-user-badges--md .profile-user-badges__pill-icon {
  width: 0.82rem;
  height: 0.82rem;
  margin-right: 0.25rem;
}

.profile-user-badges__pill-glint {
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  z-index: 0;
  pointer-events: none;
  opacity: 0.85;
}

.profile-user-badges__pill-rim {
  position: absolute;
  inset: 2px;
  border-radius: inherit;
  z-index: 0;
  pointer-events: none;
}

.profile-user-badges__pill-inner {
  position: relative;
  z-index: 1;
  font-size: 0.625rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1;
  white-space: nowrap;
}

.profile-user-badges--md .profile-user-badges__pill-inner {
  font-size: 0.6875rem;
  letter-spacing: 0.05em;
}

/* Echo+ — indigo/violet gem with subtle purple glow */
.profile-user-badges__pill--plus {
  background: linear-gradient(
    145deg,
    #1e1b4b 0%,
    #312e81 18%,
    #4f46e5 38%,
    #818cf8 50%,
    #a5b4fc 56%,
    #6366f1 68%,
    #3730a3 82%,
    #1e1b4b 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(224, 231, 255, 0.45),
    inset 0 -2px 4px rgba(0, 0, 0, 0.24),
    0 0 0 1px rgba(30, 27, 75, 0.75),
    0 2px 6px rgba(2, 6, 23, 0.38),
    0 0 10px rgba(99, 102, 241, 0.32),
    0 0 20px rgba(139, 92, 246, 0.15);
}

.profile-user-badges__pill--plus:hover {
  box-shadow:
    inset 0 1px 0 rgba(237, 242, 255, 0.55),
    inset 0 -2px 4px rgba(0, 0, 0, 0.18),
    0 0 0 1px rgba(30, 27, 75, 0.68),
    0 3px 10px rgba(0, 0, 0, 0.38),
    0 0 18px rgba(129, 140, 248, 0.45),
    0 0 30px rgba(139, 92, 246, 0.22);
}

.profile-user-badges__pill--plus .profile-user-badges__pill-glint {
  background: linear-gradient(
    175deg,
    rgba(237, 242, 255, 0.62) 0%,
    rgba(199, 210, 254, 0.24) 32%,
    rgba(167, 139, 250, 0.08) 52%,
    rgba(255, 255, 255, 0) 62%
  );
}

.profile-user-badges__pill--plus .profile-user-badges__pill-rim {
  box-shadow:
    inset 0 0 0 1px rgba(224, 231, 255, 0.24),
    inset 0 -1px 2px rgba(15, 10, 45, 0.42);
}

.profile-user-badges__pill--plus .profile-user-badges__pill-inner {
  color: #eef2ff;
  text-shadow:
    0 1px 0 rgba(15, 10, 45, 0.62),
    0 0 10px rgba(165, 180, 252, 0.4);
}

.profile-user-badges__pill--plus .profile-user-badges__pill-icon {
  filter: drop-shadow(0 0 3px rgba(165, 180, 252, 0.5))
    drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3));
}

/* Echo Black — obsidian with silver/platinum accents */
.profile-user-badges__pill--black {
  background: linear-gradient(
    145deg,
    #0a0a0b 0%,
    #18181b 20%,
    #27272a 36%,
    #52525b 48%,
    #a1a1aa 54%,
    #52525b 60%,
    #27272a 72%,
    #18181b 86%,
    #09090b 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.32),
    inset 0 -2px 4px rgba(0, 0, 0, 0.36),
    0 0 0 1px rgba(9, 9, 11, 0.9),
    0 0 0 2px rgba(161, 161, 170, 0.15),
    0 2px 6px rgba(0, 0, 0, 0.48),
    0 0 12px rgba(161, 161, 170, 0.1);
}

.profile-user-badges__pill--black:hover {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.42),
    inset 0 -2px 4px rgba(0, 0, 0, 0.28),
    0 0 0 1px rgba(9, 9, 11, 0.82),
    0 0 0 2px rgba(161, 161, 170, 0.22),
    0 3px 10px rgba(0, 0, 0, 0.48),
    0 0 18px rgba(212, 212, 216, 0.16);
}

.profile-user-badges__pill--black .profile-user-badges__pill-glint {
  background: linear-gradient(
    175deg,
    rgba(255, 255, 255, 0.42) 0%,
    rgba(228, 228, 231, 0.16) 30%,
    rgba(161, 161, 170, 0.06) 50%,
    rgba(255, 255, 255, 0) 62%
  );
}

.profile-user-badges__pill--black .profile-user-badges__pill-rim {
  box-shadow:
    inset 0 0 0 1px rgba(228, 228, 231, 0.2),
    inset 0 -1px 2px rgba(0, 0, 0, 0.52);
}

.profile-user-badges__pill--black .profile-user-badges__pill-inner {
  color: #fafafa;
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.76),
    0 0 8px rgba(228, 228, 231, 0.2);
  letter-spacing: 0.06em;
}

.profile-user-badges__pill--black .profile-user-badges__pill-icon {
  filter: drop-shadow(0 0 2px rgba(228, 228, 231, 0.35))
    drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5));
}

/* Echo blue (915b563a): cobalt rim → vivid core — same structure as friend heart. */
.profile-user-badges__pill--og {
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
}

.profile-user-badges__pill--og:hover {
  box-shadow:
    inset 0 1px 0 rgba(236, 247, 255, 0.52),
    inset 0 -2px 4px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(7, 25, 56, 0.68),
    0 3px 10px rgba(0, 0, 0, 0.38),
    0 0 22px rgba(82, 165, 255, 0.46);
}

.profile-user-badges--md .profile-user-badges__pill--og {
  min-width: 2.05rem;
}

.profile-user-badges__pill--og .profile-user-badges__pill-glint {
  background: linear-gradient(
    180deg,
    rgba(237, 247, 255, 0.56) 0%,
    rgba(191, 226, 255, 0.18) 38%,
    rgba(255, 255, 255, 0) 58%
  );
}

.profile-user-badges__pill--og .profile-user-badges__pill-rim {
  box-shadow:
    inset 0 0 0 1px rgba(208, 232, 255, 0.2),
    inset 0 -1px 2px rgba(5, 18, 41, 0.42);
}

.profile-user-badges__pill--og .profile-user-badges__pill-inner {
  padding-left: 0.04em;
  letter-spacing: 0.14em;
  color: #eef7ff;
  text-transform: uppercase;
  text-shadow:
    0 1px 0 rgba(2, 12, 33, 0.62),
    0 0 10px rgba(158, 214, 255, 0.4);
}

.profile-user-badges--md
  .profile-user-badges__pill--og
  .profile-user-badges__pill-inner {
  letter-spacing: 0.16em;
}

/* Bug Hunter — emerald green with a warm amber accent */
.profile-user-badges__pill--bug_hunter {
  background: linear-gradient(
    145deg,
    #052e16 0%,
    #14532d 20%,
    #16a34a 42%,
    #4ade80 54%,
    #22c55e 64%,
    #15803d 78%,
    #052e16 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(187, 247, 208, 0.42),
    inset 0 -2px 4px rgba(0, 0, 0, 0.24),
    0 0 0 1px rgba(5, 46, 22, 0.75),
    0 2px 6px rgba(2, 18, 8, 0.38),
    0 0 12px rgba(34, 197, 94, 0.3);
}

.profile-user-badges__pill--bug_hunter:hover {
  box-shadow:
    inset 0 1px 0 rgba(220, 252, 231, 0.52),
    inset 0 -2px 4px rgba(0, 0, 0, 0.18),
    0 0 0 1px rgba(5, 46, 22, 0.68),
    0 3px 10px rgba(0, 0, 0, 0.38),
    0 0 18px rgba(74, 222, 128, 0.45),
    0 0 30px rgba(34, 197, 94, 0.2);
}

.profile-user-badges__pill--bug_hunter .profile-user-badges__pill-glint {
  background: linear-gradient(
    175deg,
    rgba(220, 252, 231, 0.56) 0%,
    rgba(134, 239, 172, 0.2) 32%,
    rgba(74, 222, 128, 0.08) 52%,
    rgba(255, 255, 255, 0) 62%
  );
}

.profile-user-badges__pill--bug_hunter .profile-user-badges__pill-rim {
  box-shadow:
    inset 0 0 0 1px rgba(187, 247, 208, 0.22),
    inset 0 -1px 2px rgba(5, 30, 14, 0.42);
}

.profile-user-badges__pill--bug_hunter .profile-user-badges__pill-inner {
  color: #f0fdf4;
  text-shadow:
    0 1px 0 rgba(5, 30, 14, 0.62),
    0 0 10px rgba(134, 239, 172, 0.4);
}

@media (prefers-reduced-motion: reduce) {
  .profile-user-badges__pill {
    transition: none;
  }
  .profile-user-badges__pill:hover {
    transform: none;
  }
}
</style>

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
  color: #eef2ff;
}

[data-theme='light']
  .profile-user-badges__pill--black
  .profile-user-badges__pill-inner {
  text-shadow: none;
  color: #fafafa;
}

[data-theme='light']
  .profile-user-badges__pill--og
  .profile-user-badges__pill-inner {
  text-shadow: none;
  color: #f0f7ff;
}

[data-theme='light']
  .profile-user-badges__pill--bug_hunter
  .profile-user-badges__pill-inner {
  text-shadow: none;
  color: #f0fdf4;
}
</style>
