<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** Number of wrong guesses so far (0–6); drives how much of the figure is drawn. */
  wrongCount: number;
  roundOver: boolean;
  roundResult: 'won' | 'lost' | null;
}>();

const BODY_PARTS = [
  'Head',
  'Body',
  'Left arm',
  'Right arm',
  'Left leg',
  'Right leg',
] as const;

const nextBodyPart = computed(() => BODY_PARTS[props.wrongCount] ?? null);
const drawnBodyParts = computed(() => BODY_PARTS.slice(0, props.wrongCount));
const lost = computed(() => props.roundOver && props.roundResult === 'lost');
</script>

<template>
  <div class="hm-scaffold">
    <svg
      class="hm-scaffold__svg"
      viewBox="0 0 200 240"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      :aria-label="`${wrongCount} wrong ${wrongCount === 1 ? 'guess' : 'guesses'}. ${drawnBodyParts.length ? 'Body parts drawn: ' + drawnBodyParts.join(', ') + '.' : 'No body parts drawn yet.'}`"
      :data-damage="wrongCount"
      :data-outcome="roundOver ? roundResult : null"
    >
      <defs>
        <linearGradient id="hm-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#05030e" />
          <stop offset="100%" stop-color="#0c0920" />
        </linearGradient>
        <linearGradient id="hm-wood-v" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#2e1a0c" />
          <stop offset="30%" stop-color="#5c3820" />
          <stop offset="70%" stop-color="#4a2d16" />
          <stop offset="100%" stop-color="#2a1608" />
        </linearGradient>
        <linearGradient id="hm-wood-h" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6b4224" />
          <stop offset="55%" stop-color="#4a2d16" />
          <stop offset="100%" stop-color="#281508" />
        </linearGradient>
        <linearGradient id="hm-floor-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2a1a0a" />
          <stop offset="100%" stop-color="#180e04" />
        </linearGradient>
        <linearGradient id="hm-rope-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#a08060" />
          <stop offset="100%" stop-color="#6b4e30" />
        </linearGradient>
        <radialGradient id="hm-ambient" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#e8d5a3" stop-opacity="0.08" />
          <stop offset="100%" stop-color="#e8d5a3" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="hm-ambient-warn" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#fb923c" stop-opacity="0.16" />
          <stop offset="100%" stop-color="#fb923c" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="hm-ambient-crit" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#ef4444" stop-opacity="0.22" />
          <stop offset="100%" stop-color="#ef4444" stop-opacity="0" />
        </radialGradient>
        <filter
          id="hm-glow-filter"
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- Sky -->
      <rect width="200" height="240" fill="url(#hm-sky)" />

      <!-- Stars -->
      <g fill="white">
        <circle cx="20" cy="16" r="0.9" opacity="0.55" />
        <circle cx="52" cy="10" r="0.6" opacity="0.45" />
        <circle cx="75" cy="26" r="1.1" opacity="0.6" />
        <circle cx="32" cy="44" r="0.5" opacity="0.4" />
        <circle cx="108" cy="13" r="0.7" opacity="0.5" />
        <circle cx="17" cy="62" r="0.6" opacity="0.35" />
        <circle cx="46" cy="52" r="0.5" opacity="0.4" />
        <circle cx="90" cy="7" r="0.9" opacity="0.55" />
        <circle cx="128" cy="20" r="0.6" opacity="0.45" />
        <circle cx="140" cy="48" r="0.5" opacity="0.35" />
        <circle cx="62" cy="35" r="0.4" opacity="0.3" />
      </g>

      <!-- Ambient figure glow (reactive to damage) -->
      <ellipse
        v-if="wrongCount > 0"
        cx="154"
        cy="130"
        rx="38"
        ry="55"
        :fill="
          wrongCount >= 5
            ? 'url(#hm-ambient-crit)'
            : wrongCount >= 3
              ? 'url(#hm-ambient-warn)'
              : 'url(#hm-ambient)'
        "
      />

      <!-- Floor platform -->
      <rect
        x="8"
        y="204"
        width="184"
        height="16"
        rx="4"
        fill="url(#hm-floor-grad)"
      />
      <line
        x1="8"
        y1="207"
        x2="192"
        y2="207"
        stroke="#6b4224"
        stroke-width="0.6"
        opacity="0.3"
      />
      <line
        x1="8"
        y1="212"
        x2="192"
        y2="212"
        stroke="#6b4224"
        stroke-width="0.6"
        opacity="0.2"
      />
      <!-- Platform edge highlight -->
      <line
        x1="8"
        y1="204.5"
        x2="192"
        y2="204.5"
        stroke="white"
        stroke-width="0.5"
        opacity="0.08"
      />
      <!-- Platform shadow -->
      <ellipse cx="100" cy="220" rx="90" ry="5" fill="black" opacity="0.5" />

      <!-- Gallows: vertical post -->
      <rect
        x="34"
        y="36"
        width="11"
        height="170"
        rx="3.5"
        fill="url(#hm-wood-v)"
      />
      <!-- Post highlight edge -->
      <line
        x1="35.5"
        y1="38"
        x2="35.5"
        y2="204"
        stroke="white"
        stroke-width="0.5"
        opacity="0.1"
      />
      <!-- Post grain -->
      <line
        x1="40"
        y1="38"
        x2="40"
        y2="204"
        stroke="#7c4a28"
        stroke-width="0.8"
        opacity="0.35"
      />

      <!-- Gallows: diagonal brace -->
      <path
        d="M45 82 L62 58"
        fill="none"
        stroke="#3d2010"
        stroke-width="10"
        stroke-linecap="round"
      />
      <path
        d="M45 82 L62 58"
        fill="none"
        stroke="#5c3820"
        stroke-width="7"
        stroke-linecap="round"
      />
      <path
        d="M45 82 L62 58"
        fill="none"
        stroke="#6b4224"
        stroke-width="4.5"
        stroke-linecap="round"
      />

      <!-- Gallows: horizontal beam -->
      <rect
        x="34"
        y="28"
        width="124"
        height="12"
        rx="3.5"
        fill="url(#hm-wood-h)"
      />
      <line
        x1="37"
        y1="29.5"
        x2="155"
        y2="29.5"
        stroke="white"
        stroke-width="0.5"
        opacity="0.1"
      />
      <line
        x1="37"
        y1="34"
        x2="155"
        y2="34"
        stroke="#7c4a28"
        stroke-width="0.8"
        opacity="0.35"
      />

      <!-- Gallows: vertical drop from beam -->
      <rect
        x="151"
        y="40"
        width="6"
        height="26"
        rx="2"
        fill="url(#hm-wood-v)"
        opacity="0.9"
      />

      <!-- Rope noose -->
      <path
        d="M154 66 Q153 71 154 76"
        fill="none"
        stroke="url(#hm-rope-grad)"
        stroke-width="3.2"
        stroke-linecap="round"
      />
      <!-- Rope knot detail -->
      <ellipse
        cx="154"
        cy="78"
        rx="4"
        ry="3"
        fill="none"
        stroke="#8b6840"
        stroke-width="1.5"
      />

      <!-- ── Figure parts ── -->
      <!-- Each part uses pathLength="1" so stroke-dashoffset: 1 = hidden, 0 = drawn -->

      <!-- 1. Head -->
      <g class="hm-part" :class="{ 'hm-part--active': wrongCount >= 1 }">
        <circle
          cx="154"
          cy="92"
          r="13"
          pathLength="1"
          fill="none"
          stroke-width="3"
        />
        <!-- Dot eyes (alive) -->
        <circle
          v-if="!lost"
          cx="150"
          cy="90"
          r="2"
          class="hm-face-dot"
          :class="{ 'hm-face-dot--show': wrongCount >= 1 }"
          fill="currentColor"
        />
        <circle
          v-if="!lost"
          cx="158"
          cy="90"
          r="2"
          class="hm-face-dot"
          :class="{ 'hm-face-dot--show': wrongCount >= 1 }"
          fill="currentColor"
        />
        <!-- X eyes (dead) -->
        <g
          v-if="lost && wrongCount >= 1"
          class="hm-face-dead"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <line x1="147" y1="87" x2="153" y2="93" />
          <line x1="153" y1="87" x2="147" y2="93" />
          <line x1="155" y1="87" x2="161" y2="93" />
          <line x1="161" y1="87" x2="155" y2="93" />
        </g>
        <!-- Mouth line (neutral/grim) -->
        <path
          v-if="wrongCount >= 1"
          :d="lost ? 'M150 96 Q154 94 158 96' : 'M150 96 Q154 98 158 96'"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          class="hm-face-dot"
          :class="{ 'hm-face-dot--show': wrongCount >= 1 }"
        />
      </g>

      <!-- 2. Body -->
      <g class="hm-part" :class="{ 'hm-part--active': wrongCount >= 2 }">
        <line
          x1="154"
          y1="105"
          x2="154"
          y2="150"
          pathLength="1"
          stroke-width="3.5"
          stroke-linecap="round"
        />
      </g>

      <!-- 3. Left arm -->
      <g class="hm-part" :class="{ 'hm-part--active': wrongCount >= 3 }">
        <path
          d="M154 117 Q140 126 130 138"
          pathLength="1"
          fill="none"
          stroke-width="3"
          stroke-linecap="round"
        />
      </g>

      <!-- 4. Right arm -->
      <g class="hm-part" :class="{ 'hm-part--active': wrongCount >= 4 }">
        <path
          d="M154 117 Q168 126 178 138"
          pathLength="1"
          fill="none"
          stroke-width="3"
          stroke-linecap="round"
        />
      </g>

      <!-- 5. Left leg -->
      <g class="hm-part" :class="{ 'hm-part--active': wrongCount >= 5 }">
        <path
          d="M154 150 Q145 165 137 180"
          pathLength="1"
          fill="none"
          stroke-width="3"
          stroke-linecap="round"
        />
      </g>

      <!-- 6. Right leg -->
      <g class="hm-part" :class="{ 'hm-part--active': wrongCount >= 6 }">
        <path
          d="M154 150 Q163 165 171 180"
          pathLength="1"
          fill="none"
          stroke-width="3"
          stroke-linecap="round"
        />
      </g>

      <!-- Foot shadow (once both legs exist) -->
      <ellipse
        v-if="wrongCount >= 5"
        cx="154"
        cy="186"
        rx="20"
        ry="3"
        fill="black"
        opacity="0.4"
      />
    </svg>

    <p class="hm-scaffold__caption">
      <template v-if="roundOver">
        Ended with <strong>{{ wrongCount }}</strong>
        {{ wrongCount === 1 ? 'miss' : 'misses' }}
      </template>
      <template v-else-if="wrongCount === 0">
        No misses yet — looking good
      </template>
      <template v-else>
        Next miss draws: <strong>{{ nextBodyPart }}</strong>
      </template>
    </p>
  </div>
