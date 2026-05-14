<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { iconEcho } from '@/assets/branding';

const props = defineProps<{
  authenticated: boolean;
  /** Top horizontal action strip — compact logo strip without tall fluid chrome. */
  compactTopBar?: boolean;
}>();

const emit = defineEmits<{
  'open-settings': [];
}>();

let echoAnimationFrame: number | null = null;
let echoPointerFrame: number | null = null;
let echoTrackingTarget: HTMLElement | null = null;
let echoPointerTarget: HTMLElement | null = null;
let pendingPointerClientX = 0;
let pendingPointerClientY = 0;
let pointerRectCache: DOMRect | null = null;

const echoMotion = {
  currentCursorX: 24,
  currentCursorY: 16,
  currentShiftX: 0,
  currentShiftY: 0,
  currentLogoShiftX: 0,
  currentLogoShiftY: 0,
  currentLogoShadowX: 0,
  currentLogoShadowY: 0,
  currentHighlightOpacity: 0.54,
  currentLogoSheenOpacity: 0.54,
  currentPressDepth: 0,
  targetCursorX: 24,
  targetCursorY: 16,
  targetShiftX: 0,
  targetShiftY: 0,
  targetLogoShiftX: 0,
  targetLogoShiftY: 0,
  targetLogoShadowX: 0,
  targetLogoShadowY: 0,
  targetHighlightOpacity: 0.54,
  targetLogoSheenOpacity: 0.54,
  targetPressDepth: 0,
};

function updateEchoStyles(target: HTMLElement) {
  target.style.setProperty(
    '--echo-cursor-x',
    `${echoMotion.currentCursorX.toFixed(2)}%`,
  );
  target.style.setProperty(
    '--echo-cursor-y',
    `${echoMotion.currentCursorY.toFixed(2)}%`,
  );
  target.style.setProperty(
    '--echo-shift-x',
    `${echoMotion.currentShiftX.toFixed(2)}px`,
  );
  target.style.setProperty(
    '--echo-shift-y',
    `${echoMotion.currentShiftY.toFixed(2)}px`,
  );
  target.style.setProperty(
    '--echo-logo-shift-x',
    `${echoMotion.currentLogoShiftX.toFixed(2)}px`,
  );
  target.style.setProperty(
    '--echo-logo-shift-y',
    `${echoMotion.currentLogoShiftY.toFixed(2)}px`,
  );
  target.style.setProperty(
    '--echo-logo-shadow-x',
    `${echoMotion.currentLogoShadowX.toFixed(2)}px`,
  );
  target.style.setProperty(
    '--echo-logo-shadow-y',
    `${echoMotion.currentLogoShadowY.toFixed(2)}px`,
  );
  target.style.setProperty(
    '--echo-highlight-opacity',
    `${echoMotion.currentHighlightOpacity.toFixed(3)}`,
  );
  target.style.setProperty(
    '--echo-logo-sheen-opacity',
    `${echoMotion.currentLogoSheenOpacity.toFixed(3)}`,
  );
  target.style.setProperty(
    '--echo-press-depth',
    `${echoMotion.currentPressDepth.toFixed(3)}`,
  );
  target.style.setProperty(
    '--echo-logo-press-scale',
    `${(1 - echoMotion.currentPressDepth * 0.038).toFixed(4)}`,
  );
  target.style.setProperty(
    '--echo-logo-inner-scale',
    `${(1 - echoMotion.currentPressDepth * 0.018).toFixed(4)}`,
  );
  target.style.setProperty(
    '--echo-logo-press-shadow',
    `${(echoMotion.currentPressDepth * 4.5).toFixed(2)}px`,
  );
  target.style.setProperty(
    '--echo-logo-press-sheen-shift',
    `${(echoMotion.currentPressDepth * 2.5).toFixed(2)}px`,
  );
}

