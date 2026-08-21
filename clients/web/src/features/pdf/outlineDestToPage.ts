import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Resolve an outline/bookmark destination to a 1-based page number, if possible.
 */
export async function outlineDestToPageNumber(
  pdf: PDFDocumentProxy,
  dest: string | unknown[] | null | undefined,
): Promise<number | null> {
  if (dest == null) return null;
  try {
    let explicit: unknown = dest;
    if (typeof dest === 'string') {
      explicit = await pdf.getDestination(dest);
    }
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const first = explicit[0];
    if (typeof first === 'number' && Number.isFinite(first)) {
      return first + 1;
    }
    const pageIndex = await pdf.getPageIndex(first as never);
    return pageIndex + 1;
  } catch {
    return null;
  }
}
