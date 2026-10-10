<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import type {
  EchoSkrigglesCanvasCmdV1,
  EchoSkrigglesCanvasSnapshotV1,
  EchoSkrigglesStrokeBatchV1,
} from '@/audio/voiceEchoLiveKitData';
import {
  CANVAS_H,
  CANVAS_W,
  SKRIGGLES_BRUSH_SIZES,
  SKRIGGLES_PALETTE,
  useSkrigglesCanvas,
} from '@/features/voice/skriggles/useSkrigglesCanvas';
import type { SkrigglesCanvasEvent } from '@/features/voice/skriggles/skrigglesVoiceSession';

const props = defineProps<{
  roundSeq: number;
  canvasEvents: readonly SkrigglesCanvasEvent[];
  canDraw: boolean;
  publishStrokeBatch: (batch: EchoSkrigglesStrokeBatchV1) => void;
  publishCanvasCmd: (cmd: EchoSkrigglesCanvasCmdV1) => void;
  publishCanvasSnapshot: (snapshot: EchoSkrigglesCanvasSnapshotV1) => void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);

const {
  tool,
  color,
  brushSize,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  clearBoard,
  undoLastStroke,
} = useSkrigglesCanvas({
  canvasRef,
  roundSeq: toRef(props, 'roundSeq'),
  canvasEvents: toRef(props, 'canvasEvents'),
  canDraw: toRef(props, 'canDraw'),
  publishStrokeBatch: (batch) => props.publishStrokeBatch(batch),
  publishCanvasCmd: (cmd) => props.publishCanvasCmd(cmd),
  publishCanvasSnapshot: (snapshot) => props.publishCanvasSnapshot(snapshot),
});

const showToolbar = computed(() => props.canDraw);

function setTool(next: 'pen' | 'eraser' | 'fill'): void {
  if (!props.canDraw) return;
  tool.value = next;
}
</script>

<template>
  <section class="sk-canvas-wrap" aria-label="Drawing canvas">
    <div
      v-if="showToolbar"
      class="sk-toolbar"
      role="toolbar"
      aria-label="Drawing tools"
    >
      <div class="sk-toolbar__group">
        <button
          type="button"
          class="sk-tool"
          :class="{ 'sk-tool--active': tool === 'pen' }"
          aria-label="Pen"
          @click="setTool('pen')"
        >
          Pen
        </button>
        <button
          type="button"
          class="sk-tool"
          :class="{ 'sk-tool--active': tool === 'eraser' }"
          aria-label="Eraser"
          @click="setTool('eraser')"
        >
          Eraser
        </button>
        <button
          type="button"
          class="sk-tool"
          :class="{ 'sk-tool--active': tool === 'fill' }"
          aria-label="Fill"
          @click="setTool('fill')"
        >
          Fill
        </button>
      </div>

      <div class="sk-toolbar__group sk-toolbar__colors" aria-label="Colors">
        <button
          v-for="c in SKRIGGLES_PALETTE"
          :key="c"
          type="button"
          class="sk-swatch"
          :class="{ 'sk-swatch--active': color === c }"
          :style="{ background: c }"
          :aria-label="`Color ${c}`"
          @click="color = c"
        />
      </div>

      <div class="sk-toolbar__group" aria-label="Brush sizes">
        <button
          v-for="size in SKRIGGLES_BRUSH_SIZES"
          :key="size"
          type="button"
          class="sk-size"
          :class="{ 'sk-size--active': brushSize === size }"
          :aria-label="`Size ${size}`"
          @click="brushSize = size"
        >
          <span
            :style="{
              width: `${Math.min(size, 18)}px`,
              height: `${Math.min(size, 18)}px`,
            }"
          />
        </button>
      </div>

      <div class="sk-toolbar__group">
        <button
          type="button"
          class="sk-tool sk-tool--ghost"
          @click="undoLastStroke"
        >
          Undo
        </button>
        <button
          type="button"
          class="sk-tool sk-tool--ghost"
          @click="clearBoard"
        >
          Clear
        </button>
      </div>
    </div>

    <div class="sk-canvas-frame">
      <canvas
        ref="canvasRef"
        class="sk-canvas"
        :width="CANVAS_W"
        :height="CANVAS_H"
        :class="{ 'sk-canvas--readonly': !canDraw }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
        @pointercancel="onPointerUp"
      />
    </div>
  </section>
</template>

<style scoped lang="scss" src="./styles/VcSkrigglesCanvas.scss"></style>
