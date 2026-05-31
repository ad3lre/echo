import {
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import { attachmentUrlNeedsCredentials } from '@/features/attachments/resolveAttachmentFetchCredentials';
import { ensurePdfWorkerConfigured } from './configurePdfWorker';
import { withTimeout } from './withTimeout';

const PDF_LOAD_TIMEOUT_MS = 45_000;

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
    withCredentials: attachmentUrlNeedsCredentials(url),
  });
  return {
    task,
    promise: withTimeout(task.promise, PDF_LOAD_TIMEOUT_MS, 'PDF load'),
  };
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