function animateEchoTracking() {
  if (!echoTrackingTarget) {
    echoAnimationFrame = null;
    return;
  }

  const ease = 0.12;
  const keys: Array<[keyof typeof echoMotion, keyof typeof echoMotion]> = [
    ['currentCursorX', 'targetCursorX'],
    ['currentCursorY', 'targetCursorY'],
    ['currentShiftX', 'targetShiftX'],
    ['currentShiftY', 'targetShiftY'],
    ['currentLogoShiftX', 'targetLogoShiftX'],
    ['currentLogoShiftY', 'targetLogoShiftY'],
    ['currentLogoShadowX', 'targetLogoShadowX'],
    ['currentLogoShadowY', 'targetLogoShadowY'],
    ['currentHighlightOpacity', 'targetHighlightOpacity'],
    ['currentLogoSheenOpacity', 'targetLogoSheenOpacity'],
    ['currentPressDepth', 'targetPressDepth'],
  ];

  let stillMoving = false;

  for (const [currentKey, targetKey] of keys) {
    const current = echoMotion[currentKey] as number;
    const target = echoMotion[targetKey] as number;
    const next = current + (target - current) * ease;
    echoMotion[currentKey] = next as never;

    if (Math.abs(target - next) > 0.01) {
      stillMoving = true;
    }
  }

  updateEchoStyles(echoTrackingTarget);

  if (stillMoving) {
    echoAnimationFrame = window.requestAnimationFrame(animateEchoTracking);
  } else {
    updateEchoStyles(echoTrackingTarget);
    echoAnimationFrame = null;
  }
}

function ensureEchoAnimation(target: HTMLElement) {
  echoTrackingTarget = target;
  if (echoAnimationFrame === null) {
    echoAnimationFrame = window.requestAnimationFrame(animateEchoTracking);
  }
}

function processEchoPointerFrame() {
  echoPointerFrame = null;
  const target = echoPointerTarget;
  if (!target) return;
  const rect = pointerRectCache ?? target.getBoundingClientRect();
  pointerRectCache = rect;
  if (rect.width <= 0 || rect.height <= 0) return;
  const x = (pendingPointerClientX - rect.left) / rect.width;
  const y = (pendingPointerClientY - rect.top) / rect.height;
  const clampedX = Math.min(Math.max(x, 0), 1);
  const clampedY = Math.min(Math.max(y, 0), 1);
  const shiftX = (clampedX - 0.32) * 10;
  const shiftY = (clampedY - 0.22) * 8;
  const logoShiftX = (clampedX - 0.32) * 2.8;
  const logoShiftY = (clampedY - 0.22) * 2.2;
  const shadowShiftX = (clampedX - 0.32) * 5;
  const shadowShiftY = (clampedY - 0.22) * 4;

  echoMotion.targetCursorX = clampedX * 100;
  echoMotion.targetCursorY = clampedY * 100;
  echoMotion.targetShiftX = shiftX;
  echoMotion.targetShiftY = shiftY;
  echoMotion.targetLogoShiftX = logoShiftX;
  echoMotion.targetLogoShiftY = logoShiftY;
  echoMotion.targetLogoShadowX = shadowShiftX;
  echoMotion.targetLogoShadowY = shadowShiftY;
  echoMotion.targetHighlightOpacity = 0.66;
  echoMotion.targetLogoSheenOpacity = 0.82;
  ensureEchoAnimation(target);
}

function handleEchoFluidMove(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;
  echoPointerTarget = target;
  pendingPointerClientX = event.clientX;
  pendingPointerClientY = event.clientY;
  if (!pointerRectCache) pointerRectCache = target.getBoundingClientRect();
  if (echoPointerFrame === null) {
    echoPointerFrame = window.requestAnimationFrame(processEchoPointerFrame);
  }
}

function resetEchoFluidTracking(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;
  pointerRectCache = null;
  echoPointerTarget = target;
  if (echoPointerFrame !== null) {
    window.cancelAnimationFrame(echoPointerFrame);
    echoPointerFrame = null;
  }

  echoMotion.targetCursorX = 24;
  echoMotion.targetCursorY = 16;
  echoMotion.targetShiftX = 0;
  echoMotion.targetShiftY = 0;
  echoMotion.targetLogoShiftX = 0;
  echoMotion.targetLogoShiftY = 0;
  echoMotion.targetLogoShadowX = 0;
  echoMotion.targetLogoShadowY = 0;
  echoMotion.targetHighlightOpacity = 0.54;
  echoMotion.targetLogoSheenOpacity = 0.54;
  echoMotion.targetPressDepth = 0;
  ensureEchoAnimation(target);
}

