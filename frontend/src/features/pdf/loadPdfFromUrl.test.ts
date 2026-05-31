import { afterEach, describe, expect, it, vi } from 'vitest';

const getDocumentMock = vi.hoisted(() => vi.fn());

vi.mock('pdfjs-dist', () => ({
  getDocument: getDocumentMock,
}));

vi.mock('./configurePdfWorker', () => ({
  ensurePdfWorkerConfigured: vi.fn(),
}));

import { startPdfUrlLoad } from './loadPdfFromUrl';

describe('startPdfUrlLoad', () => {
  afterEach(() => {
    getDocumentMock.mockReset();
  });

  it('rejects on the returned promise when getDocument throws synchronously', async () => {
    getDocumentMock.mockImplementation(() => {
      throw new TypeError('Promise.withResolvers is not a function');
    });

    const { task, promise } = startPdfUrlLoad('https://example.com/a.pdf');
    expect(task).toBeNull();
    await expect(promise).rejects.toThrow(/withResolvers/i);
  });
});
