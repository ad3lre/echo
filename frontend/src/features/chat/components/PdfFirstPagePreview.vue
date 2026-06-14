<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick, computed } from 'vue';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist';
import { destroyPdfLoad, startPdfUrlLoad } from '@/features/pdf/loadPdfFromUrl';
import { renderPdfPageToCanvas } from '@/features/pdf/renderPdfPage';
import { pdfLoadErrorMessage } from '@/features/pdf/isProbablyPdfCorsError';

const props = defineProps<{
  src: string;
  spoiler?: boolean;
}>();

const THUMB_CSS_WIDTH = 232;
const canvasRef = ref<HTMLCanvasElement | null>(null);

const loading = ref(true);
const error = ref<string | null>(null);

let loadGeneration = 0;
let activeTask: PDFDocumentLoadingTask | null = null;
let activeDoc: PDFDocumentProxy | undefined;
let activeRender: RenderTask | null = null;

const showCanvas = computed(() => !loading.value && !error.value);

async function teardown() {
  if (activeRender) {
    try {
      activeRender.cancel();
    } catch {
      /* ignore */
    }
    activeRender = null;
  }
  const t = activeTask;
  const d = activeDoc;
  activeTask = null;
  activeDoc = undefined;
  await destroyPdfLoad(t, d);
}

async function renderFirstPage(
  pdf: PDFDocumentProxy,
  gen: number,
): Promise<boolean> {
  await nextTick();
  const canvas = canvasRef.value;
  if (!canvas || gen !== loadGeneration) return false;

  const page = await pdf.getPage(1);
  if (gen !== loadGeneration) return false;

  const { renderTask } = renderPdfPageToCanvas({
    page,
    canvas,
    cssWidth: THUMB_CSS_WIDTH,
  });
  activeRender = renderTask;
  await renderTask.promise;
  if (gen !== loadGeneration) return false;
  activeRender = null;
  return true;
}

async function loadPreview() {
  const gen = ++loadGeneration;
  await teardown();
  if (gen !== loadGeneration) return;

  const url = props.src?.trim();
  if (!url) {
    loading.value = false;
    error.value = null;
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const { task, promise } = startPdfUrlLoad(url);
    activeTask = task;
    const pdf = await promise;
    if (gen !== loadGeneration) {
      await destroyPdfLoad(task, pdf);
      return;
    }
    activeDoc = pdf;
    activeTask = null;

    const rendered = await renderFirstPage(pdf, gen);
    if (gen !== loadGeneration) return;
    if (!rendered) {
      await destroyPdfLoad(null, pdf);
      activeDoc = undefined;
      error.value = 'Could not render PDF preview.';
    }
    loading.value = false;
  } catch (e) {
    if (gen !== loadGeneration) return;
    activeRender = null;
    activeDoc = undefined;
    activeTask = null;
    await destroyPdfLoad(activeTask, undefined).catch(() => {});
    error.value = pdfLoadErrorMessage(e);
    loading.value = false;
  }
}

watch(
  () => props.src,
  () => {
    void loadPreview();
  },
  { immediate: true },
);

onUnmounted(() => {
  loadGeneration++;
  void teardown();
});
</script>

<template>
  <div
    class="relative shrink-0 overflow-hidden rounded-md border border-border bg-glass-2"
    :class="spoiler ? 'ring-2 ring-amber-500/70' : ''"
    :style="{ width: `${THUMB_CSS_WIDTH}px`, maxHeight: '120px' }"
  >
    <div
      class="relative flex max-h-[120px] min-h-[120px] justify-center overflow-hidden bg-[#2a2a2e]"
    >
      <canvas
        ref="canvasRef"
        class="block max-w-full"
        :class="[
          spoiler && showCanvas ? 'blur-md' : '',
          showCanvas ? 'opacity-100' : 'invisible',
        ]"
        aria-hidden="true"
      />
      <div
        v-if="loading"
        class="absolute inset-0 flex items-center justify-center bg-glass-2"
      >
        <div
          class="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent"
          aria-hidden="true"
        />
      </div>
      <div
        v-else-if="error"
        class="absolute inset-0 flex flex-col justify-center gap-1 bg-glass-2 px-2 py-1.5 text-center"
      >
        <span class="text-[10px] leading-snug text-fg-subtle">{{ error }}</span>
      </div>
      <div
        v-if="spoiler && showCanvas"
        class="pointer-events-none absolute inset-0 bg-scrim-2/40"
        aria-hidden="true"
      />
    </div>
  </div>
</template>
