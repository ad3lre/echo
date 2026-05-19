/**
 * Heuristic: PDF.js loads cross-origin bytes via fetch; missing GET CORS on the
 * object host surfaces as a failed network request, not a PDF parse error.
 */
export function isProbablyPdfCorsError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err && typeof err.name === 'string' ? err.name : '';
  const message =
    'message' in err && typeof err.message === 'string' ? err.message : '';
  const combined = `${name} ${message}`.toLowerCase();
  if (combined.includes('failed to fetch')) return true;
  if (combined.includes('networkerror')) return true;
  if (combined.includes('load failed')) return true;
  if (combined.includes('network request failed')) return true;
  if (combined.includes('access control')) return true;
  if (name === 'TypeError' && message.includes('fetch')) return true;
  return false;
}

export function pdfLoadErrorMessage(err: unknown): string {
  if (isProbablyPdfCorsError(err)) {
    return 'This PDF is hosted on a different domain that does not allow your browser to read it (missing CORS on GET). Ask the admin to add your app origin to the file bucket’s CORS policy, or use Download / Open.';
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return 'Could not load this PDF.';
}
