export type PaperDocumentImage = {
  src: string;
  blockId?: string;
};

function walkNode(node: unknown, out: PaperDocumentImage[]): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  const type = n.type;
  if (type === 'image') {
    const attrs = n.attrs as Record<string, unknown> | undefined;
    const src = typeof attrs?.src === 'string' ? attrs.src.trim() : '';
    if (src) {
      out.push({
        src,
        blockId:
          typeof attrs?.paperBlockId === 'string'
            ? attrs.paperBlockId.trim()
            : undefined,
      });
    }
  }
  const content = n.content;
  if (Array.isArray(content)) {
    for (const child of content) walkNode(child, out);
  }
}

/** Collect unique image URLs from paper content JSON (document order preserved). */
export function extractPaperDocumentImages(
  doc: Record<string, unknown> | null | undefined,
): PaperDocumentImage[] {
  if (!doc) return [];
  const raw: PaperDocumentImage[] = [];
  walkNode(doc, raw);
  const seen = new Set<string>();
  const out: PaperDocumentImage[] = [];
  for (const img of raw) {
    if (seen.has(img.src)) continue;
    seen.add(img.src);
    out.push(img);
  }
  return out;
}
