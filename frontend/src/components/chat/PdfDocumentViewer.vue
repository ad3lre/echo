<script setup lang="ts">
import { ref, shallowRef, watch, onUnmounted, nextTick, computed } from 'vue';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist';
import { destroyPdfLoad, startPdfUrlLoad } from '@/features/pdf/loadPdfFromUrl';
import { renderPdfPageToCanvas } from '@/features/pdf/renderPdfPage';
import { outlineDestToPageNumber } from '@/features/pdf/outlineDestToPage';
import { pdfLoadErrorMessage } from '@/features/pdf/isProbablyPdfCorsError';
import { openExternal } from '@/platform/desktopBridge';

const props = defineProps<{
  url: string;
  documentLabel: string;
  downloadUrl?: string;
  downloadFilename?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

type OutlineNode = {
  title: string;
  dest: string | unknown[] | null;
  url: string | null;
  items?: OutlineNode[];
};

type FlatOutlineRow = {
  title: string;
  depth: number;
  dest: string | unknown[] | null;
  url: string | null;
};

const canvasRef = ref<HTMLCanvasElement | null>(null);
const viewportRef = ref<HTMLElement | null>(null);

const loading = ref(true);
const pageRendering = ref(false);
const loadError = ref<string | null>(null);

const pdfRef = shallowRef<PDFDocumentProxy | null>(null);
const numPages = ref(0);
const outlineFlat = shallowRef<FlatOutlineRow[]>([]);

const pageNum = ref(1);
const userZoom = ref(1);
const fitMode = ref<'width' | 'page'>('width');

const outlineOpen = ref(false);

let loadGeneration = 0;
let activeTask: PDFDocumentLoadingTask | null = null;
let activeRender: RenderTask | null = null;

const canGoPrev = computed(() => pageNum.value > 1);
const canGoNext = computed(
  () => !!pdfRef.value && pageNum.value < numPages.value,
);
const zoomPct = computed(() => Math.round(userZoom.value * 100));
const canvasAriaLabel = computed(
  () =>
    `${props.documentLabel}, page ${pageNum.value} of ${numPages.value || '?'}`,
);

function flattenOutline(items: OutlineNode[], depth = 0): FlatOutlineRow[] {
  const out: FlatOutlineRow[] = [];
  for (const it of items) {
    out.push({
      title: it.title,
      depth,
      dest: it.dest,
      url: it.url,
    });
    if (it.items?.length) {
      out.push(...flattenOutline(it.items, depth + 1));
    }
  }
  return out;
}

async function teardownRenderAndDoc() {
  if (activeRender) {
    try {
      activeRender.cancel();
    } catch {
      /* ignore */
    }
    activeRender = null;
  }
  const pdf = pdfRef.value;
  const task = activeTask;
  pdfRef.value = null;
  activeTask = null;
  await destroyPdfLoad(task, pdf ?? undefined);
}

async function renderCurrentPage(): Promise<boolean> {
  const pdf = pdfRef.value;
  const canvas = canvasRef.value;
  const wrap = viewportRef.value;
  if (!pdf || !canvas || !wrap) return false;

  const gen = loadGeneration;
  if (activeRender) {
    try {
      activeRender.cancel();
    } catch {
      /* ignore */
    }
    activeRender = null;
  }

  const p = Math.min(Math.max(1, pageNum.value), pdf.numPages);
  pageNum.value = p;

  const pad = 24;
  const cw = Math.max(80, wrap.clientWidth - pad);
  const ch = Math.max(80, wrap.clientHeight - pad);

  pageRendering.value = true;
  try {
    const page = await pdf.getPage(p);
    if (gen !== loadGeneration) return false;
    const base = page.getViewport({ scale: 1 });
    const fitW = cw / base.width;
    const fitH = ch / base.height;
    const baseline = fitMode.value === 'width' ? fitW : Math.min(fitW, fitH);
    const cssWidth = base.width * baseline * userZoom.value;
    const { renderTask } = renderPdfPageToCanvas({
      page,
      canvas,
      cssWidth,
    });
    activeRender = renderTask;
    await renderTask.promise;
    if (gen !== loadGeneration) return false;
    activeRender = null;
    return true;
  } catch (e) {
    if (gen !== loadGeneration) return false;
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.toLowerCase().includes('rendering cancelled')) {
      loadError.value = msg || 'Render failed.';
    }
    return false;
  } finally {
    if (gen === loadGeneration) pageRendering.value = false;
  }
}

