<script setup lang="ts">
import {
  ref,
  shallowRef,
  watch,
  onUnmounted,
  nextTick,
  computed,
} from 'vue';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist';
import { destroyPdfLoad, startPdfUrlLoad } from '@/features/pdf/loadPdfFromUrl';
import { renderPdfPageToCanvas } from '@/features/pdf/renderPdfPage';
import { outlineDestToPageNumber } from '@/features/pdf/outlineDestToPage';
import { pdfLoadErrorMessage } from '@/features/pdf/isProbablyPdfCorsError';

/** Mirrors pdf.js structure tree nodes (not exported from `pdfjs-dist` entry). */
type StructTreeNode = {
  role: string;
  children?: Array<StructTreeNode | StructTreeContent>;
};
type StructTreeContent = {
  type: string;
  id: string;
};

const props = defineProps<{
  url: string;
  /** Accessible label (usually filename). */
  documentLabel: string;
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
const loadError = ref<string | null>(null);

const pdfRef = shallowRef<PDFDocumentProxy | null>(null);
const numPages = ref(0);
const outlineFlat = shallowRef<FlatOutlineRow[]>([]);

const pageNum = ref(1);
const pageInput = ref('1');

const fitMode = ref<'width' | 'page'>('width');
const userZoom = ref(1);

const sidebarOpen = ref(true);
const sidebarTab = ref<'outline' | 'structure'>('outline');

const structLoading = ref(false);
const structError = ref<string | null>(null);
const structLines = ref<{ text: string; depth: number }[]>([]);

let loadGeneration = 0;
let activeTask: PDFDocumentLoadingTask | null = null;
let activeRender: RenderTask | null = null;

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

function flattenStructTree(
  node: StructTreeNode | null,
  depth: number,
): { text: string; depth: number }[] {
  if (!node) return [];
  const rows: { text: string; depth: number }[] = [
    { text: node.role || 'Element', depth },
  ];
  for (const ch of node.children ?? []) {
    if ('role' in ch && (ch as StructTreeNode).role != null) {
      rows.push(...flattenStructTree(ch as StructTreeNode, depth + 1));
    } else {
      const c = ch as StructTreeContent;
      const bit =
        c.type === 'content' || c.type === 'object'
          ? `${c.type}${c.id ? ` · ${c.id}` : ''}`
          : String(c.type ?? 'item');
      rows.push({ text: bit, depth: depth + 1 });
    }
  }
  return rows;
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
  loadError.value = null;
  outlineFlat.value = [];
  structLines.value = [];
  pageNum.value = 1;
  pageInput.value = '1';

  const { task, promise } = startPdfUrlLoad(url);
  activeTask = task;

  try {
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
    await renderCurrentPage();
  } catch (e) {
    if (gen !== loadGeneration) return;
    await destroyPdfLoad(task, undefined).catch(() => {});
    activeTask = null;
    loadError.value = pdfLoadErrorMessage(e);
    loading.value = false;
  }
}

async function renderCurrentPage() {
  const pdf = pdfRef.value;
  const canvas = canvasRef.value;
  const wrap = viewportRef.value;
  if (!pdf || !canvas || !wrap) return;

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
  pageInput.value = String(p);

  const pad = 16;
  const cw = Math.max(80, wrap.clientWidth - pad);
  const ch = Math.max(80, wrap.clientHeight - pad);

  try {
    const page = await pdf.getPage(p);
    if (gen !== loadGeneration) return;
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
    if (gen !== loadGeneration) return;
    activeRender = null;
  } catch (e) {
    if (gen !== loadGeneration) return;
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.toLowerCase().includes('rendering cancelled')) {
      loadError.value = msg || 'Render failed.';
    }
  }
}

async function loadStructForPage() {
  const pdf = pdfRef.value;
  if (!pdf) return;
  structLoading.value = true;
  structError.value = null;
  structLines.value = [];
  try {
    const p = Math.min(Math.max(1, pageNum.value), pdf.numPages);
    const page = await pdf.getPage(p);
    const tree = (await page.getStructTree()) as StructTreeNode | null;
    structLines.value = flattenStructTree(tree, 0);
  } catch (e) {
    structError.value =
      e instanceof Error ? e.message : 'Could not read structure tree.';
  } finally {
    structLoading.value = false;
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
  void nextTick(() => renderCurrentPage());
});

watch(sidebarTab, (tab) => {
  if (tab === 'structure') void loadStructForPage();
});

watch(pageNum, () => {
  if (sidebarTab.value === 'structure') void loadStructForPage();
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
        void renderCurrentPage();
      }
    });
    ro.observe(el);
  },
  { flush: 'post' },
);

const canvasAriaLabel = computed(
  () => `${props.documentLabel}, page ${pageNum.value} of ${numPages.value || '?'}`,
);

function clampPageInput() {
  const pdf = pdfRef.value;
  if (!pdf) return;
  const raw = parseInt(pageInput.value, 10);
  if (!Number.isFinite(raw)) {
    pageInput.value = String(pageNum.value);
    return;
  }
  pageNum.value = Math.min(Math.max(1, raw), pdf.numPages);
  pageInput.value = String(pageNum.value);
}

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