</template>

<style scoped lang="scss">
.hm-scaffold {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border);
  border-radius: var(--hm-radius);
  padding: 0.75rem;
  /* subtle inner shadow for "stage" depth */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    inset 0 -1px 0 rgba(0, 0, 0, 0.4),
    0 4px 20px rgba(0, 0, 0, 0.4);
  flex-shrink: 0;
}

@media (min-width: 680px) {
  .hm-scaffold {
    width: 13.5rem;
  }
}

.hm-scaffold__svg {
  width: 100%;
  max-width: 12rem;
  height: auto;
  display: block;
}

/* Figure parts: inactive = ghost outline, active = drawn in */
.hm-part {
  stroke: rgba(255, 255, 255, 0.1);
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  fill: none;
  transition: stroke 0.5s ease;
}

.hm-part--active {
  stroke: var(--hm-figure);
  stroke-dashoffset: 0;
  animation: hm-draw-part 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

/* Progressive danger coloring on the SVG via data-damage attribute */
.hm-scaffold__svg[data-damage='3'] .hm-part--active {
  stroke: #f0c060;
}
.hm-scaffold__svg[data-damage='4'] .hm-part--active {
  stroke: #f97316;
}
.hm-scaffold__svg[data-damage='5'] .hm-part--active {
  stroke: #f87171;
}
.hm-scaffold__svg[data-damage='6'] .hm-part--active {
  stroke: #dc2626;
}

/* Dead outcome: entire figure turns red */
.hm-scaffold__svg[data-outcome='lost'] .hm-part--active {
  stroke: #ef4444;
}

/* Face details: fade in after head appears */
.hm-face-dot {
  opacity: 0;
  transition: opacity 0.3s ease 0.45s;
  color: var(--hm-figure);
}

.hm-face-dot--show {
  opacity: 0.85;
}

.hm-scaffold__svg[data-outcome='lost'] .hm-face-dot {
  color: #ef4444;
}

.hm-face-dead {
  stroke: #ef4444;
  opacity: 0;
  animation: hm-face-appear 0.3s ease 0.2s forwards;
}

.hm-scaffold__caption {
  font-size: 0.72rem;
  color: var(--hm-text-muted);
  text-align: center;
  line-height: 1.4;

  strong {
    color: var(--hm-text-soft);
    font-weight: 600;
  }
}

@keyframes hm-draw-part {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes hm-face-appear {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hm-part--active,
  .hm-face-dead {
    animation: none;
  }

  .hm-part {
    stroke-dasharray: none;
    stroke-dashoffset: 0;
  }
}
</style>