function onEchoRailCornerMouseMove(event: MouseEvent) {
  handleEchoFluidMove(event);
}

function onEchoRailCornerMouseLeave(event: MouseEvent) {
  resetEchoFluidTracking(event);
}

function handleEchoLogoPress(event: PointerEvent) {
  if (!props.authenticated) return;
  const corner =
    event.currentTarget instanceof HTMLElement
      ? (event.currentTarget.closest('.echo-corner') as HTMLElement | null)
      : null;

  if (!corner) return;

  echoMotion.targetPressDepth = 1;
  ensureEchoAnimation(corner);
}

function handleEchoLogoRelease(event: PointerEvent) {
  if (!props.authenticated) return;
  const corner =
    event.currentTarget instanceof HTMLElement
      ? (event.currentTarget.closest('.echo-corner') as HTMLElement | null)
      : null;

  if (!corner) return;

  echoMotion.targetPressDepth = 0;
  ensureEchoAnimation(corner);
}

function onEchoLogoClick() {
  if (!props.authenticated) return;
  emit('open-settings');
}

onBeforeUnmount(() => {
  if (echoAnimationFrame !== null) {
    window.cancelAnimationFrame(echoAnimationFrame);
  }
  if (echoPointerFrame !== null) {
    window.cancelAnimationFrame(echoPointerFrame);
  }
  pointerRectCache = null;
  echoPointerTarget = null;
});
</script>