async function onOutlineRowClick(row: FlatOutlineRow) {
  const pdf = pdfRef.value;
  if (!pdf) return;
  if (row.url) {
    window.open(row.url, '_blank', 'noopener,noreferrer');
    return;
  }
  const destPage = await outlineDestToPageNumber(pdf, row.dest);
  if (destPage != null) {
    pageNum.value = destPage;
    pageInput.value = String(destPage);
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
  <div class="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
    <div class="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#1e1e22]">
      <div
        class="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-glass-1 px-2 py-1.5"
      >
        <button
          type="button"
          class="chat-focus-ring rounded border border-border bg-glass-2 px-2 py-1 text-xs text-fg-soft hover:bg-glass-hover"
          :disabled="pageNum <= 1 || !pdfRef"
          @click="goPrev"
        >
          Prev
        </button>
        <button
          type="button"
          class="chat-focus-ring rounded border border-border bg-glass-2 px-2 py-1 text-xs text-fg-soft hover:bg-glass-hover"
          :disabled="!pdfRef || pageNum >= numPages"
          @click="goNext"
        >
          Next
        </button>
        <label class="flex items-center gap-1 text-xs text-fg-subtle">
          Page
          <input
            v-model="pageInput"
            type="text"
            inputmode="numeric"
            class="w-12 rounded border border-border bg-glass-2 px-1 py-0.5 text-center text-xs text-fg"
            @change="clampPageInput"
            @keydown.enter.prevent="clampPageInput"
          />
          <span class="text-fg-subtle">/ {{ numPages || '—' }}</span>
        </label>
        <span class="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        <button
          type="button"
          class="chat-focus-ring rounded border border-border bg-glass-2 px-2 py-1 text-xs text-fg-soft hover:bg-glass-hover"
          :disabled="!pdfRef"
          @click="zoomOut"
        >
          −
        </button>
        <button
          type="button"
          class="chat-focus-ring rounded border border-border bg-glass-2 px-2 py-1 text-xs text-fg-soft hover:bg-glass-hover"
          :disabled="!pdfRef"
          @click="zoomIn"
        >
          +
        </button>
        <button
          type="button"
          class="chat-focus-ring rounded border px-2 py-1 text-xs transition-colors"
          :class="
            fitMode === 'width'
              ? 'border-accent bg-accent/20 text-fg'
              : 'border-border bg-glass-2 text-fg-soft hover:bg-glass-hover'
          "
          @click="setFitWidth"
        >
          Fit width
        </button>
        <button
          type="button"
          class="chat-focus-ring rounded border px-2 py-1 text-xs transition-colors"
          :class="
            fitMode === 'page'
              ? 'border-accent bg-accent/20 text-fg'
              : 'border-border bg-glass-2 text-fg-soft hover:bg-glass-hover'
          "
          @click="setFitPage"
        >
          Fit page
        </button>
        <button
          type="button"
          class="chat-focus-ring ml-auto rounded border border-border bg-glass-2 px-2 py-1 text-xs text-fg-soft hover:bg-glass-hover md:ml-0"
          @click="sidebarOpen = !sidebarOpen"
        >
          {{ sidebarOpen ? 'Hide' : 'Show' }} panel
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
      </div>
      <div
        v-else
        ref="viewportRef"
        class="flex min-h-0 flex-1 items-start justify-center overflow-auto p-2"
      >
        <canvas
          ref="canvasRef"
          class="shadow-lg"
          :aria-label="canvasAriaLabel"
        />
      </div>
    </div>

    <aside
      v-if="sidebarOpen"
      class="flex max-h-[40vh] w-full shrink-0 flex-col border-t border-border bg-glass-1 md:max-h-none md:w-72 md:border-l md:border-t-0"
    >
      <div class="flex shrink-0 border-b border-border">
        <button
          type="button"
          class="chat-focus-ring flex-1 px-2 py-2 text-xs font-semibold transition-colors"
          :class="
            sidebarTab === 'outline'
              ? 'border-b-2 border-accent text-fg'
              : 'text-fg-subtle hover:text-fg'
          "
          @click="sidebarTab = 'outline'"
        >
          Outline
        </button>
        <button
          type="button"
          class="chat-focus-ring flex-1 px-2 py-2 text-xs font-semibold transition-colors"
          :class="
            sidebarTab === 'structure'
              ? 'border-b-2 border-accent text-fg'
              : 'text-fg-subtle hover:text-fg'
          "
          @click="sidebarTab = 'structure'"
        >
          Structure
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <template v-if="sidebarTab === 'outline'">
          <p
            v-if="outlineFlat.length === 0"
            class="text-xs leading-relaxed text-fg-subtle"
          >
            No bookmarks/outline in this file.
          </p>
          <ul v-else class="space-y-0.5 text-xs">
            <li v-for="(row, idx) in outlineFlat" :key="'o-' + idx">
              <button
                type="button"
                class="chat-focus-ring w-full truncate rounded px-1 py-0.5 text-left text-fg hover:bg-glass-hover"
                :style="{ paddingLeft: `${4 + row.depth * 10}px` }"
                @click="onOutlineRowClick(row)"
              >
                {{ row.title || 'Untitled' }}
              </button>
            </li>
          </ul>
        </template>
        <template v-else>
          <p class="mb-2 text-[10px] uppercase tracking-wide text-fg-subtle">
            Tagged structure for page {{ pageNum }} (many PDFs have none).
          </p>
          <div
            v-if="structLoading"
            class="flex justify-center py-4"
          >
            <div
              class="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent"
            />
          </div>
          <p
            v-else-if="structError"
            class="text-xs text-red-400/90"
          >
            {{ structError }}
          </p>
          <p
            v-else-if="structLines.length === 0"
            class="text-xs text-fg-subtle"
          >
            No structure tree for this page.
          </p>
          <ul v-else class="space-y-0.5 font-mono text-[11px] text-fg-soft">
            <li
              v-for="(row, i) in structLines"
              :key="'s-' + i"
              :style="{ paddingLeft: `${row.depth * 10}px` }"
            >
              {{ row.text }}
            </li>
          </ul>
        </template>
      </div>
    </aside>
  </div>
</template>
