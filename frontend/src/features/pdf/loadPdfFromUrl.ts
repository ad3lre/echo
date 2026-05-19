import {
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import { ensurePdfWorkerConfigured } from './configurePdfWorker';

export type PdfUrlLoader = {
  task: PDFDocumentLoadingTask;
  promise: Promise<PDFDocumentProxy>;
};

/**
 * Begin loading a PDF from a URL (https/blob/data). Caller must dispose via
 * {@link destroyPdfLoad} when finished (or on unmount).
 */
export function startPdfUrlLoad(url: string): PdfUrlLoader {
  ensurePdfWorkerConfigured();
  const task = getDocument({
    url,
    withCredentials: false,
  });
  return { task, promise: task.promise };
}

/**
 * Destroy an in-flight load or a fully loaded document.
 */
export async function destroyPdfLoad(
  task: PDFDocumentLoadingTask | null,
  doc: PDFDocumentProxy | undefined,
): Promise<void> {
  if (doc) {
    await doc.destroy().catch(() => {});
    return;
  }
  if (task) {
    await task.destroy().catch(() => {});
  }
}