<template>
  <div
    class="echo-corner isolate shrink-0"
    :class="
      props.compactTopBar
        ? 'echo-corner--compact-top flex h-full min-w-[4rem] flex-col items-center justify-center overflow-hidden border-r-0 px-3 py-2'
        : 'echo-corner--fluid flex w-full flex-col items-center overflow-hidden pb-4 pt-4'
    "
    @mousemove="onEchoRailCornerMouseMove"
    @mouseleave="onEchoRailCornerMouseLeave"
  >
    <svg
      class="echo-corner__defs"
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
    >
      <defs>
        <radialGradient id="echo-fluid-sheen" cx="34%" cy="28%" r="70%">
          <stop offset="0%" stop-color="#D4F5FF" stop-opacity="0.82" />
          <stop offset="35%" stop-color="#7ED4FF" stop-opacity="0.42" />
          <stop offset="100%" stop-color="#7ED4FF" stop-opacity="0" />
        </radialGradient>
        <linearGradient
          id="echo-fluid-blue"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stop-color="#8AE1FF" stop-opacity="0.82" />
          <stop offset="42%" stop-color="#2D77FF" stop-opacity="0.72" />
          <stop offset="100%" stop-color="#4126C8" stop-opacity="0.18" />
        </linearGradient>
        <linearGradient
          id="echo-fluid-violet"
          x1="25%"
          y1="5%"
          x2="78%"
          y2="100%"
        >
          <stop offset="0%" stop-color="#7D8BFF" stop-opacity="0.22" />
          <stop offset="55%" stop-color="#4A3BFF" stop-opacity="0.44" />
          <stop offset="100%" stop-color="#1B1238" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
    <div class="echo-corner__fluid pointer-events-none" aria-hidden="true">
      <div class="echo-corner__base"></div>
      <div class="echo-corner__ambient"></div>
      <div class="echo-corner__highlight"></div>
      <svg
        class="echo-corner__liquid"
        viewBox="0 0 320 220"
        preserveAspectRatio="xMinYMin slice"
        aria-hidden="true"
      >
        <g>
          <path
            d="M-32 70C6 8 92-10 172 6c54 10 110 40 124 89 11 39-10 81-48 102-36 21-82 22-122 14C76 201 30 183 4 149-20 118-24 84-32 70Z"
            fill="url(#echo-fluid-blue)"
            opacity="0.9"
          />
          <path
            d="M14 82C44 38 108 20 170 32c50 10 96 34 112 69 12 28-1 58-30 77-32 21-76 28-118 22-39-6-77-23-102-52-20-22-27-52-12-74Z"
            fill="url(#echo-fluid-violet)"
            opacity="0.64"
          />
          <ellipse
            cx="108"
            cy="48"
            rx="92"
            ry="46"
            fill="url(#echo-fluid-sheen)"
            opacity="0.86"
          />
          <path
            d="M-8 142c18-28 54-44 88-40 28 2 56 15 70 38 14 24 8 58-16 80-21 18-50 28-80 24-27-4-55-19-66-44-11-20-10-42 4-58Z"
            fill="#091020"
            opacity="0.22"
          />
        </g>
      </svg>
      <div class="echo-corner__particles"></div>
      <div class="echo-corner__shadow"></div>
    </div>
    <!-- Echo Logo (signed-in: opens user settings) -->
    <div
      class="echo-logo-wrapper relative z-[1] flex items-center justify-center"
      :class="[
        props.compactTopBar
          ? 'echo-logo-wrapper--compact-top h-10 w-10'
          : 'h-12 w-12',
        props.authenticated ? 'cursor-pointer' : 'cursor-default',
      ]"
      :role="props.authenticated ? 'button' : undefined"
      :tabindex="props.authenticated ? 0 : undefined"
      :title="props.authenticated ? 'Settings' : 'Sign in to open settings'"
      :aria-label="props.authenticated ? 'Open settings' : 'Echo'"
      @keydown.enter.prevent="onEchoLogoClick"
      @keydown.space.prevent="onEchoLogoClick"
      @pointerdown="handleEchoLogoPress"
      @pointerup="handleEchoLogoRelease"
      @pointerleave="handleEchoLogoRelease"
      @pointercancel="handleEchoLogoRelease"
      @click="onEchoLogoClick"
    >
      <img
        :src="iconEcho"
        alt="Echo Logo"
        :width="props.compactTopBar ? 40 : 48"
        :height="props.compactTopBar ? 40 : 48"
        decoding="async"
        draggable="false"
        class="echo-logo object-contain"
        :class="
          props.compactTopBar ? 'echo-logo--compact-top h-10 w-10' : 'h-12 w-12'
        "
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
$reactive-decay-ease: cubic-bezier(0.33, 1, 0.68, 1);

/* Motion + sheen variables: shared by vertical rail and top bar (compact) chrome. */
.echo-corner {
  --echo-cursor-x: 24%;
  --echo-cursor-y: 16%;
  --echo-shift-x: 0px;
  --echo-shift-y: 0px;
  --echo-logo-shift-x: 0px;
  --echo-logo-shift-y: 0px;
  --echo-logo-shadow-x: 0px;
  --echo-logo-shadow-y: 0px;
  --echo-highlight-opacity: 0.54;
  --echo-logo-sheen-opacity: 0.54;
  --echo-press-depth: 0;
  --echo-logo-press-scale: 1;
  --echo-logo-inner-scale: 1;
  --echo-logo-press-shadow: 0px;
  --echo-logo-press-sheen-shift: 0px;
}

.echo-corner--fluid {
  min-height: 7.25rem;
}

/**
 * Horizontal top strip: keep liquid chrome behind the logo only — no negative horizontal
 * spill into DM / server pills (those sit in sibling flex items).
 */
.echo-corner--compact-top {
  contain: layout paint;
  /* Top action rail: no vertical rule between the Echo mark and the DM/server strip */
  border-inline-end: none;
}

