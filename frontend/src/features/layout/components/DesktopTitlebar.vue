<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { icons } from '@/assets/icons';
import {
  startDesktopWindowDrag,
  minimizeDesktopWindow,
  toggleMaximizeDesktopWindow,
  closeDesktopWindow,
  isDesktopWindowMaximized,
  isMacDesktop,
} from '@/platform/desktopBridge';

// macOS shows native traffic lights; render a minimal drag strip instead of the
// branded bar + custom Windows-style window buttons.
const isMac = isMacDesktop();

const isMaximized = ref(false);

async function refreshMaximized() {
  isMaximized.value = await isDesktopWindowMaximized();
}

let resizeObserver: (() => void) | null = null;

onMounted(async () => {
  await refreshMaximized();
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const unlisten1 = await win.listen('tauri://resize', refreshMaximized);
    const unlisten2 = await win.listen('tauri://maximize', refreshMaximized);
    const unlisten3 = await win.listen('tauri://unmaximize', refreshMaximized);
    resizeObserver = () => {
      unlisten1();
      unlisten2();
      unlisten3();
    };
  } catch {
    resizeObserver = null;
  }
});

onUnmounted(() => {
  resizeObserver?.();
});

function onDragRegionMousedown(e: MouseEvent) {
  if (e.button !== 0) return;
  // Overlay titlebar: native drag via data-tauri-drag-region; JS startDragging
  // on the first click of a double-click can fight macOS titlebar zoom.
  if (isMac) return;
  startDesktopWindowDrag();
}

function onDragRegionDoubleClick(e: MouseEvent) {
  if (e.button !== 0) return;
  // macOS handles double-click zoom on the overlay titlebar natively; calling
  // toggleMaximize here races the OS and snaps back to the previous size.
  if (isMac) return;
  void toggleMaximizeDesktopWindow();
}
</script>

