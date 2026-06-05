import type { PaperColorSwatch } from '@/features/paper/components/PaperColorPickerPanel.vue';

function normalizeHex(hex: string): string | null {
  const raw = hex.trim().replace('#', '');
  const norm =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(norm)) return null;
  return `#${norm.toLowerCase()}`;
}

function pushUniqueHex(set: Set<string>, value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return;
  const norm = normalizeHex(value);
  if (norm) set.add(norm);
}

function walkMarks(marks: unknown, text: Set<string>, highlight: Set<string>) {
  if (!Array.isArray(marks)) return;
  for (const mark of marks) {
    if (!mark || typeof mark !== 'object') continue;
    const m = mark as Record<string, unknown>;
    const type = m.type;
    const attrs = m.attrs as Record<string, unknown> | undefined;
    if (type === 'textStyle') pushUniqueHex(text, attrs?.color);
    if (type === 'highlight') pushUniqueHex(highlight, attrs?.color);
  }
}

function walkNode(
  node: unknown,
  text: Set<string>,
  highlight: Set<string>,
  object: Set<string>,
): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  if (n.type === 'paperShape') {
    const attrs = n.attrs as Record<string, unknown> | undefined;
    pushUniqueHex(object, attrs?.fill);
  }
  walkMarks(n.marks, text, highlight);
  const content = n.content;
  if (Array.isArray(content)) {
    for (const child of content) walkNode(child, text, highlight, object);
  }
}

function toSwatches(colors: Set<string>): PaperColorSwatch[] {
  return [...colors].map((value) => ({ label: value, value }));
}

export type PaperDocumentColorBuckets = {
  text: PaperColorSwatch[];
  highlight: PaperColorSwatch[];
  object: PaperColorSwatch[];
  page: PaperColorSwatch[];
};

/** Unique text, highlight, and page colors used in a paper document. */
export function extractPaperDocumentColors(
  doc: Record<string, unknown> | null | undefined,
): PaperDocumentColorBuckets {
  const text = new Set<string>();
  const highlight = new Set<string>();
  const object = new Set<string>();
  const page = new Set<string>();

  if (doc && typeof doc === 'object') {
    const attrs = doc.attrs as Record<string, unknown> | undefined;
    pushUniqueHex(page, attrs?.paperPageColorLight);
    pushUniqueHex(page, attrs?.paperPageColorDark);
    walkNode(doc, text, highlight, object);
  }

  return {
    text: toSwatches(text),
    highlight: toSwatches(highlight),
    object: toSwatches(object),
    page: toSwatches(page),
  };
}