.echo-corner--compact-top .echo-corner__fluid {
  /* Stay inside the logo column; blur reads as “corner” only */
  inset: -0.25rem 0 -0.25rem 0;
  width: 100%;
  max-width: 5.25rem;
  margin-left: -0.125rem;
  height: 3.35rem;
  max-height: none;
  mask-image: radial-gradient(
    ellipse 95% 115% at 38% 52%,
    rgb(0 0 0 / 1) 0%,
    rgb(0 0 0 / 0.45) 48%,
    transparent 72%
  );
  mask-mode: alpha;
  mask-repeat: no-repeat;
  mask-size: 100% 100%;
  mask-position: center;
  -webkit-mask-image: radial-gradient(
    ellipse 95% 115% at 38% 52%,
    rgb(0 0 0 / 1) 0%,
    rgb(0 0 0 / 0.45) 48%,
    transparent 72%
  );
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-size: 100% 100%;
}

.echo-corner--compact-top .echo-corner__highlight {
  inset: 0.12rem 0.15rem auto 0.06rem;
  height: 2.35rem;
}

.echo-corner--compact-top .echo-corner__liquid {
  height: 2.85rem;
  opacity: 0.58;
}

.echo-corner--compact-top .echo-corner__ambient {
  filter: blur(12px) saturate(112%);
  opacity: 0.58;
}

.echo-corner--compact-top .echo-corner__particles {
  opacity: 0.22;
}

/** Match sidebar corner radius ratio: 18px / 48px → 15px at 40px mark. */
.echo-logo-wrapper--compact-top {
  border-radius: 15px;
  clip-path: inset(0 round 15px);
  -webkit-clip-path: inset(0 round 15px);
}

.echo-logo--compact-top {
  border-radius: 15px;
}

.echo-corner__defs {
  position: absolute;
}

.echo-corner__fluid {
  position: absolute;
  inset: -0.55rem -2rem auto -0.6rem;
  height: 9.2rem;
  z-index: 0;
  mask-image: radial-gradient(
    circle at 24% 16%,
    var(--vue-auto-234) 0%,
    var(--vue-auto-235) 36%,
    var(--vue-auto-236) 66%,
    transparent 95%
  );
  transition: mask-position 220ms ease-out;
}

.echo-corner__base,
.echo-corner__ambient,
.echo-corner__highlight,
.echo-corner__particles,
.echo-corner__shadow,
.echo-corner__liquid {
  position: absolute;
  inset: 0;
}

.echo-corner__base {
  background:
    radial-gradient(
      circle at calc(var(--echo-cursor-x) - 8%) calc(var(--echo-cursor-y) + 2%),
      var(--vue-auto-237) 0%,
      var(--vue-auto-238) 28%,
      var(--vue-auto-035) 62%
    ),
    radial-gradient(
      circle at calc(var(--echo-cursor-x) + 22%) 0%,
      var(--vue-auto-239) 0%,
      var(--vue-auto-240) 58%
    ),
    linear-gradient(180deg, var(--vue-auto-241) 0%, var(--vue-auto-035) 100%);
  transition: background-position 220ms ease-out;
}

.echo-corner__ambient {
  background:
    radial-gradient(
      ellipse at var(--echo-cursor-x) calc(var(--echo-cursor-y) - 4%),
      var(--vue-auto-242) 0%,
      var(--vue-auto-243) 26%,
      var(--vue-auto-244) 48%,
      var(--vue-auto-035) 72%
    ),
    radial-gradient(
      ellipse at calc(var(--echo-cursor-x) + 30%)
        calc(var(--echo-cursor-y) + 14%),
      var(--vue-auto-245) 0%,
      var(--vue-auto-035) 62%
    ),
    radial-gradient(
      ellipse at 10% 66%,
      var(--vue-auto-246) 0%,
      var(--vue-auto-247) 64%
    );
  filter: blur(22px) saturate(118%);
  opacity: 0.8;
  animation: echo-fluid-breathe 28s ease-in-out infinite alternate;
  transition: transform 220ms ease-out;
}

.echo-corner__highlight {
  inset: 0.35rem 0.8rem auto 0.15rem;
  height: 5.8rem;
  background:
    radial-gradient(
      ellipse at calc(var(--echo-cursor-x) + 4%) calc(var(--echo-cursor-y) - 1%),
      var(--vue-auto-248) 0%,
      var(--vue-auto-249) 20%,
      var(--vue-auto-250) 58%
    ),
    radial-gradient(
      ellipse at calc(var(--echo-cursor-x) + 22%)
        calc(var(--echo-cursor-y) + 7%),
      var(--vue-auto-251) 0%,
      var(--vue-auto-252) 55%
    );
  mix-blend-mode: screen;
  opacity: var(--echo-highlight-opacity);
  transition: opacity 220ms ease-out;
}