async function ensurePageRendered(retries = 4): Promise<void> {
  for (let i = 0; i < retries; i++) {
    if (await renderCurrentPage()) return;
    await nextTick();
  }
}

async function loadDocument() {
  const gen = ++loadGeneration;
  try {
    await teardownRenderAndDoc();
  } catch {
    /* ignore */
  }
  if (gen !== loadGeneration) return;

  const url = props.url?.trim();
  if (!url) {
    loading.value = false;
    loadError.value = 'Missing document URL.';
    return;
  }

  loading.value = true;
  pageRendering.value = false;
  loadError.value = null;
  outlineFlat.value = [];
  pageNum.value = 1;
  userZoom.value = 1;
  fitMode.value = 'width';
  outlineOpen.value = false;

  try {
    const { task, promise } = startPdfUrlLoad(url);
    activeTask = task;
    const pdf = await promise;
    if (gen !== loadGeneration) {
      await destroyPdfLoad(task, pdf);
      return;
    }
    pdfRef.value = pdf;
    activeTask = null;
    numPages.value = pdf.numPages;
    try {
      const ol = (await pdf.getOutline()) as OutlineNode[] | null;
      outlineFlat.value = ol?.length ? flattenOutline(ol) : [];
    } catch {
      outlineFlat.value = [];
    }
    loading.value = false;
    await nextTick();
    if (gen !== loadGeneration) return;
    await ensurePageRendered();
  } catch (e) {
    if (gen !== loadGeneration) return;
    await destroyPdfLoad(activeTask, undefined).catch(() => {});
    activeTask = null;
    loadError.value = pdfLoadErrorMessage(e);
    loading.value = false;
  }
}

watch(
  () => props.url,
  () => {
    void loadDocument();
  },
  { immediate: true },
);

watch([pageNum, fitMode, userZoom], () => {
  if (!pdfRef.value || loading.value) return;
  void nextTick(() => ensurePageRendered());
});

let ro: ResizeObserver | null = null;
watch(
  viewportRef,
  (el, prev) => {
    if (prev && ro) {
      ro.disconnect();
      ro = null;
    }
    if (!el) return;
    ro = new ResizeObserver(() => {
      if (pdfRef.value && !loading.value) {
        void ensurePageRendered();
      }
    });
    ro.observe(el);
  },
  { flush: 'post' },
);

function goPrev() {
  pageNum.value = Math.max(1, pageNum.value - 1);
}

function goNext() {
  const pdf = pdfRef.value;
  if (!pdf) return;
  pageNum.value = Math.min(pdf.numPages, pageNum.value + 1);
}

function zoomOut() {
  userZoom.value = Math.max(0.5, Math.round(userZoom.value * 20) / 20 - 0.1);
}

function zoomIn() {
  userZoom.value = Math.min(4, Math.round(userZoom.value * 20) / 20 + 0.1);
}

function setFitWidth() {
  fitMode.value = 'width';
  userZoom.value = 1;
}

function setFitPage() {
  fitMode.value = 'page';
  userZoom.value = 1;
}

function openInBrowser() {
  const u = props.downloadUrl?.trim() || props.url?.trim();
  if (!u) return;
  void openExternal(u);
}

async function onOutlineRowClick(row: FlatOutlineRow) {
  const pdf = pdfRef.value;
  if (!pdf) return;
  if (row.url) {
    void openExternal(row.url);
    return;
  }
  const destPage = await outlineDestToPageNumber(pdf, row.dest);
  if (destPage != null) {
    pageNum.value = destPage;
    outlineOpen.value = false;
  }
}

