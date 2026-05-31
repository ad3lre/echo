import { GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { ensurePdfEnvironmentPolyfills } from './ensurePdfEnvironment';

let configured = false;

export function ensurePdfWorkerConfigured(): void {
  if (configured) return;
  ensurePdfEnvironmentPolyfills();
  GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  configured = true;
}