.echo-corner__liquid {
  inset: -0.35rem -0.9rem auto -0.35rem;
  width: calc(100% + 1.4rem);
  height: 8.35rem;
  opacity: 0.84;
  filter: blur(8px) saturate(122%);
  transform-origin: 24% 22%;
  will-change: transform, opacity;
  animation: echo-fluid-drift 38s ease-in-out infinite alternate;
}

.echo-corner__particles {
  background-image:
    radial-gradient(
      circle at 18% 21%,
      var(--vue-auto-253) 0 1.1px,
      var(--vue-auto-254) 1.8px,
      var(--vue-auto-255) 4.6px
    ),
    radial-gradient(
      circle at 28% 33%,
      var(--vue-auto-256) 0 1.2px,
      var(--vue-auto-257) 2px,
      var(--vue-auto-258) 4.8px
    ),
    radial-gradient(
      circle at 36% 18%,
      var(--vue-auto-259) 0 0.9px,
      var(--vue-auto-260) 1.7px,
      var(--vue-auto-261) 4.2px
    ),
    radial-gradient(
      circle at 46% 28%,
      var(--vue-auto-262) 0 1.1px,
      var(--vue-auto-263) 1.9px,
      var(--vue-auto-264) 4.5px
    ),
    radial-gradient(
      circle at 40% 48%,
      var(--vue-auto-265) 0 1px,
      var(--vue-auto-266) 1.8px,
      var(--vue-auto-267) 4.2px
    );
  mix-blend-mode: screen;
  opacity: 0.3;
  animation: echo-particles-twinkle 16s ease-in-out infinite alternate;
}

.echo-corner__shadow {
  background:
    radial-gradient(
      ellipse at 14% 16%,
      var(--vue-auto-268) 0%,
      var(--vue-auto-269) 34%,
      var(--vue-auto-270) 70%,
      var(--vue-auto-271) 100%
    ),
    linear-gradient(180deg, var(--vue-auto-272) 0%, var(--vue-auto-273) 100%);
  mix-blend-mode: multiply;
  opacity: 0.9;
}

/* Firefox: reduce continuous compositor/paint pressure from decorative rail effects. */
@supports (-moz-appearance: none) {
  .echo-corner__ambient,
  .echo-corner__liquid,
  .echo-corner__particles {
    animation: none;
  }

  .echo-corner__ambient {
    filter: blur(12px) saturate(108%);
    opacity: 0.72;
  }

  .echo-corner__liquid {
    filter: blur(5px) saturate(110%);
    opacity: 0.76;
  }

  .echo-corner__particles {
    opacity: 0.2;
  }
}

.echo-logo-wrapper {
  pointer-events: auto;
  position: relative;
  border-radius: 18px;
  /**
   * Self-contained brand icon: opaque rounded square with brand gradient.
   * Previously relied on .echo-corner__fluid sibling rendering perfectly behind
   * the wrapper — when that misaligned (Safari compositing, narrow rail, etc.)
   * the triangle PNG's transparent corners revealed the dark rail and read as
   * "two sharp corners" since the triangle artwork is not square.
   */
  background: linear-gradient(135deg, #4a3bff 0%, #2d77ff 55%, #5b3dff 100%);
  /**
   * WebKit bug: this wrapper has transform: translate3d(...) for hover motion,
   * which promotes it to its own compositing layer. Safari does NOT reliably honor
   * border-radius + overflow:hidden for clipping at the layer level — square
   * corners leak through. clip-path IS honored by the compositor and forces the
   * rounded shape regardless.
   */
  clip-path: inset(0 round 18px);
  -webkit-clip-path: inset(0 round 18px);
  /* Belt-and-suspenders for WebKit: paint containment forces a self-contained layer. */
  contain: paint;
  /* Keep sheen + logo compositing off the fluid rail (fixes wrong backdrop). */
  isolation: isolate;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  touch-action: manipulation;
  transform: translate3d(var(--echo-logo-shift-x), var(--echo-logo-shift-y), 0)
    scale(var(--echo-logo-press-scale));
  transition:
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1);
  /**
   * iOS Safari composites `filter: drop-shadow` on `<img>` at a low-res layer (blurry logo).
   * Box-shadow on this wrapper gives a similar glow without filtering the bitmap.
   */
  box-shadow: calc(var(--echo-logo-shadow-x) * 0.45)
    calc(
      10px + (var(--echo-logo-shadow-y) * 0.45) - var(--echo-logo-press-shadow)
    )
    calc(22px - (var(--echo-logo-press-shadow) * 1.2)) 0 var(--vue-auto-275);
}

