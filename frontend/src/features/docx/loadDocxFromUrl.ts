import mammoth from 'mammoth';
import DOMPurify from 'dompurify';
import { attachmentUrlNeedsCredentials } from '@/features/attachments/resolveAttachmentFetchCredentials';
import { withTimeout } from '@/features/pdf/withTimeout';

const DOCX_FETCH_TIMEOUT_MS = 45_000;
const DOCX_CONVERT_TIMEOUT_MS = 30_000;

const DOCX_SANITIZE_OPTS = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ['target', 'rel'],
};

export function docxLoadErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return 'Could not load this document.';
}

async function fetchDocxArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await withTimeout(
    fetch(url, {
      credentials: attachmentUrlNeedsCredentials(url)
        ? 'include'
        : 'same-origin',
    }),
    DOCX_FETCH_TIMEOUT_MS,
    'Document download',
  );
  if (!res.ok) {
    throw new Error(`Document download failed (${res.status})`);
  }
  return res.arrayBuffer();
}

/**
 * Fetch a `.docx` from URL and convert to sanitized HTML for in-app preview.
 */
export async function loadDocxHtmlFromUrl(url: string): Promise<string> {
  const buffer = await fetchDocxArrayBuffer(url);
  const result = await withTimeout(
    mammoth.convertToHtml({ arrayBuffer: buffer }),
    DOCX_CONVERT_TIMEOUT_MS,
    'Document conversion',
  );
  const raw = result.value?.trim() ?? '';
  if (!raw) {
    throw new Error('This document appears to be empty.');
  }
  return String(DOMPurify.sanitize(raw, DOCX_SANITIZE_OPTS));
}