onUnmounted(() => {
  loadGeneration++;
  if (ro) {
    ro.disconnect();
    ro = null;
  }
  void teardownRenderAndDoc().catch(() => {});
});
</script>

<template>
  <div class="pdf-viewer relative flex min-h-0 min-w-0 flex-1 flex-col">
    <div
      class="viewer-btn-group absolute right-4 top-4 z-20 flex items-center gap-0.5 rounded-lg px-1 py-1"
    >
      <button
        v-if="outlineFlat.length > 0"
        type="button"
        class="viewer-icon-btn rounded-full p-2 transition-colors"
        :class="outlineOpen ? 'is-active' : ''"
        :aria-pressed="outlineOpen"
        aria-label="Toggle outline"
        title="Outline"
        @click="outlineOpen = !outlineOpen"
      >
        <svg
          class="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 6h16M4 10h16M4 14h10M4 18h10"
          />
        </svg>
      </button>
      <a
        v-if="downloadUrl"
        :href="downloadUrl"
        class="viewer-icon-btn rounded-full p-2 transition-colors"
        :download="downloadFilename"
        :title="`Download ${documentLabel}`"
        :aria-label="`Download ${documentLabel}`"
        @click.stop
      >
        <svg
          class="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      </a>
      <button
        type="button"
        class="viewer-icon-btn rounded-full p-2 transition-colors"
        title="Open in browser"
        aria-label="Open in browser"
        @click="openInBrowser"
      >
        <svg
          class="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </button>
      <button
        type="button"
        class="viewer-icon-btn rounded-full p-2 transition-colors"
        aria-label="Close"
        title="Close"
        @click="emit('close')"
      >
        <svg
          class="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <div
      class="viewer-counter absolute left-4 top-4 z-20 max-w-[min(50vw,16rem)] truncate px-3 py-1.5 text-sm text-fg"
      :title="documentLabel"
    >
      {{ pageNum }} / {{ numPages || '—' }}
    </div>

    <button
      v-if="canGoPrev && !loading && !loadError"
      type="button"
      class="viewer-nav-btn absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-lg p-3"
      aria-label="Previous page"
      @click="goPrev"
    >
      <svg
        class="h-6 w-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 19l-7-7 7-7"
        />
      </svg>
    </button>

    <button
      v-if="canGoNext && !loading && !loadError"
      type="button"
      class="viewer-nav-btn absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-lg p-3"
      aria-label="Next page"
      @click="goNext"
    >
      <svg
        class="h-6 w-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 5l7 7-7 7"
        />
      </svg>
    </button>

    <div
      v-if="!loading && !loadError"
      class="viewer-zoom-bar absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg px-2 py-1.5 text-fg"
    >
      <button
        type="button"
        class="viewer-icon-btn rounded-lg p-2 transition-colors"
        aria-label="Zoom out"
        @click="zoomOut"
      >
        <svg
          class="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M20 12H4"
          />
        </svg>
      </button>
      <span class="min-w-[3rem] text-center text-sm text-fg-soft"
        >{{ zoomPct }}%</span
      >
      <button
        type="button"
        class="viewer-icon-btn rounded-lg p-2 transition-colors"
        aria-label="Zoom in"
        @click="zoomIn"
      >
        <svg
          class="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 4v16m8-8H4"
          />
        </svg>
      </button>
      <span class="mx-1 h-4 w-px bg-border/60" aria-hidden="true" />
      <button
        type="button"
        class="viewer-fit-btn rounded-md px-2 py-1 text-xs transition-colors"
        :class="fitMode === 'width' ? 'is-active' : ''"
        @click="setFitWidth"
      >
        Width
      </button>
      <button
        type="button"
        class="viewer-fit-btn rounded-md px-2 py-1 text-xs transition-colors"
        :class="fitMode === 'page' ? 'is-active' : ''"
        @click="setFitPage"
      >
        Page
      </button>
    </div>

    <div
      v-if="loading"
      class="flex flex-1 flex-col items-center justify-center gap-2 p-8"
    >
      <div
        class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
      />
      <span class="text-xs text-fg-subtle">Loading PDF…</span>
    </div>
    <div
      v-else-if="loadError"
      class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <p class="max-w-md text-sm text-fg-soft">{{ loadError }}</p>
      <button
        type="button"
        class="viewer-icon-btn rounded-lg px-3 py-2 text-sm"
        @click="openInBrowser"
      >
        Open in browser
      </button>
    </div>
    <div
      v-show="!loading && !loadError"
      ref="viewportRef"
      class="pdf-viewer-viewport min-h-0 flex-1 overflow-auto px-4 pb-20 pt-14 md:px-8 md:pt-16"
    >
      <div class="flex min-h-full items-start justify-center">
        <canvas
          ref="canvasRef"
          class="pdf-viewer-canvas shadow-2xl"
          :class="{ 'opacity-60': pageRendering }"
          :aria-label="canvasAriaLabel"
        />
      </div>
      <div
        v-if="pageRendering"
        class="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div
          class="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent"
        />
      </div>
    </div>

    <aside
      v-if="outlineOpen && outlineFlat.length > 0"
      class="pdf-viewer-outline absolute bottom-20 right-4 top-16 z-20 flex w-[min(18rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border"
    >
      <div
        class="flex shrink-0 items-center justify-between border-b border-border px-3 py-2"
      >
        <span class="text-xs font-semibold uppercase tracking-wide text-fg-soft"
          >Outline</span
        >
        <button
          type="button"
          class="viewer-icon-btn rounded-md p-1"
          aria-label="Close outline"
          @click="outlineOpen = false"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <ul class="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
        <li v-for="(row, idx) in outlineFlat" :key="'o-' + idx">
          <button
            type="button"
            class="viewer-outline-row w-full truncate rounded px-1.5 py-1 text-left"
            :style="{ paddingLeft: `${6 + row.depth * 10}px` }"
            @click="onOutlineRowClick(row)"
          >
            {{ row.title || 'Untitled' }}
          </button>
        </li>
      </ul>
    </aside>
  </div>
