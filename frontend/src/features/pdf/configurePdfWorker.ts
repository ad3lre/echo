import { GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';

let configured = false;

export function ensurePdfWorkerConfigured(): void {
  if (configured) return;
  GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  configured = true;
}