<template>
  <div
    class="desktop-titlebar"
    :class="{ 'desktop-titlebar--mac': isMac }"
    @mousedown.self="onDragRegionMousedown"
    @dblclick.self="onDragRegionDoubleClick"
  >
    <!-- macOS draws native traffic lights (Overlay titlebar); render only a
         minimal, brand-free drag strip there. -->
    <div
      v-if="isMac"
      class="desktop-titlebar__mac-drag"
      data-tauri-drag-region
      @mousedown="onDragRegionMousedown"
      @dblclick="onDragRegionDoubleClick"
    />

    <div
      v-if="!isMac"
      class="desktop-titlebar__brand"
      data-tauri-drag-region
      @mousedown="onDragRegionMousedown"
      @dblclick="onDragRegionDoubleClick"
    >
      <img
        :src="icons.echoRounded || icons.echo"
        alt=""
        class="desktop-titlebar__brand-logo"
      />
      <span class="desktop-titlebar__brand-title">Echo</span>
      <span class="desktop-titlebar__brand-sep" aria-hidden="true">|</span>
      <span class="desktop-titlebar__brand-subtitle">Desktop</span>
    </div>
    <div
      v-if="!isMac"
      class="desktop-titlebar__drag"
      data-tauri-drag-region
      @mousedown="onDragRegionMousedown"
      @dblclick="onDragRegionDoubleClick"
    />

    <div
      v-if="!isMac"
      class="desktop-titlebar__controls"
      data-tauri-drag-region="false"
      aria-label="Window controls"
      role="toolbar"
      aria-orientation="horizontal"
    >
      <!-- Windows order: minimize, maximize, close (left → right; close at far right) -->
      <button
        type="button"
        class="desktop-titlebar__btn"
        title="Minimize"
        aria-label="Minimize window"
        @click.stop="minimizeDesktopWindow"
      >
        <svg
          class="desktop-titlebar__glyph"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 5h8"
            stroke="currentColor"
            stroke-width="1.25"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <button
        type="button"
        class="desktop-titlebar__btn"
        :title="isMaximized ? 'Restore down' : 'Maximize'"
        :aria-label="isMaximized ? 'Restore window' : 'Maximize window'"
        @click.stop="toggleMaximizeDesktopWindow"
      >
        <svg
          v-if="!isMaximized"
          class="desktop-titlebar__glyph"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="1.25"
            y="1.25"
            width="7.5"
            height="7.5"
            rx="0.5"
            stroke="currentColor"
            stroke-width="1.15"
          />
        </svg>
        <svg
          v-else
          class="desktop-titlebar__glyph"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="3.35"
            y="1.35"
            width="5.3"
            height="5.3"
            rx="0.35"
            stroke="currentColor"
            stroke-width="1.05"
          />
          <rect
            x="1.35"
            y="3.35"
            width="5.3"
            height="5.3"
            rx="0.35"
            stroke="currentColor"
            stroke-width="1.05"
          />
        </svg>
      </button>
      <button
        type="button"
        class="desktop-titlebar__btn desktop-titlebar__btn--close"
        title="Close"
        aria-label="Close window"
        @click.stop="closeDesktopWindow"
      >
        <svg
          class="desktop-titlebar__glyph"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.5 2.5l5 5M7.5 2.5l-5 5"
            stroke="currentColor"
            stroke-width="1.15"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.desktop-titlebar {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  height: 36px;
  width: 100%;
  flex-shrink: 0;
  padding: 0;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg, #130d1e) 92%, #221635 8%),
    color-mix(in srgb, var(--bg, #130d1e) 98%, #130d1e 2%)
  );
  border-bottom: 1px solid
    color-mix(in srgb, var(--border, #2a1b3a) 80%, transparent);
  /* Drag only on brand + spacer — root must stay no-drag so Win/Linux WebViews deliver clicks to controls */
  -webkit-app-region: no-drag;
  app-region: no-drag;
  user-select: none;
}

.desktop-titlebar__brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  min-width: 0;
  padding: 0 12px 0 10px;
  color: color-mix(in srgb, var(--text, #fff) 88%, transparent);
  -webkit-app-region: drag;
  app-region: drag;
}

.desktop-titlebar__brand-logo {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  clip-path: inset(0 round 4px);
  -webkit-clip-path: inset(0 round 4px);
  flex-shrink: 0;
  opacity: 0.95;
}

.desktop-titlebar__brand-title {
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.desktop-titlebar__brand-sep {
  font-size: 11px;
  opacity: 0.35;
}

.desktop-titlebar__brand-subtitle {
  font-size: 11px;
  opacity: 0.62;
  letter-spacing: 0.01em;
}

.desktop-titlebar__drag {
  flex: 1;
  min-width: 0;
  height: 100%;
  -webkit-app-region: drag;
  app-region: drag;
}

/* macOS: native traffic lights are painted by the OS over the top-left.
   Keep a shorter, brand-free strip and reserve the lights' zone. */
.desktop-titlebar--mac {
  height: 28px;
}

.desktop-titlebar__mac-drag {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding-left: 78px;
  -webkit-app-region: drag;
  app-region: drag;
}

.desktop-titlebar__controls {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  flex-shrink: 0;
  height: 100%;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.desktop-titlebar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  min-height: 100%;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: color-mix(in srgb, var(--text, #fff) 86%, transparent);
  cursor: pointer;
  transition:
    background-color 0.08s ease,
    color 0.08s ease;
  -webkit-app-region: no-drag;
  app-region: no-drag;

  &:hover {
    background: color-mix(in srgb, var(--text, #fff) 10%, transparent);
    color: color-mix(in srgb, var(--text, #fff) 96%, transparent);
  }

  &:active {
    background: color-mix(in srgb, var(--text, #fff) 15%, transparent);
  }
}

.desktop-titlebar__btn--close:hover {
  background: #e81123;
  color: #fff;
}

.desktop-titlebar__btn--close:active {
  background: #bf0f1d;
  color: #fff;
}

.desktop-titlebar__glyph {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  pointer-events: none;
}

:global(html[data-theme='light']) .desktop-titlebar {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg, #fff) 86%, #f4f6fb 14%),
    color-mix(in srgb, var(--bg, #fff) 94%, #eef1f8 6%)
  );
  border-bottom-color: color-mix(
    in srgb,
    var(--border, #d8dce8) 86%,
    transparent
  );

  .desktop-titlebar__brand {
    color: color-mix(in srgb, #111 84%, transparent);
  }

  .desktop-titlebar__brand-subtitle {
    opacity: 0.56;
  }

  .desktop-titlebar__btn {
    color: rgba(0, 0, 0, 0.7);

    &:hover {
      background: rgba(0, 0, 0, 0.06);
      color: rgba(0, 0, 0, 0.88);
    }

    &:active {
      background: rgba(0, 0, 0, 0.1);
    }
  }

  .desktop-titlebar__btn--close:hover {
    background: #e81123;
    color: #fff;
  }

  .desktop-titlebar__btn--close:active {
    background: #bf0f1d;
    color: #fff;
  }
}
</style>