</template>

<style scoped>
.pdf-viewer .viewer-btn-group,
.pdf-viewer .viewer-zoom-bar,
.pdf-viewer .viewer-counter,
.pdf-viewer .viewer-nav-btn,
.pdf-viewer .viewer-outline {
  background: var(--vue-auto-069);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  box-shadow: inset 0 1px 0 var(--vue-auto-010);
}

.pdf-viewer .viewer-icon-btn,
.pdf-viewer .viewer-fit-btn,
.pdf-viewer .viewer-outline-row {
  background: transparent;
  border: none;
  color: var(--vue-auto-009);
  transition:
    background 0.15s,
    color 0.15s;
}

.pdf-viewer .viewer-icon-btn:hover,
.pdf-viewer .viewer-fit-btn:hover,
.pdf-viewer .viewer-outline-row:hover {
  background: var(--vue-auto-003);
  color: var(--vue-auto-006);
}

.pdf-viewer .viewer-icon-btn.is-active,
.pdf-viewer .viewer-fit-btn.is-active {
  background: var(--vue-auto-004);
  color: var(--vue-auto-006);
}

.pdf-viewer .viewer-nav-btn {
  border: none;
  color: var(--vue-auto-009);
  transition:
    background 0.15s,
    color 0.15s;
}

.pdf-viewer .viewer-nav-btn:hover {
  background: var(--vue-auto-004);
  color: var(--vue-auto-006);
}

.pdf-viewer-viewport {
  position: relative;
}

.pdf-viewer-canvas {
  display: block;
  max-width: none;
}
</style>
