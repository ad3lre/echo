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

<style scoped lang="scss" src="./styles/EchoRailCorner.scss"></style>
