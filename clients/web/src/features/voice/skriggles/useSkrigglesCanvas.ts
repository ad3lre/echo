import { onUnmounted, ref, watch, type Ref, type ShallowRef } from 'vue';
import type {
  EchoSkrigglesCanvasCmdV1,
  EchoSkrigglesCanvasSnapshotV1,
  EchoSkrigglesStrokeBatchV1,
  EchoSkrigglesStrokeToolV1,
} from '@/audio/voiceEchoLiveKitData';
import type { SkrigglesCanvasEvent } from '@/features/voice/skriggles/skrigglesVoiceSession';

export const CANVAS_W = 800;
export const CANVAS_H = 600;

const FLUSH_MS = 16;
const CANVAS_BG = '#ffffff';

export type SkrigglesCanvasTool = 'pen' | 'eraser' | 'fill';

export const SKRIGGLES_PALETTE = [
  '#000000',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#78716c',
] as const;

export const SKRIGGLES_BRUSH_SIZES = [2, 4, 8, 14, 22] as const;

type StoredStroke = {
  strokeId: number;
  color: string;
  width: number;
  tool: EchoSkrigglesStrokeToolV1;
  points: number[];
};

export type UseSkrigglesCanvasOpts = {
  canvasRef: Ref<HTMLCanvasElement | null>;
  roundSeq: Ref<number>;
  canvasEvents:
    | Ref<readonly SkrigglesCanvasEvent[]>
    | ShallowRef<readonly SkrigglesCanvasEvent[]>;
  canDraw: Ref<boolean>;
  publishStrokeBatch: (batch: EchoSkrigglesStrokeBatchV1) => void;
  publishCanvasCmd: (cmd: EchoSkrigglesCanvasCmdV1) => void;
  publishCanvasSnapshot: (snapshot: EchoSkrigglesCanvasSnapshotV1) => void;
};