.echo-logo-wrapper::after {
  content: '';
  position: absolute;
  inset: -8%;
  background: linear-gradient(
    128deg,
    var(--vue-auto-021) 18%,
    var(--vue-auto-004) 34%,
    var(--vue-auto-274) 44%,
    var(--vue-auto-003) 54%,
    var(--vue-auto-021) 68%
  );
  mix-blend-mode: screen;
  opacity: var(--echo-logo-sheen-opacity);
  transform: translate3d(
      calc(var(--echo-logo-shift-x) * 0.75),
      calc(
        (var(--echo-logo-shift-y) * 0.75) + var(--echo-logo-press-sheen-shift)
      ),
      0
    )
    rotate(8deg);
  transition:
    opacity 180ms ease-out,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.echo-logo {
  display: block;
  /**
   * Per WebKit guidance: NEVER transform a child of a rounded `overflow: hidden`
   * wrapper. Safari promotes the child to its own compositing layer and the
   * parent's rounded clip is not applied at the layer level — square corners
   * leak through. The wrapper does the clipping (clip-path + border-radius +
   * mask-image fallback). This element must stay transform-free.
   */
  transform: none;
  background: transparent;
  outline: none;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

.echo-logo.echo-logo--compact-top {
  /* No clip-path / border-radius needed — the wrapper handles all clipping. */
}

@keyframes echo-fluid-drift {
  0% {
    transform: translate3d(var(--echo-shift-x), var(--echo-shift-y), 0) scale(1);
  }
  100% {
    transform: translate3d(
        calc(var(--echo-shift-x) + 2px),
        calc(var(--echo-shift-y) + 1px),
        0
      )
      scale(1.01);
  }
}

@keyframes echo-fluid-breathe {
  0% {
    opacity: 0.72;
  }
  100% {
    opacity: 0.82;
  }
}

@keyframes echo-particles-twinkle {
  0% {
    opacity: 0.42;
    transform: translate3d(
      calc(var(--echo-shift-x) * 0.35),
      calc(var(--echo-shift-y) * 0.35),
      0
    );
  }
  100% {
    opacity: 0.62;
    transform: translate3d(
      calc((var(--echo-shift-x) * 0.35) + 1px),
      calc((var(--echo-shift-y) * 0.35) - 1px),
      0
    );
  }
}

/* Light mode: flat logo — no liquid glow or sheen behind the Echo mark */
[data-theme='light'] .echo-corner__fluid {
  display: none;
}

[data-theme='light'] .echo-logo-wrapper {
  box-shadow: none;
}

[data-theme='light'] .echo-logo-wrapper::after {
  display: none;
}

/**
 * Safari-only fallback: if clip-path + border-radius + overflow:hidden still
 * fails to clip (older WebKit / specific compositing paths), force the rounded
 * shape via a mask. The opaque mask is a no-op visually but switches Safari to
 * the mask compositor pipeline, which honors the parent shape correctly.
 */
@supports (-webkit-hyphens: none) {
  .echo-logo-wrapper {
    -webkit-mask-image: -webkit-radial-gradient(white, black);
    mask-image: radial-gradient(white, black);
  }

  .echo-logo,
  .echo-logo-wrapper > img {
    transform: none !important;
  }
}
</style>
