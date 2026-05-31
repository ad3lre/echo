import {
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import { attachmentUrlNeedsCredentials } from '@/features/attachments/resolveAttachmentFetchCredentials';
import { ensurePdfWorkerConfigured } from './configurePdfWorker';
import { ensurePdfEnvironmentPolyfills } from './ensurePdfEnvironment';
import { withTimeout } from './withTimeout';

const PDF_LOAD_TIMEOUT_MS = 45_000;

export type PdfUrlLoader = {
  task: PDFDocumentLoadingTask | null;
  promise: Promise<PDFDocumentProxy>;
};

/**
 * Begin loading a PDF from a URL (https/blob/data). Caller must dispose via
 * {@link destroyPdfLoad} when finished (or on unmount).
 *
 * Never throws synchronously — failures surface on {@link PdfUrlLoader.promise}.
 */
export function startPdfUrlLoad(url: string): PdfUrlLoader {
  ensurePdfEnvironmentPolyfills();
  ensurePdfWorkerConfigured();
  try {
    const task = getDocument({
      url,
      withCredentials: attachmentUrlNeedsCredentials(url),
    });
    return {
      task,
      promise: withTimeout(task.promise, PDF_LOAD_TIMEOUT_MS, 'PDF load'),
    };
  } catch (e) {
    return {
      task: null,
      promise: Promise.reject(e),
    };
  }
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