export function useSkrigglesCanvas(opts: UseSkrigglesCanvasOpts) {
  const tool = ref<SkrigglesCanvasTool>('pen');
  const color = ref<string>(SKRIGGLES_PALETTE[0]!);
  const brushSize = ref<number>(SKRIGGLES_BRUSH_SIZES[1]!);

  const strokes: StoredStroke[] = [];
  let strokeIdCounter = 0;
  let cmdSeqCounter = 0;
  let appliedEventCount = 0;
  let isDrawing = false;
  let currentStrokeId = 0;
  let pendingPoints: number[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function getCtx(): CanvasRenderingContext2D | null {
    const canvas = opts.canvasRef.value;
    if (!canvas) return null;
    return canvas.getContext('2d');
  }

  function clearCanvasSurface(): void {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
  }

  function configureStrokeStyle(
    ctx: CanvasRenderingContext2D,
    stroke: StoredStroke,
  ): void {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.width;
    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
    }
  }

  function drawDot(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    stroke: StoredStroke,
  ): void {
    ctx.beginPath();
    ctx.arc(x, y, stroke.width / 2, 0, Math.PI * 2);
    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = stroke.color;
    }
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawStrokePath(
    ctx: CanvasRenderingContext2D,
    stroke: StoredStroke,
    fromIndex = 0,
  ): void {
    const pts = stroke.points;
    if (pts.length < 2) return;
    configureStrokeStyle(ctx, stroke);
    if (pts.length === 2) {
      drawDot(ctx, pts[0]!, pts[1]!, stroke);
      return;
    }
    const start = Math.max(0, fromIndex);
    ctx.beginPath();
    ctx.moveTo(pts[start]!, pts[start + 1]!);
    for (let i = start + 2; i < pts.length; i += 2) {
      ctx.lineTo(pts[i]!, pts[i + 1]!);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  function redrawAll(): void {
    clearCanvasSurface();
    const ctx = getCtx();
    if (!ctx) return;
    for (const stroke of strokes) {
      drawStrokePath(ctx, stroke);
    }
  }

  function findStroke(strokeId: number): StoredStroke | undefined {
    return strokes.find((s) => s.strokeId === strokeId);
  }

  function appendPointsToStroke(strokeId: number, points: number[]): void {
    const stroke = findStroke(strokeId);
    if (!stroke || points.length < 2) return;
    const ctx = getCtx();
    if (!ctx) return;
    const prevLen = stroke.points.length;
    stroke.points.push(...points);
    if (prevLen === 0) {
      drawStrokePath(ctx, stroke);
      return;
    }
    configureStrokeStyle(ctx, stroke);
    ctx.beginPath();
    ctx.moveTo(stroke.points[prevLen - 2]!, stroke.points[prevLen - 1]!);
    for (let i = prevLen; i < stroke.points.length; i += 2) {
      ctx.lineTo(stroke.points[i]!, stroke.points[i + 1]!);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  function addStrokeFromBatch(batch: EchoSkrigglesStrokeBatchV1): void {
    const existing = findStroke(batch.strokeId);
    if (existing) {
      const newPoints = batch.points.slice(existing.points.length);
      if (newPoints.length >= 2) {
        appendPointsToStroke(batch.strokeId, newPoints);
      }
      return;
    }
    strokes.push({
      strokeId: batch.strokeId,
      color: batch.color,
      width: batch.width,
      tool: batch.tool,
      points: [...batch.points],
    });
    const ctx = getCtx();
    if (ctx) drawStrokePath(ctx, strokes[strokes.length - 1]!);
  }

  function parseHexColor(hex: string): [number, number, number, number] | null {
    const h = hex.trim();
    if (!h.startsWith('#')) return null;
    const raw = h.slice(1);
    if (raw.length === 3) {
      const r = parseInt(raw[0]! + raw[0]!, 16);
      const g = parseInt(raw[1]! + raw[1]!, 16);
      const b = parseInt(raw[2]! + raw[2]!, 16);
      return [r, g, b, 255];
    }
    if (raw.length === 6) {
      const r = parseInt(raw.slice(0, 2), 16);
      const g = parseInt(raw.slice(2, 4), 16);
      const b = parseInt(raw.slice(4, 6), 16);
      return [r, g, b, 255];
    }
    return null;
  }

  function colorsMatch(
    a: [number, number, number, number],
    b: [number, number, number, number],
  ): boolean {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  }

  function getPixel(
    data: Uint8ClampedArray,
    x: number,
    y: number,
  ): [number, number, number, number] {
    const i = (y * CANVAS_W + x) * 4;
    return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
  }

  function setPixel(
    data: Uint8ClampedArray,
    x: number,
    y: number,
    rgba: [number, number, number, number],
  ): void {
    const i = (y * CANVAS_W + x) * 4;
    data[i] = rgba[0]!;
    data[i + 1] = rgba[1]!;
    data[i + 2] = rgba[2]!;
    data[i + 3] = rgba[3]!;
  }

  function floodFillAt(x: number, y: number, fillColor: string): void {
    const ctx = getCtx();
    if (!ctx) return;
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    if (fx < 0 || fy < 0 || fx >= CANVAS_W || fy >= CANVAS_H) return;

    const fillRgba = parseHexColor(fillColor);
    if (!fillRgba) return;

    const imageData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    const data = imageData.data;
    const target = getPixel(data, fx, fy);
    if (colorsMatch(target, fillRgba)) return;

    const stack: [number, number][] = [[fx, fy]];
    const visited = new Uint8Array(CANVAS_W * CANVAS_H);

    while (stack.length) {
      const [px, py] = stack.pop()!;
      const idx = py * CANVAS_W + px;
      if (visited[idx]) continue;
      visited[idx] = 1;
      const current = getPixel(data, px, py);
      if (!colorsMatch(current, target)) continue;
      setPixel(data, px, py, fillRgba);
      if (px > 0) stack.push([px - 1, py]);
      if (px < CANVAS_W - 1) stack.push([px + 1, py]);
      if (py > 0) stack.push([px, py - 1]);
      if (py < CANVAS_H - 1) stack.push([px, py + 1]);
    }

    ctx.putImageData(imageData, 0, 0);
  }

  async function applySnapshot(
    snapshot: EchoSkrigglesCanvasSnapshotV1,
  ): Promise<void> {
    const canvas = opts.canvasRef.value;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    strokes.length = 0;
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        clearCanvasSurface();
        ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
        resolve();
      };
      img.onerror = () => reject(new Error('snapshot load failed'));
      img.src = `data:image/png;base64,${snapshot.pngBase64}`;
    }).catch(() => {});
  }

  function applyCanvasEvent(event: SkrigglesCanvasEvent): void {
    if (event.kind === 'stroke') {
      addStrokeFromBatch(event.batch);
      return;
    }
    if (event.kind === 'cmd') {
      const cmd = event.cmd;
      if (cmd.cmd === 'clear') {
        strokes.length = 0;
        clearCanvasSurface();
        return;
      }
      if (cmd.cmd === 'undo') {
        strokes.pop();
        redrawAll();
        return;
      }
      if (cmd.cmd === 'fill') {
        floodFillAt(cmd.x, cmd.y, cmd.color);
      }
      return;
    }
    void applySnapshot(event.snapshot);
  }

  function replayCanvasEvents(events: readonly SkrigglesCanvasEvent[]): void {
    strokes.length = 0;
    clearCanvasSurface();
    for (const event of events) {
      applyCanvasEvent(event);
    }
    appliedEventCount = events.length;
  }

  function flushBatch(force = false): void {
    if (pendingPoints.length < 2 && !force) return;
    if (pendingPoints.length < 2) {
      pendingPoints = [];
      return;
    }
    const batch: EchoSkrigglesStrokeBatchV1 = {
      v: 1,
      t: 'skriggles_stroke_batch',
      roundSeq: opts.roundSeq.value,
      strokeId: currentStrokeId,
      color: color.value,
      width: brushSize.value,
      tool: tool.value === 'eraser' ? 'eraser' : 'pen',
      points: [...pendingPoints],
    };
    opts.publishStrokeBatch(batch);
    pendingPoints = [];
  }

  function scheduleFlush(): void {
    if (flushTimer != null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushBatch();
    }, FLUSH_MS);
  }

  function cancelFlushTimer(): void {
    if (flushTimer != null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  function pointerToCanvas(e: PointerEvent): { x: number; y: number } {
    const canvas = opts.canvasRef.value;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: Math.max(0, Math.min(CANVAS_W, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(CANVAS_H, (e.clientY - rect.top) * scaleY)),
    };
  }

  function nextCmdSeq(): number {
    cmdSeqCounter += 1;
    return cmdSeqCounter;
  }

  function publishFillCmd(x: number, y: number): void {
    opts.publishCanvasCmd({
      v: 1,
      t: 'skriggles_canvas_cmd',
      roundSeq: opts.roundSeq.value,
      cmd: 'fill',
      seq: nextCmdSeq(),
      x,
      y,
      color: color.value,
    });
  }

  function clearBoard(): void {
    if (!opts.canDraw.value) return;
    strokes.length = 0;
    clearCanvasSurface();
    opts.publishCanvasCmd({
      v: 1,
      t: 'skriggles_canvas_cmd',
      roundSeq: opts.roundSeq.value,
      cmd: 'clear',
      seq: nextCmdSeq(),
    });
  }

  function undoLastStroke(): void {
    if (!opts.canDraw.value || strokes.length === 0) return;
    strokes.pop();
    redrawAll();
    opts.publishCanvasCmd({
      v: 1,
      t: 'skriggles_canvas_cmd',
      roundSeq: opts.roundSeq.value,
      cmd: 'undo',
      seq: nextCmdSeq(),
    });
  }

  function captureSnapshot(): void {
    const canvas = opts.canvasRef.value;
    if (!canvas || !opts.canDraw.value) return;
    const pngBase64 = canvas.toDataURL('image/png').split(',')[1] ?? '';
    if (!pngBase64) return;
    opts.publishCanvasSnapshot({
      v: 1,
      t: 'skriggles_canvas_snapshot',
      roundSeq: opts.roundSeq.value,
      seq: nextCmdSeq(),
      pngBase64,
    });
  }

  function onPointerDown(e: PointerEvent): void {
    if (!opts.canDraw.value) return;
    const canvas = opts.canvasRef.value;
    if (!canvas) return;

    const { x, y } = pointerToCanvas(e);

    if (tool.value === 'fill') {
      floodFillAt(x, y, color.value);
      publishFillCmd(x, y);
      return;
    }

    isDrawing = true;
    currentStrokeId = ++strokeIdCounter;
    pendingPoints = [x, y];

    const stroke: StoredStroke = {
      strokeId: currentStrokeId,
      color: color.value,
      width: brushSize.value,
      tool: tool.value === 'eraser' ? 'eraser' : 'pen',
      points: [x, y],
    };
    strokes.push(stroke);
    const ctx = getCtx();
    if (ctx) drawDot(ctx, x, y, stroke);

    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!isDrawing || tool.value === 'fill') return;
    const { x, y } = pointerToCanvas(e);
    pendingPoints.push(x, y);

    const stroke = strokes[strokes.length - 1];
    const ctx = getCtx();
    if (stroke && ctx) {
      const prevLen = stroke.points.length;
      stroke.points.push(x, y);
      if (prevLen >= 2) {
        configureStrokeStyle(ctx, stroke);
        ctx.beginPath();
        ctx.moveTo(stroke.points[prevLen - 2]!, stroke.points[prevLen - 1]!);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    scheduleFlush();
  }

  function onPointerUp(e: PointerEvent): void {
    if (!isDrawing) return;
    isDrawing = false;
    cancelFlushTimer();
    flushBatch(true);
    opts.canvasRef.value?.releasePointerCapture(e.pointerId);
  }

  function initCanvas(): void {
    const canvas = opts.canvasRef.value;
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    clearCanvasSurface();
  }

  function resetCanvasState(): void {
    cancelFlushTimer();
    isDrawing = false;
    pendingPoints = [];
    strokes.length = 0;
    strokeIdCounter = 0;
    cmdSeqCounter = 0;
    appliedEventCount = 0;
    clearCanvasSurface();
  }

  watch(
    () => opts.roundSeq.value,
    () => {
      resetCanvasState();
    },
  );

  watch(
    () => opts.canvasEvents.value,
    (events) => {
      if (events.length < appliedEventCount) {
        replayCanvasEvents(events);
        return;
      }
      for (let i = appliedEventCount; i < events.length; i++) {
        applyCanvasEvent(events[i]!);
      }
      appliedEventCount = events.length;
    },
    { deep: true },
  );

  watch(
    () => opts.canvasRef.value,
    (canvas) => {
      if (canvas) initCanvas();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    cancelFlushTimer();
  });

  return {
    tool,
    color,
    brushSize,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    clearBoard,
    undoLastStroke,
    captureSnapshot,
    initCanvas,
    resetCanvasState,
  };
}
