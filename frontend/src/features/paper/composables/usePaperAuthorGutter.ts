import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  type Ref,
  type ShallowRef,
} from 'vue';
import type { Editor } from '@tiptap/core';
import { createRafCoalescer } from '@/utils/rafCoalesce';
import {
  computePaperAuthorSegments,
  type PaperAuthorSegment,
} from '@/features/paper/composables/computePaperAuthorSegments';

export type PaperGutterRow = {
  paperBlockId: string;
  authorId: string;
  coAuthorIds?: string[];
  lastEditedAt?: string;
  top: number;
  height: number;
};

export type { PaperAuthorSegment };

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'image',
  'table',
  'horizontalRule',
]);

export function usePaperAuthorGutter(opts: {
  editor: ShallowRef<Editor | null>;
  scrollRoot: Ref<HTMLElement | null>;
  enabled: Ref<boolean>;
}) {
  const rows = ref<PaperGutterRow[]>([]);
  let scheduleMeasure: (() => void) | null = null;

  function measureNow() {
    const ed = opts.editor.value;
    const root = opts.scrollRoot.value;
    if (!ed || !root || !opts.enabled.value) {
      rows.value = [];
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const next: PaperGutterRow[] = [];
    ed.state.doc.forEach((node, offset) => {
      if (!BLOCK_TYPES.has(node.type.name)) return;
      const id = String(node.attrs.paperBlockId ?? '').trim();
      if (!id) return;
      const dom = ed.view.nodeDOM(offset);
      if (!(dom instanceof HTMLElement)) return;
      const rect = dom.getBoundingClientRect();
      const rawCo = node.attrs.coAuthorIds;
      const coAuthorIds = Array.isArray(rawCo)
        ? rawCo
            .map((v) => (typeof v === 'string' ? v.trim() : ''))
            .filter(Boolean)
            .slice(0, 2)
        : undefined;
      next.push({
        paperBlockId: id,
        authorId: String(node.attrs.authorId ?? ''),
        ...(coAuthorIds && coAuthorIds.length >= 2 ? { coAuthorIds } : {}),
        lastEditedAt:
          typeof node.attrs.lastEditedAt === 'string'
            ? node.attrs.lastEditedAt
            : undefined,
        top: rect.top - rootRect.top + root.scrollTop,
        height: rect.height,
      });
    });
    rows.value = next;
  }

  function measure() {
    scheduleMeasure?.();
  }

  let ro: ResizeObserver | null = null;

  onMounted(() => {
    scheduleMeasure = createRafCoalescer(measureNow);
    ro = new ResizeObserver(() => measure());
    if (opts.scrollRoot.value) ro.observe(opts.scrollRoot.value);
    measureNow();
  });

  onUnmounted(() => {
    ro?.disconnect();
  });

  const rowsByBlockId = computed(() => {
    const m = new Map<string, PaperGutterRow>();
    for (const r of rows.value) m.set(r.paperBlockId, r);
    return m;
  });

  const segments = computed(() => computePaperAuthorSegments(rows.value));

  return { rows, segments, rowsByBlockId, measure };
}

export function paperAuthorColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `hsl(${hue} 55% 55%)`;
}
